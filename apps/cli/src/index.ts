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
import { buildCommand } from './commands/build.js';

import { traceCommand } from './commands/trace.js';

import { deployCommand, validateCommand, publishCommand, installCommand, deprecateCommand } from './commands/other-commands.js';
import { memexCommand } from './commands/memex.js';
import { authCommand } from './commands/auth.js';
import { hiveCommand } from './commands/hive.js';

const VERSION = '0.6.1';

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

// ── Parse ─────────────────────────────────────────────────────────────────────
program.parse(process.argv);

// Show help if no command given
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
