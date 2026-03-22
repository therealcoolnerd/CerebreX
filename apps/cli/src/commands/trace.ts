import { Command } from 'commander';
import chalk from 'chalk';
import { startTraceServer } from '../core/trace/server.js';
import { TraceViewer } from '../core/trace/viewer.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

const TRACES_DIR = path.join(os.homedir(), '.cerebrex', 'traces');

export const traceCommand = new Command('trace')
  .description('Record and inspect agent execution traces');

// cerebrex trace start
traceCommand
  .command('start')
  .description('Start an HTTP trace server your agent pushes events to')
  .requiredOption('-s, --session <id>', 'Unique session identifier')
  .option('-p, --port <port>', 'Port to listen on', '7432')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(chalk.red('\nInvalid port number.\n'));
      process.exit(1);
    }

    console.log(chalk.cyan('\n🔍 TRACE — Starting trace session\n'));
    console.log(chalk.green(`  Session: ${chalk.bold(options.session)}`));
    console.log(chalk.dim(`  Listening on http://127.0.0.1:${port}`));
    console.log(chalk.dim(`  Traces saved to: ${TRACES_DIR}`));
    console.log('');
    console.log(chalk.cyan('  Instrument your agent:'));
    console.log(chalk.white(`  POST http://localhost:${port}/step`));
    console.log(chalk.dim('  Body: { "type": "tool_call", "toolName": "...", "inputs": {...} }'));
    console.log('');
    console.log(chalk.dim(`  Stop: cerebrex trace stop --session ${options.session}`));
    console.log(chalk.dim('  Press Ctrl+C to force-stop and save.\n'));

    try {
      await startTraceServer(options.session, port, TRACES_DIR);
    } catch (err) {
      console.error(chalk.red(`\nFailed to start trace server: ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

// cerebrex trace stop
traceCommand
  .command('stop')
  .description('Stop a running trace session and save it')
  .requiredOption('-s, --session <id>', 'Session identifier to stop')
  .action(async (options) => {
    const pidFile = path.join(TRACES_DIR, `${options.session}.pid`);

    // If the server is running, hit the /stop endpoint
    if (fs.existsSync(pidFile)) {
      try {
        const { port } = JSON.parse(fs.readFileSync(pidFile, 'utf-8')) as { port: number };
        const res = await fetch(`http://127.0.0.1:${port}/stop`, { method: 'POST' });

        if (res.ok) {
          const summary = await res.json() as {
            sessionId: string;
            stepCount: number;
            totalTokens: number;
            durationMs: number;
            filePath: string;
          };

          console.log(chalk.green(`\n✅ Trace session '${chalk.bold(options.session)}' saved`));
          console.log(chalk.dim(`   Steps recorded: ${summary.stepCount}`));
          console.log(chalk.dim(`   Total tokens:   ${summary.totalTokens}`));
          console.log(chalk.dim(`   Duration:       ${summary.durationMs}ms`));
          console.log(chalk.dim(`   Saved to:       ${summary.filePath}`));
          console.log(chalk.cyan(`\n   View it: cerebrex trace view --session ${options.session}\n`));
          return;
        }
      } catch {
        // Server not responding — fall through to file-based summary
      }
    }

    // Fallback: read the already-saved JSON and show its state
    const tracePath = path.join(TRACES_DIR, `${options.session}.json`);
    if (!fs.existsSync(tracePath)) {
      console.error(chalk.red(`\nNo trace session found for '${options.session}'`));
      console.error(chalk.dim('  Make sure you started it with: cerebrex trace start --session ' + options.session + '\n'));
      process.exit(1);
    }

    const session = JSON.parse(fs.readFileSync(tracePath, 'utf-8')) as {
      steps: unknown[];
      totalTokens: number;
      durationMs?: number;
    };
    const durationMs = session.durationMs ?? 0;

    console.log(chalk.yellow(`\n⚠  Trace server was not running — showing last saved state`));
    console.log(chalk.dim(`   Steps recorded: ${session.steps.length}`));
    console.log(chalk.dim(`   Total tokens:   ${session.totalTokens}`));
    if (durationMs) console.log(chalk.dim(`   Duration:       ${durationMs}ms`));
    console.log(chalk.dim(`   Saved to:       ${tracePath}`));
    console.log(chalk.cyan(`\n   View it: cerebrex trace view --session ${options.session}\n`));
  });

// cerebrex trace view
traceCommand
  .command('view')
  .description('View a recorded trace in the terminal')
  .requiredOption('-s, --session <id>', 'Session identifier to view')
  .option('--json', 'Output raw JSON instead of formatted view')
  .action(async (options) => {
    const tracePath = path.join(TRACES_DIR, `${options.session}.json`);

    if (!fs.existsSync(tracePath)) {
      console.error(chalk.red(`\nTrace not found: ${options.session}`));
      console.error(chalk.dim(`Expected at: ${tracePath}`));
      console.error(chalk.dim('Run: cerebrex trace list\n'));
      process.exit(1);
    }

    if (options.json) {
      const raw = fs.readFileSync(tracePath, 'utf-8');
      console.log(raw);
      return;
    }

    const viewer = new TraceViewer(tracePath);
    await viewer.render();
  });

// cerebrex trace list
traceCommand
  .command('list')
  .description('List all saved trace sessions')
  .action(() => {
    if (!fs.existsSync(TRACES_DIR)) {
      console.log(chalk.dim('\nNo traces found. Start one with: cerebrex trace start --session <id>\n'));
      return;
    }

    const files = fs.readdirSync(TRACES_DIR).filter((f) => f.endsWith('.json'));

    if (files.length === 0) {
      console.log(chalk.dim('\nNo traces found.\n'));
      return;
    }

    console.log(chalk.cyan('\n🔍 Saved Trace Sessions\n'));
    files.forEach((file) => {
      const sessionId = file.replace('.json', '');
      const stat = fs.statSync(path.join(TRACES_DIR, file));
      const isRunning = fs.existsSync(path.join(TRACES_DIR, `${sessionId}.pid`));
      const status = isRunning ? chalk.green(' [running]') : '';
      console.log(
        `  ${chalk.bold(sessionId.padEnd(30))} ${chalk.dim(stat.mtime.toLocaleString())}${status}`
      );
    });
    console.log('');
  });
