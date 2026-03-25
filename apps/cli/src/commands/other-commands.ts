import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'node:crypto';
import { RegistryClient } from '@cerebrex/registry';
import { getAuthToken } from './auth.js';

const REGISTRY_URL = 'https://registry.therealcool.site';

// ── DEPLOY ────────────────────────────────────────────────────────────────────
export const deployCommand = new Command('deploy')
  .description('Deploy your MCP server to Cloudflare Workers')
  .option('-d, --dir <path>', 'Server directory to deploy', './cerebrex-output')
  .option('-e, --env <environment>', 'Environment: dev | staging | production', 'dev')
  .option('-n, --name <workerName>', 'Override the Cloudflare Worker name')
  .action(async (options) => {
    console.log(chalk.cyan('\n🚀 Deploying MCP server to Cloudflare Workers\n'));

    const serverDir = path.resolve(process.cwd(), options.dir);
    const spinner = ora(`Deploying to ${chalk.bold(options.env)}...`).start();

    try {
      const { execa } = await import('execa');
      const args = ['deploy', '--env', options.env];
      if (options.name) args.push('--name', options.name);

      const result = await execa('bunx', ['wrangler', ...args], {
        cwd: serverDir,
        env: { ...process.env },
      });

      spinner.succeed(chalk.green('Deployed successfully!'));

      const urlMatch = result.stdout.match(/https:\/\/[\w-]+\.workers\.dev/);
      if (urlMatch) {
        console.log(chalk.cyan('\n  🌐 Live at:'), chalk.bold(urlMatch[0]));
      }

      console.log(chalk.dim('\n  Add this as an MCP server in Claude Desktop:'));
      console.log(chalk.dim('  Edit: ~/Library/Application Support/Claude/claude_desktop_config.json'));
      console.log('');
    } catch (err) {
      spinner.fail(chalk.red('Deployment failed'));
      console.error(chalk.dim((err as Error).message));
      console.error(chalk.dim('\nMake sure you have wrangler configured: bunx wrangler login\n'));
      process.exit(1);
    }
  });

// ── VALIDATE ──────────────────────────────────────────────────────────────────

/** Recursively collect .ts files under a directory, skipping node_modules. */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.wrangler') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

