/**
 * CerebreX MEMEX — CLI Commands
 * Persistent agent memory: set, get, list, delete, clear
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { MemexEngine } from '../core/memex/engine.js';
import { MemexError, MemoryIntegrityError } from '@cerebrex/core';
import type { MemoryType } from '@cerebrex/types';

const VALID_TYPES: MemoryType[] = ['episodic', 'semantic', 'working'];

function parseValue(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}

function formatValue(value: unknown): string {
  const str = JSON.stringify(value);
  return str.length > 80 ? str.slice(0, 77) + '…' : str;
}

export const memexCommand = new Command('memex')
  .description('Persistent agent memory — store and retrieve key-value data across sessions');

// ── cerebrex memex set <key> <value> ─────────────────────────────────────────
memexCommand
  .command('set <key> <value>')
  .description('Store a value in agent memory')
  .option('-n, --namespace <ns>', 'Memory namespace', 'default')
  .option('-t, --type <type>', `Memory type: ${VALID_TYPES.join(' | ')}`, 'episodic')
  .option('--ttl <seconds>', 'Time-to-live in seconds (entry auto-expires after this)')
  .action((key: string, value: string, options) => {
    if (!VALID_TYPES.includes(options.type as MemoryType)) {
      console.error(chalk.red(`\n  Invalid type '${options.type}'. Choose: ${VALID_TYPES.join(', ')}\n`));
      process.exit(1);
    }

    const ttl = options.ttl ? parseInt(options.ttl, 10) : undefined;
    if (ttl !== undefined && (isNaN(ttl) || ttl <= 0)) {
      console.error(chalk.red('\n  --ttl must be a positive integer (seconds)\n'));
      process.exit(1);
    }

    try {
      const engine = new MemexEngine();
      const entry = engine.set(key, parseValue(value), {
        namespace: options.namespace as string,
        type: options.type as MemoryType,
        ...(ttl !== undefined ? { ttlSeconds: ttl } : {}),
      });

      console.log(chalk.green('\n  ✅ Stored'));
      console.log(chalk.dim(`     key:       `) + chalk.white(entry.key));
      console.log(chalk.dim(`     namespace: `) + chalk.white(entry.namespace));
      console.log(chalk.dim(`     type:      `) + chalk.white(entry.type));
      console.log(chalk.dim(`     checksum:  `) + chalk.dim(entry.checksum.slice(0, 16) + '…'));
      if (entry.expiresAt) {
        console.log(chalk.dim(`     expires:   `) + chalk.yellow(entry.expiresAt));
      }
      console.log('');
    } catch (err) {
      console.error(chalk.red(`\n  Error: ${(err as MemexError).userMessage ?? (err as Error).message}\n`));
      process.exit(1);
    }
  });

// ── cerebrex memex get <key> ──────────────────────────────────────────────────
memexCommand
  .command('get <key>')
  .description('Retrieve a value from agent memory')
  .option('-n, --namespace <ns>', 'Memory namespace', 'default')
  .option('--json', 'Output raw JSON entry')
  .action((key: string, options) => {
    try {
      const engine = new MemexEngine();
      const entry = engine.get(key, options.namespace);

      if (!entry) {
        console.log(chalk.yellow(`\n  Key '${key}' not found in namespace '${options.namespace}'\n`));
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(entry, null, 2));
        return;
      }

      console.log(chalk.cyan(`\n  ${chalk.bold(entry.key)}`));
      console.log(chalk.dim('  namespace: ') + entry.namespace);
      console.log(chalk.dim('  type:      ') + entry.type);
      console.log(chalk.dim('  value:     ') + chalk.white(JSON.stringify(entry.value, null, 2)));
      console.log(chalk.dim('  created:   ') + entry.createdAt);
      if (entry.expiresAt) console.log(chalk.dim('  expires:   ') + chalk.yellow(entry.expiresAt));
      console.log('');
    } catch (err) {
      if (err instanceof MemoryIntegrityError) {
        console.error(chalk.red(`\n  ⚠ Integrity violation: ${(err as MemoryIntegrityError).userMessage}\n`));
        process.exit(2);
      }
      console.error(chalk.red(`\n  Error: ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

// ── cerebrex memex list ───────────────────────────────────────────────────────
memexCommand
  .command('list')
  .description('List stored memory entries')
  .option('-n, --namespace <ns>', 'Filter by namespace')
  .option('-t, --type <type>', `Filter by type: ${VALID_TYPES.join(' | ')}`)
  .action((options) => {
    try {
      const engine = new MemexEngine();
      const entries = engine.list(options.namespace, options.type as MemoryType | undefined);

      if (entries.length === 0) {
        console.log(chalk.dim('\n  No memory entries found.\n'));
        return;
      }

      console.log(chalk.cyan(`\n  MEMEX — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}\n`));

      // Group by namespace for display
      const grouped: Record<string, typeof entries> = {};
      for (const e of entries) {
        (grouped[e.namespace] ??= []).push(e);
      }

      for (const [ns, nsEntries] of Object.entries(grouped)) {
        console.log(chalk.bold(`  [${ns}]`));
        for (const e of nsEntries) {
          const expires = e.expiresAt ? chalk.yellow(` exp:${e.expiresAt.slice(0, 10)}`) : '';
          console.log(
            `    ${chalk.cyan(e.key.padEnd(28))} ` +
            `${chalk.dim(e.type.padEnd(10))} ` +
            `${chalk.gray(formatValue(e.value))}${expires}`
          );
        }
        console.log('');
      }
    } catch (err) {
      console.error(chalk.red(`\n  Error: ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

// ── cerebrex memex delete <key> ───────────────────────────────────────────────
memexCommand
  .command('delete <key>')
  .description('Delete a memory entry')
  .option('-n, --namespace <ns>', 'Memory namespace', 'default')
  .action((key: string, options) => {
    try {
      const engine = new MemexEngine();
      const deleted = engine.delete(key, options.namespace);
      if (deleted) {
        console.log(chalk.green(`\n  Deleted '${key}' from namespace '${options.namespace}'\n`));
      } else {
        console.log(chalk.yellow(`\n  Key '${key}' not found in namespace '${options.namespace}'\n`));
      }
    } catch (err) {
      console.error(chalk.red(`\n  Error: ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

// ── cerebrex memex clear ──────────────────────────────────────────────────────
memexCommand
  .command('clear')
  .description('Clear all memory entries (or a specific namespace)')
  .option('-n, --namespace <ns>', 'Clear only this namespace')
  .option('--confirm', 'Skip the confirmation prompt')
  .action(async (options) => {
    const scope = options.namespace ? `namespace '${options.namespace}'` : 'all namespaces';

    if (!options.confirm) {
      const { default: inquirer } = await import('inquirer');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { ok } = await (inquirer as any).prompt([{
        type: 'confirm',
        name: 'ok',
        message: `Clear all memory in ${scope}? This cannot be undone.`,
        default: false,
      }]);
      if (!ok) {
        console.log(chalk.dim('\n  Aborted.\n'));
        return;
      }
    }

    try {
      const engine = new MemexEngine();
      const count = engine.clear(options.namespace);
      console.log(chalk.green(`\n  Cleared ${count} entr${count === 1 ? 'y' : 'ies'} from ${scope}\n`));
    } catch (err) {
      console.error(chalk.red(`\n  Error: ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

// ── cerebrex memex namespaces ─────────────────────────────────────────────────
memexCommand
  .command('namespaces')
  .description('List all memory namespaces')
  .action(() => {
    const engine = new MemexEngine();
    const nsList = engine.namespaces();
    if (nsList.length === 0) {
      console.log(chalk.dim('\n  No namespaces found. Use `cerebrex memex set` to create one.\n'));
      return;
    }
    console.log(chalk.cyan('\n  MEMEX Namespaces\n'));
    nsList.forEach((ns) => console.log(`    ${chalk.bold(ns)}`));
    console.log('');
  });
