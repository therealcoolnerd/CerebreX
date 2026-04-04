#!/usr/bin/env node
/**
 * CerebreX CLI
 * The open-source Agent Infrastructure OS
 *
 * © 2026 A Real Cool Co. — Apache 2.0 License
 * https://therealcool.site
 */

import { Command } from 'commander';
import chalk from 'chalk';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { buildCommand } from './commands/build.js';

import { traceCommand } from './commands/trace.js';

import { deployCommand, validateCommand, publishCommand, installCommand, deprecateCommand, configureCommand } from './commands/other-commands.js';
import { memexCommand } from './commands/memex.js';
import { authCommand } from './commands/auth.js';
import { hiveCommand } from './commands/hive.js';

const VERSION = '0.9.0';

const program = new Command();

// ── Brand Header ──────────────────────────────────────────────────────────────
const header = `
${chalk.cyan('  ██████╗███████╗██████╗ ███████╗██████╗ ██████╗ ███████╗██╗  ██╗')}
${chalk.cyan(' ██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝╚██╗██╔╝')}
${chalk.cyan(' ██║     █████╗  ██████╔╝█████╗  ██████╔╝██████╔╝█████╗   ╚███╔╝ ')}
${chalk.cyan(' ██║     ██╔══╝  ██╔══██╗██╔══╝  ██╔══██╗██╔══██╗██╔══╝   ██╔██╗ ')}
${chalk.cyan(' ╚██████╗███████╗██║  ██║███████╗██████╔╝██║  ██║███████╗██╔╝ ██╗')}
${chalk.cyan('  ╚═════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝')}
${chalk.gray('  Agent Infrastructure OS')} ${chalk.dim(`v${VERSION}`)}  ${chalk.dim('by')} ${chalk.hex('#F5A623')('A Real Cool Co.')}
`;

// ── Program Setup ─────────────────────────────────────────────────────────────
program
  .name('cerebrex')
  .description('The open-source Agent Infrastructure OS')
  .version(VERSION, '-v, --version', 'Output the current version')
  .addHelpText('before', header)
  .hook('preAction', () => {
    // Telemetry notice on first run (opt-out available)
    // checkTelemetryConsent();
  });

// ── Register Commands ─────────────────────────────────────────────────────────
program.addCommand(buildCommand);
program.addCommand(deployCommand);
program.addCommand(traceCommand);
program.addCommand(validateCommand);
program.addCommand(publishCommand);
program.addCommand(installCommand);
program.addCommand(configureCommand);
program.addCommand(deprecateCommand);
program.addCommand(memexCommand);
program.addCommand(authCommand);
program.addCommand(hiveCommand);

// ── Handle Unknown Commands ───────────────────────────────────────────────────
program.on('command:*', (operands) => {
  console.error(chalk.red(`\nUnknown command: ${operands[0]}`));
  console.error(chalk.dim('Run cerebrex --help to see available commands.\n'));
  process.exit(1);
});

// ── Update check (cached, non-blocking) ──────────────────────────────────────
const UPDATE_CACHE = path.join(os.homedir(), '.cerebrex', 'update-check.json');
const UPDATE_TTL_MS = 86_400_000; // 24 hours

function showUpdateNotice(): void {
  try {
    if (!fs.existsSync(UPDATE_CACHE)) { void refreshUpdateCache(); return; }
    const cache = JSON.parse(fs.readFileSync(UPDATE_CACHE, 'utf-8')) as { version?: string; checkedAt?: number };
    if (!cache.checkedAt || Date.now() - cache.checkedAt > UPDATE_TTL_MS) { void refreshUpdateCache(); return; }
    const latest = cache.version;
    if (!latest || latest === VERSION) return;
    const [lM = 0, lm = 0, lp = 0] = latest.split('.').map(Number);
    const [cM = 0, cm = 0, cp = 0] = VERSION.split('.').map(Number);
    const newer = lM > cM || (lM === cM && lm > cm) || (lM === cM && lm === cm && lp > cp);
    if (newer) {
      console.log(chalk.yellow(`\n  Update available: ${chalk.bold(`v${latest}`)} (current: v${VERSION})`));
      console.log(chalk.dim('  Run: npm install -g cerebrex\n'));
    }
  } catch { /* never block */ }
}

async function refreshUpdateCache(): Promise<void> {
  try {
    const res = await fetch('https://registry.npmjs.org/cerebrex/latest', {
      headers: { 'User-Agent': `cerebrex/${VERSION}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return;
    const data = await res.json() as { version?: string };
    if (!data.version) return;
    fs.mkdirSync(path.dirname(UPDATE_CACHE), { recursive: true });
    fs.writeFileSync(UPDATE_CACHE, JSON.stringify({ version: data.version, checkedAt: Date.now() }));
  } catch { /* best-effort */ }
}

showUpdateNotice();

// ── Parse ─────────────────────────────────────────────────────────────────────
program.parse(process.argv);

// Show help if no command given
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