/** Returns a description of the first hardcoded-secret pattern matched, or null. */
export function findHardcodedSecret(content: string): string | null {
  const patterns: Array<[RegExp, string]> = [
    [/sk-[a-zA-Z0-9\-_]{20,}/, 'OpenAI/Anthropic key (sk-...)'],
    [/AIza[0-9A-Za-z\-_]{35}/, 'Google API key (AIza...)'],
    [/ghp_[a-zA-Z0-9]{36}/, 'GitHub token (ghp_...)'],
    [/xoxb-[0-9\-a-zA-Z]{48,}/, 'Slack bot token (xoxb-...)'],
    [/(password|passwd|secret|api_key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/i, 'Hardcoded credential assignment'],
    [/Authorization:\s*['"]Bearer\s+[a-zA-Z0-9._\-]{20,}['"]/, 'Hardcoded Bearer token'],
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(content)) return label;
  }
  return null;
}

type CheckResult = { pass: boolean; detail?: string } | { skip: true; detail: string };

async function runCheck(name: string, fn: () => Promise<CheckResult>): Promise<boolean> {
  const spinner = ora(name).start();
  try {
    const result = await fn();
    if ('skip' in result) {
      spinner.warn(chalk.yellow(`${name} — skipped: ${result.detail}`));
      return true; // skips are not failures
    }
    if (result.pass) {
      spinner.succeed(chalk.green(name));
      return true;
    }
    spinner.fail(chalk.red(`${name}${result.detail ? `: ${result.detail}` : ''}`));
    return false;
  } catch (err) {
    spinner.fail(chalk.red(`${name}: ${(err as Error).message}`));
    return false;
  }
}

export const validateCommand = new Command('validate')
  .description('Validate your generated MCP server before deploying')
  .argument('[serverPath]', 'Server directory to validate')
  .option('-d, --dir <path>', 'Server directory to validate (overridden by positional arg)', './cerebrex-output')
  .option('--strict', 'Enable OWASP agentic security checks')
  .action(async (serverPath, options) => {
    console.log(chalk.cyan('\n✅ Validating MCP server...\n'));

    const serverDir = path.resolve(process.cwd(), serverPath || options.dir);
    const serverFile = path.join(serverDir, 'src', 'server.ts');
    const results: boolean[] = [];

    // ── 1. Server file exists ────────────────────────────────────────────────
    results.push(await runCheck('Server file exists', async () => {
      if (fs.existsSync(serverFile)) return { pass: true };
      return { pass: false, detail: `Expected at ${serverFile}` };
    }));

    // ── 2. MCP protocol compliance ───────────────────────────────────────────
    results.push(await runCheck('MCP protocol compliance', async () => {
      if (!fs.existsSync(serverFile)) return { pass: false, detail: 'server.ts not found' };
      const content = fs.readFileSync(serverFile, 'utf-8');
      if (!content.includes('McpServer')) return { pass: false, detail: 'McpServer not found' };
      if (!content.includes('server.tool(')) return { pass: false, detail: 'No server.tool() calls found' };
      return { pass: true };
    }));

    // ── 3. Zod schemas present ───────────────────────────────────────────────
    results.push(await runCheck('Zod schemas present on all tools', async () => {
      if (!fs.existsSync(serverFile)) return { pass: false, detail: 'server.ts not found' };
      const content = fs.readFileSync(serverFile, 'utf-8');
      const hasImport = content.includes("from 'zod'") || content.includes('from "zod"');
      const hasUsage = /z\.(string|number|boolean|array|record|unknown|enum|object)\(/.test(content);
      if (!hasImport) return { pass: false, detail: 'zod not imported' };
      if (!hasUsage) return { pass: false, detail: 'No Zod schema types detected' };
      return { pass: true };
    }));

    // ── 4. No hardcoded secrets ──────────────────────────────────────────────
    results.push(await runCheck('No hardcoded secrets detected', async () => {
      const tsFiles = collectTsFiles(path.join(serverDir, 'src'));
      for (const file of tsFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const match = findHardcodedSecret(content);
        if (match) return { pass: false, detail: `${path.relative(serverDir, file)}: ${match}` };
      }
      return { pass: true };
    }));

    // ── 5. Error handlers sanitized ──────────────────────────────────────────
    results.push(await runCheck('Error handlers sanitized', async () => {
      if (!fs.existsSync(serverFile)) return { pass: false, detail: 'server.ts not found' };
      const content = fs.readFileSync(serverFile, 'utf-8');
      if (content.includes('.stack') || /JSON\.stringify\(e(rr|rror)\b/.test(content)) {
        return { pass: false, detail: 'Stack traces may leak internal details to MCP callers' };
      }
      return { pass: true };
    }));

    // ── 6. wrangler.toml present ─────────────────────────────────────────────
    results.push(await runCheck('wrangler.toml present', async () => {
      if (fs.existsSync(path.join(serverDir, 'wrangler.toml'))) return { pass: true };
      return { pass: false, detail: 'Missing wrangler.toml' };
    }));

    // ── 7. TypeScript compilation ────────────────────────────────────────────
    results.push(await runCheck('TypeScript compilation', async () => {
      if (!fs.existsSync(path.join(serverDir, 'node_modules'))) {
        return { skip: true, detail: 'run `bun install` in the server directory first' };
      }
      const { execa } = await import('execa');
      const result = await execa('bunx', ['tsc', '--noEmit'], { cwd: serverDir, reject: false });
      if (result.exitCode !== 0) {
        const firstError = (result.stderr || result.stdout)
          .split('\n')
          .find((l) => l.includes('error TS'));
        const detail = firstError?.trim();
        return detail ? { pass: false, detail } : { pass: false };
      }
      return { pass: true };
    }));

    // ── OWASP strict checks ───────────────────────────────────────────────────
    if (options.strict) {
      console.log(chalk.dim('\n  -- OWASP Agentic Security Checks --\n'));

      results.push(await runCheck('OWASP: Input injection resistance', async () => {
        if (!fs.existsSync(serverFile)) return { pass: false, detail: 'server.ts not found' };
        const content = fs.readFileSync(serverFile, 'utf-8');
        // Flag unsafe string concatenation to build fetch URLs
        if (/fetch\s*\(\s*BASE_URL\s*\+/.test(content)) {
          return { pass: false, detail: 'Possible unsafe URL concatenation in fetch call' };
        }
        return { pass: true };
      }));

      results.push(await runCheck('OWASP: No secrets in wrangler.toml', async () => {
        const wranglerPath = path.join(serverDir, 'wrangler.toml');
        if (!fs.existsSync(wranglerPath)) return { pass: false, detail: 'wrangler.toml not found' };
        const match = findHardcodedSecret(fs.readFileSync(wranglerPath, 'utf-8'));
        if (match) return { pass: false, detail: match };
        return { pass: true };
      }));

      results.push(await runCheck('OWASP: Dependency audit', async () => {
        if (!fs.existsSync(path.join(serverDir, 'node_modules'))) {
          return { skip: true, detail: 'run `bun install` first' };
        }
        const { execa } = await import('execa');
        const result = await execa('bunx', ['npm', 'audit', '--json'], {
          cwd: serverDir,
          reject: false,
        });
        try {
          const audit = JSON.parse(result.stdout) as {
            metadata?: { vulnerabilities?: { critical?: number; high?: number } };
          };
          const critical = audit.metadata?.vulnerabilities?.critical ?? 0;
          const high = audit.metadata?.vulnerabilities?.high ?? 0;
          if (critical > 0) return { pass: false, detail: `${critical} critical vulnerabilities` };
          if (high > 0) return { pass: false, detail: `${high} high vulnerabilities (run npm audit)` };
        } catch {
          return { skip: true, detail: 'Could not parse audit output' };
        }
        return { pass: true };
      }));
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('');
    const failures = results.filter((r) => r === false).length;
    if (failures === 0) {
      console.log(chalk.green('  ✅ All checks passed. Ready to deploy!\n'));
      console.log(chalk.dim('  Run: cerebrex deploy\n'));
    } else {
      console.log(chalk.red(`  ❌ ${failures} check${failures > 1 ? 's' : ''} failed. Fix the issues above before deploying.\n`));
      process.exit(1);
    }
  });

// ── PUBLISH ───────────────────────────────────────────────────────────────────
export const publishCommand = new Command('publish')
  .description('Publish your MCP server to the CerebreX Registry')
  .addHelpText('after', `
Examples:
  cerebrex publish --dir ./cerebrex-output
  cerebrex publish --dir ./cerebrex-output --readme ./README.md
  cerebrex publish --dir ./cerebrex-output --tag beta
  cerebrex publish --name @myorg/my-mcp --version 1.2.0
  `)
  .option('-d, --dir <path>', 'Server directory to publish', './cerebrex-output')
  .option('-n, --name <packageName>', 'Package name (defaults to package.json name)')
  .option('--version <semver>', 'Version to publish (defaults to package.json version)')
  .option('--tag <tag>', 'Dist tag (latest, beta, etc.)', 'latest')
  .option('--readme <file>', 'Path to README file to include (defaults to README.md in server dir)')
  .action(async (options) => {
    console.log(chalk.blue('\n📦 Publishing to CerebreX Registry\n'));

    const serverDir = path.resolve(process.cwd(), options.dir);
    const pkgPath = path.join(serverDir, 'package.json');

    if (!fs.existsSync(pkgPath)) {
      console.error(chalk.red(`  No package.json found in ${serverDir}`));
      console.error(chalk.dim('  Run `cerebrex build` first.\n'));
      process.exit(1);
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      name?: string;
      version?: string;
      description?: string;
    };

    const packageName = options.name || pkg.name;
    const version = options.version || pkg.version;

    if (!packageName) {
      console.error(chalk.red('  Could not determine package name. Use --name <name>\n'));
      process.exit(1);
    }

    const token = getAuthToken();
    if (!token) {
      console.error(chalk.yellow('  Not authenticated.'));
      console.error(chalk.dim('  Run: cerebrex auth login\n'));
      process.exit(1);
    }

    // Resolve README
    let readme = '';
    const readmePath = options.readme
      ? path.resolve(process.cwd(), options.readme)
      : path.join(serverDir, 'README.md');
    if (fs.existsSync(readmePath)) {
      readme = fs.readFileSync(readmePath, 'utf-8');
    }

    const spinner = ora('Creating package tarball...').start();

    try {
      const tarName = `${packageName.replace(/\//g, '-')}-${version}.tgz`;
      const tarPath = path.join(os.tmpdir(), tarName);
      const { create: tarCreate } = await import('tar');

      await tarCreate(
        { gzip: true, file: tarPath, cwd: path.dirname(serverDir) },
        [path.basename(serverDir)]
      );

      spinner.text = 'Uploading to CerebreX Registry...';

      const tarball = fs.readFileSync(tarPath);

      // Build multipart form-data
      const form = new FormData();
      form.append('tarball', new Blob([tarball], { type: 'application/gzip' }), tarName);
      form.append('name', packageName);
      form.append('version', version ?? '');
      form.append('description', pkg.description ?? '');
      form.append('tags', options.tag);
      if (readme) form.append('readme', readme);

      const res = await fetch(`${REGISTRY_URL}/v1/packages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const data = await res.json() as { success?: boolean; url?: string; error?: string };

      fs.unlinkSync(tarPath);

      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      spinner.succeed(chalk.green('Package published!'));
      console.log(chalk.cyan('\n  View your package at:'));
      console.log(chalk.bold(`  ${data.url ?? `${REGISTRY_URL}/packages/${encodeURIComponent(packageName)}`}\n`));
    } catch (err) {
      spinner.fail(chalk.red('Publish failed'));
      const msg = (err as Error).message;
      console.error(chalk.dim(`  ${msg}`));
      if (/fetch|ECONNREFUSED|ENOTFOUND/.test(msg)) {
        console.error(chalk.dim(`\n  Registry: ${REGISTRY_URL}\n`));
      }
      process.exit(1);
    }
  });

// ── DEPRECATE ─────────────────────────────────────────────────────────────────
export const deprecateCommand = new Command('deprecate')
  .description('Deprecate (or un-deprecate) a published package version')
  .argument('<package>', 'Package name (e.g. my-mcp or @org/my-mcp)')
  .argument('<version>', 'Version to deprecate (e.g. 1.2.3)')
  .option('--undo', 'Remove the deprecation flag')
  .addHelpText('after', `
Examples:
  cerebrex deprecate my-mcp 1.0.0
  cerebrex deprecate @myorg/my-mcp 2.1.0 --undo
  `)
  .action(async (packageName, version, options) => {
    const token = getAuthToken();
    if (!token) {
      console.error(chalk.yellow('  Not authenticated.'));
      console.error(chalk.dim('  Run: cerebrex auth login\n'));
      process.exit(1);
    }

    const action = options.undo ? 'Removing deprecation' : 'Deprecating';
    const spinner = ora(`${action} ${chalk.bold(packageName)}@${version}...`).start();

    try {
      const encoded = encodeURIComponent(packageName);
      const res = await fetch(`${REGISTRY_URL}/v1/packages/${encoded}/${version}/deprecate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deprecated: !options.undo }),
      });

      const data = await res.json() as { success?: boolean; error?: string };

      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (options.undo) {
        spinner.succeed(chalk.green(`Deprecation removed for ${chalk.bold(packageName)}@${version}`));
      } else {
        spinner.succeed(chalk.yellow(`${chalk.bold(packageName)}@${version} marked as deprecated`));
        console.log(chalk.dim('  Users installing this version will see a deprecation warning.'));
        console.log(chalk.dim(`  To undo: cerebrex deprecate ${packageName} ${version} --undo\n`));
      }
    } catch (err) {
      spinner.fail(chalk.red('Deprecate failed'));
      console.error(chalk.dim(`  ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── CONFIGURE ─────────────────────────────────────────────────────────────────
export const configureCommand = new Command('configure')
  .description('Add an installed MCP package to Claude Desktop config')
  .argument('<package>', 'Package name (e.g. @arealcoolco/nasa-mcp)')
  .option('-d, --dir <path>', 'Directory where the package is installed', './cerebrex-servers')
  .option('--env <KEY=VALUE...>', 'Environment variables to pass to the MCP server', (v, prev: string[]) => [...prev, v], [] as string[])
  .option('--dry-run', 'Print the config change without writing it')
  .addHelpText('after', `
Examples:
  cerebrex configure @arealcoolco/nasa-mcp
  cerebrex configure @arealcoolco/github-mcp --env GITHUB_TOKEN=ghp_abc123
  cerebrex configure @arealcoolco/openweathermap-mcp --env OWM_API_KEY=abc --dry-run
  `)
  .action(async (packageName, options) => {
    console.log(chalk.blue(`\n⚙️  Configuring ${chalk.bold(packageName)} for Claude Desktop\n`));

    // ── Resolve the Claude Desktop config path ────────────────────────────────
    let configPath: string;
    if (process.platform === 'win32') {
      configPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    } else if (process.platform === 'darwin') {
      configPath = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else {
      configPath = path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
    }

    // ── Resolve the server entry point ───────────────────────────────────────
    const installDir = path.resolve(process.cwd(), options.dir);
    const pkgBaseName = packageName.split('/').pop()!;
    // Try scoped install dir first, then flat
    const candidates = [
      path.join(installDir, pkgBaseName, 'dist', 'server.js'),
      path.join(installDir, packageName, 'dist', 'server.js'),
      path.join(installDir, 'dist', 'server.js'),
    ];
    let serverPath = candidates.find(fs.existsSync);

    if (!serverPath) {
      // Try fetching from registry to show where to install
      const token = getAuthToken();
      try {
        const client = new RegistryClient({ authToken: token ?? undefined });
        const meta = await client.getPackage(packageName, 'latest') as { name?: string; description?: string; readme?: string };
        console.log(chalk.yellow(`  Package "${packageName}" not installed locally.`));
        console.log(chalk.dim(`  Description: ${meta.description ?? 'N/A'}`));
        console.log(chalk.dim(`\n  Install it first:\n    cerebrex install ${packageName}\n`));
      } catch {
        console.log(chalk.yellow(`  Package "${packageName}" not found locally or in registry.`));
        console.log(chalk.dim(`\n  Install it first:\n    cerebrex install ${packageName}\n`));
      }
      process.exit(1);
    }

    // ── Parse --env flags ─────────────────────────────────────────────────────
    const envRecord: Record<string, string> = {};
    for (const e of (options.env as string[])) {
      const idx = e.indexOf('=');
      if (idx === -1) {
        envRecord[e] = '';
      } else {
        envRecord[e.slice(0, idx)] = e.slice(idx + 1);
      }
    }

    // ── Check README for required env vars not yet supplied ───────────────────
    const readmePath = path.join(path.dirname(path.dirname(serverPath)), 'README.md');
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, 'utf-8');
      const envMatches = [...readme.matchAll(/export\s+([A-Z_][A-Z0-9_]+)=/g)];
      const missing = envMatches
        .map((m) => m[1])
        .filter((v) => !(v in envRecord) && !process.env[v]);
      if (missing.length > 0) {
        console.log(chalk.yellow('  Required environment variables not set:'));
        for (const v of missing) {
          console.log(chalk.dim(`    ${v}=<your_value>`));
        }
        console.log(chalk.dim('\n  Pass them with --env KEY=VALUE, e.g.:'));
        console.log(chalk.dim(`    cerebrex configure ${packageName} --env ${missing[0]}=your_value\n`));
      }
    }

    // ── Build the new mcpServers entry ────────────────────────────────────────
    const serverKey = pkgBaseName;
    const newEntry: Record<string, unknown> = {
      command: 'node',
      args: [serverPath],
    };
    if (Object.keys(envRecord).length > 0) {
      newEntry['env'] = envRecord;
    }

    // ── Load or create Claude Desktop config ─────────────────────────────────
    let config: { mcpServers?: Record<string, unknown> } = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        console.error(chalk.red(`  Could not parse existing config at ${configPath}`));
        process.exit(1);
      }
    }

    config.mcpServers = config.mcpServers ?? {};
    const alreadyExists = serverKey in config.mcpServers;
    config.mcpServers[serverKey] = newEntry;

    const newJson = JSON.stringify(config, null, 2);

    if (options.dryRun) {
      console.log(chalk.dim(`  Config file: ${configPath}`));
      console.log(chalk.dim('  Would write:\n'));
      console.log(newJson);
      console.log('');
      return;
    }

    // ── Write the updated config ──────────────────────────────────────────────
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, newJson, 'utf-8');

    if (alreadyExists) {
      console.log(chalk.green(`  Updated "${serverKey}" in Claude Desktop config`));
    } else {
      console.log(chalk.green(`  Added "${serverKey}" to Claude Desktop config`));
    }
    console.log(chalk.dim(`  Config: ${configPath}`));
    console.log(chalk.dim('  Restart Claude Desktop to apply changes.\n'));

    // ── Print snippet ─────────────────────────────────────────────────────────
    console.log(chalk.dim('  Entry added:'));
    console.log(chalk.dim(`    "${serverKey}": ${JSON.stringify(newEntry, null, 4).split('\n').join('\n    ')}\n`));
  });

// ── INSTALL ───────────────────────────────────────────────────────────────────
export const installCommand = new Command('install')
  .description('Install an MCP server from the CerebreX Registry')
  .argument('<package>', 'Package to install (e.g. @arealcoolco/stripe-mcp)')
  .option('-v, --ver <version>', 'Version to install', 'latest')
  .option('-d, --dir <path>', 'Installation directory', './cerebrex-servers')
  .action(async (packageName, options) => {
    console.log(chalk.blue(`\n📥 Installing ${chalk.bold(packageName)} from CerebreX Registry\n`));

    const token = getAuthToken(); // optional for public packages
    const client = new RegistryClient({ authToken: token ?? undefined });
    const installDir = path.resolve(process.cwd(), options.dir);

    const spinner = ora(`Fetching ${packageName}@${options.ver}...`).start();

    try {
      // Fetch metadata first to get expected SHA-256
      const meta = await client.getPackage(packageName, options.ver) as { sha256?: string };

      const tarball = await client.download(packageName, options.ver);

      // Verify SHA-256 integrity
      if (meta.sha256) {
        const actual = crypto.createHash('sha256').update(tarball).digest('hex');
        if (actual !== meta.sha256) {
          throw new Error(`Integrity check failed. Expected ${meta.sha256}, got ${actual}`);
        }
      }

      spinner.text = 'Extracting package...';
      fs.mkdirSync(installDir, { recursive: true });

      const tarPath = path.join(os.tmpdir(), `${packageName.replace(/\//g, '-')}.tgz`);
      fs.writeFileSync(tarPath, tarball);

      const { list: tarList, extract: tarExtract } = await import('tar');

      // Zip-slip protection: list entries and reject path traversal
      const entries: string[] = [];
      await tarList({
        file: tarPath,
        onentry: (entry: { path: string }) => entries.push(entry.path),
      });
      for (const entry of entries) {
        const normalized = path.posix.normalize(entry);
        if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
          fs.unlinkSync(tarPath);
          throw new Error(`Security: path traversal detected in tarball entry: ${entry}`);
        }
      }

      await tarExtract({ file: tarPath, cwd: installDir });
      fs.unlinkSync(tarPath);

      const pkgDir = path.join(installDir, path.basename(packageName));
      spinner.succeed(chalk.green(`Installed ${packageName}@${options.ver}`));
      console.log(chalk.dim(`\n  Installed to: ${pkgDir}`));
      console.log(chalk.dim(`  Deploy it:    cerebrex deploy --dir ${pkgDir}\n`));
    } catch (err) {
      spinner.fail(chalk.red('Install failed'));
      const msg = (err as Error).message;
      console.error(chalk.dim(`  ${msg}`));
      if (/fetch|ECONNREFUSED|ENOTFOUND/.test(msg)) {
        console.error(chalk.dim('\n  Registry: https://registry.therealcool.site\n'));
      }
      process.exit(1);
    }
  });
