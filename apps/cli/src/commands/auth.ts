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

const REGISTRY_URL = 'https://registry.therealcool.site';

// cerebrex auth register
authCommand
  .command('register')
  .description('Create a new CerebreX Registry account')
  .option('--username <username>', 'Username (skips prompt)')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔑 CerebreX Registry — Create Account\n'));

    let username: string;

    if (options.username) {
      username = options.username as string;
    } else {
      const { default: inquirer } = await import('inquirer');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const answers = await (inquirer as any).prompt([{
        type: 'input',
        name: 'username',
        message: 'Choose a username (3–30 chars, lowercase, hyphens/underscores ok):',
        validate: (v: string) => /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(v.trim())
          || 'Must be 3–30 lowercase alphanumeric characters, hyphens, or underscores',
      }]);
      username = (answers as { username: string }).username.trim();
    }

    const spinner = (await import('ora')).default(`Creating account for ${chalk.bold(username)}...`).start();

    try {
      const res = await fetch(`${REGISTRY_URL}/v1/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      const data = await res.json() as { success?: boolean; token?: string; error?: string };

      if (!res.ok || !data.success || !data.token) {
        spinner.fail(chalk.red(`Registration failed: ${data.error || res.statusText}`));
        process.exit(1);
      }

      writeToken(data.token);
      spinner.succeed(chalk.green(`Account created: ${chalk.bold(username)}`));
      console.log(chalk.dim(`\n  Token saved to: ${CREDENTIALS_FILE}`));
      console.log(chalk.dim('  You can now publish packages with: cerebrex publish\n'));
      console.log(chalk.yellow('  ⚠  Save your token somewhere safe — it cannot be recovered:\n'));
      console.log(chalk.bold(`  ${data.token}\n`));
    } catch (e) {
      spinner.fail(chalk.red(`Network error: ${(e as Error).message}`));
      process.exit(1);
    }
  });

// cerebrex auth login
authCommand
  .command('login')
  .description('Log in to the CerebreX Registry')
  .option('--token <token>', 'Provide token directly (skips prompt)')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔑 CerebreX Registry — Login\n'));
    console.log(chalk.dim("  Don't have an account? Run: cerebrex auth register\n"));

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

    const spinner = (await import('ora')).default('Verifying token with registry...').start();
    try {
      const res = await fetch(`${REGISTRY_URL}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (!res.ok) {
        spinner.fail(chalk.red(`Token verification failed: ${res.statusText}`));
        console.log(chalk.dim('  Check your token and try again.\n'));
        process.exit(1);
      }
      spinner.succeed(chalk.green('Token verified'));
    } catch (e) {
      spinner.fail(chalk.red(`Could not reach registry: ${(e as Error).message}`));
      console.log(chalk.dim('  Check your network connection and try again.\n'));
      process.exit(1);
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

// cerebrex auth revoke
authCommand
  .command('revoke')
  .description('Revoke the current token on the server and log out')
  .action(async () => {
    const token = getAuthToken();
    if (!token) {
      console.log(chalk.yellow('\n  Not logged in.\n'));
      return;
    }

    const spinner = (await import('ora')).default('Revoking token on server...').start();
    try {
      const res = await fetch(`${REGISTRY_URL}/v1/auth/token`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!data.success) throw new Error(data.error || 'Server error');
      spinner.succeed(chalk.green('Token revoked on server'));
    } catch (e) {
      spinner.warn(chalk.yellow(`Could not revoke server-side: ${(e as Error).message}`));
      console.log(chalk.dim('  Local credentials will still be removed.'));
    }

    deleteToken();
    console.log(chalk.green('  ✅ Logged out and token invalidated.\n'));
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
