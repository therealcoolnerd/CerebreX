/**
 * CerebreX AUTH — Registry Authentication
 *
 * Tokens are stored in ~/.cerebrex/.credentials (mode 0600).
 * They are NEVER written to the main config.json file.
 * The CEREBREX_TOKEN env var always takes precedence.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import os from 'os';
import fs from 'fs';

const CREDENTIALS_FILE = path.join(os.homedir(), '.cerebrex', '.credentials');

// ── Token helpers (also exported for use in other commands) ────────────────────

function readStoredToken(): string | null {
  if (!fs.existsSync(CREDENTIALS_FILE)) return null;
  const token = fs.readFileSync(CREDENTIALS_FILE, 'utf-8').trim();
  return token || null;
}

function writeToken(token: string): void {
  const dir = path.dirname(CREDENTIALS_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, token, { mode: 0o600 }); // owner read/write only
}

function deleteToken(): void {
  if (fs.existsSync(CREDENTIALS_FILE)) fs.unlinkSync(CREDENTIALS_FILE);
}

/**
 * Returns the active auth token.
 * Priority: CEREBREX_TOKEN env var > stored credentials file.
 */
export function getAuthToken(): string | null {
  return process.env['CEREBREX_TOKEN'] ?? readStoredToken();
}

// ── Commands ───────────────────────────────────────────────────────────────────

export const authCommand = new Command('auth')
  .description('Authenticate with the CerebreX Registry');

// cerebrex auth login
authCommand
  .command('login')
  .description('Log in to the CerebreX Registry')
  .option('--token <token>', 'Provide token directly (skips prompt)')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔑 CerebreX Registry — Login\n'));
    console.log(chalk.dim('  Get your token at: https://cerebrex.dev/settings/tokens\n'));

    let token: string;

    if (options.token) {
      token = options.token as string;
    } else {
      const { default: inquirer } = await import('inquirer');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const answers = await (inquirer as any).prompt([{
        type: 'password',
        name: 'token',
        message: 'Paste your CerebreX Registry token:',
        validate: (v: string) => v.trim().length > 10 || 'Token looks too short',
      }]);
      token = (answers as { token: string }).token;
    }

    writeToken(token.trim());
    console.log(chalk.green('  ✅ Logged in successfully'));
    console.log(chalk.dim(`  Credentials saved to: ${CREDENTIALS_FILE}`));
    console.log(chalk.dim('  Run: cerebrex publish --dir ./cerebrex-output\n'));
  });

// cerebrex auth logout
authCommand
  .command('logout')
  .description('Log out of the CerebreX Registry')
  .action(() => {
    if (!readStoredToken()) {
      console.log(chalk.dim('\n  Not currently logged in.\n'));
      return;
    }
    deleteToken();
    console.log(chalk.green('\n  ✅ Logged out. Credentials removed.\n'));
  });

// cerebrex auth status
authCommand
  .command('status')
  .description('Show current authentication status')
  .action(() => {
    const envToken = process.env['CEREBREX_TOKEN'];
    const storedToken = readStoredToken();
    const token = envToken ?? storedToken;

    if (!token) {
      console.log(chalk.yellow('\n  Not logged in'));
      console.log(chalk.dim('  Run: cerebrex auth login\n'));
      return;
    }

    const source = envToken ? 'CEREBREX_TOKEN (environment variable)' : CREDENTIALS_FILE;
    const preview = `${token.slice(0, 8)}…${token.slice(-4)}`;

    console.log(chalk.green('\n  ✅ Authenticated'));
    console.log(chalk.dim(`  Source: ${source}`));
    console.log(chalk.dim(`  Token:  ${preview}\n`));
  });
