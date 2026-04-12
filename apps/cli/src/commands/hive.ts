/**
 * HIVE — Multi-agent coordination for CerebreX
 *
 * cerebrex hive init          — Initialize a HIVE config in this directory
 * cerebrex hive start         — Start the local HIVE coordinator
 * cerebrex hive register      — Register an agent with the active HIVE
 * cerebrex hive status        — Show active agents and task queue
 * cerebrex hive send          — Send a task to a registered agent
 * cerebrex hive worker        — Start a worker that polls + executes tasks
 * cerebrex hive swarm         — Launch a named swarm preset (parallel/pipeline/competitive)
 * cerebrex hive strategies    — List available swarm strategies and presets
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gateAction, buildPolicy } from '../core/auth/risk-gate.js';

// ── Config ────────────────────────────────────────────────────────────────────

const HIVE_DIR = path.join(os.homedir(), '.cerebrex', 'hive');
const HIVE_CONFIG_FILE = 'hive.json';

interface HiveConfig {
  id: string;
  name: string;
  port: number;
  secret: string;
  created_at: string;
}

interface AgentRegistration {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  endpoint?: string;
  registered_at: string;
  last_seen: string;
  status: 'idle' | 'busy' | 'offline';
}

interface HiveState {
  config: HiveConfig;
  agents: AgentRegistration[];
  tasks: Task[];
}

interface Task {
  id: string;
  agent_id: string;
  type: string;
  payload: unknown;
  status: 'queued' | 'running' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
  result?: unknown;
  error?: string;
}

// ── JWT-lite (HMAC-SHA256) ────────────────────────────────────────────────────

export function signToken(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: '1' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const enriched = { ...payload, jti: crypto.randomUUID(), nbf: now };
  const body = Buffer.from(JSON.stringify(enriched)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts as [string, string, string];

    const headerData = JSON.parse(Buffer.from(header, 'base64url').toString('utf-8')) as Record<string, unknown>;
    if (headerData.alg !== 'HS256' || headerData.typ !== 'JWT') return null;

    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && typeof payload.exp === 'number' && now > payload.exp) return null;
    if (payload.nbf && typeof payload.nbf === 'number' && now < payload.nbf) return null;
    if (payload.iat && typeof payload.iat === 'number' && payload.iat > now + 60) return null;
    // sub claim must be present and non-empty
    if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim() === '') return null;
    return payload;
  } catch {
    return null;
  }
}

// ── State helpers ─────────────────────────────────────────────────────────────

function getStateFile(configDir: string): string {
  return path.join(configDir, 'state.json');
}

function loadState(configDir: string): HiveState | null {
  const stateFile = getStateFile(configDir);
  if (!fs.existsSync(stateFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as HiveState;
  } catch {
    return null;
  }
}

const TASK_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

function saveState(configDir: string, state: HiveState): void {
  fs.mkdirSync(configDir, { recursive: true });

  // Rotate completed/failed tasks older than 24 hours to prevent unbounded growth
  const cutoff = new Date(Date.now() - TASK_RETENTION_MS).toISOString();
  state.tasks = state.tasks.filter(
    (t) => t.status === 'queued' || t.status === 'running' ||
    !t.completed_at || t.completed_at > cutoff
  );

  const file = getStateFile(configDir);
  fs.writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });

  // Windows: harden with icacls (same pattern as .credentials)
  if (process.platform === 'win32') {
    try {
      execFileSync('icacls', [
        file, '/inheritance:r', '/grant:r', `${process.env['USERNAME'] ?? 'User'}:(F)`,
      ], { stdio: 'ignore' });
    } catch { /* icacls not available in all environments — best-effort */ }
  }
}

function loadConfig(configDir: string): HiveConfig | null {
  const configFile = path.join(configDir, HIVE_CONFIG_FILE);
  if (!fs.existsSync(configFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf-8')) as HiveConfig;
  } catch {
    return null;
  }
}

// ── hive init ─────────────────────────────────────────────────────────────────

export const hiveCommand = new Command('hive')
  .description('Multi-agent coordination with JWT auth');

hiveCommand
  .command('init')
  .description('Initialize a HIVE coordinator config')
  .option('-n, --name <name>', 'HIVE name', 'my-hive')
  .option('-p, --port <port>', 'Port to listen on', '7433')
  .option('-d, --dir <path>', 'Config directory', HIVE_DIR)
  .action((options) => {
    const configDir = path.resolve(options.dir);
    const configFile = path.join(configDir, HIVE_CONFIG_FILE);

    if (fs.existsSync(configFile)) {
      const existing = loadConfig(configDir)!;
      console.log(chalk.yellow(`\n  HIVE already initialized: ${existing.name} (port ${existing.port})\n`));
      console.log(chalk.dim(`  Config: ${configFile}\n`));
      return;
    }

    fs.mkdirSync(configDir, { recursive: true });

    const config: HiveConfig = {
      id: crypto.randomUUID(),
      name: options.name,
      port: parseInt(options.port, 10),
      secret: crypto.randomBytes(32).toString('hex'),
      created_at: new Date().toISOString(),
    };

    // 0o600 — hive.json contains the JWT signing secret; owner-only access
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
    if (process.platform === 'win32') {
      try {
        execFileSync('icacls', [
          configFile, '/inheritance:r', '/grant:r', `${process.env['USERNAME'] ?? 'User'}:(F)`,
        ], { stdio: 'ignore' });
      } catch { /* best-effort */ }
    }
    const state: HiveState = { config, agents: [], tasks: [] };
    saveState(configDir, state);

    console.log(chalk.cyan(`\n  🐝 HIVE initialized: ${chalk.bold(config.name)}\n`));
    console.log(chalk.dim(`  ID:     ${config.id}`));
    console.log(chalk.dim(`  Port:   ${config.port}`));
    console.log(chalk.dim(`  Config: ${configFile}`));
    console.log('');
    console.log(chalk.dim('  Start it:'));
    console.log(chalk.white('  cerebrex hive start\n'));
  });

// ── hive start ────────────────────────────────────────────────────────────────

hiveCommand
  .command('start')
  .description('Start the HIVE coordinator (runs in foreground)')
  .option('-d, --dir <path>', 'Config directory', HIVE_DIR)
  .action((options) => {
    const configDir = path.resolve(options.dir);
    const config = loadConfig(configDir);
    if (!config) {
      console.error(chalk.red('\n  No HIVE config found. Run: cerebrex hive init\n'));
      process.exit(1);
    }

    let state = loadState(configDir)!;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${config.port}`);
      const method = req.method?.toUpperCase() ?? 'GET';

      const sendJson = (data: unknown, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };

      const withBody = (cb: (body: unknown) => void) => {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
          try { cb(JSON.parse(raw)); } catch { sendJson({ error: 'Invalid JSON' }, 400); }
        });
      };

      const authenticate = (): boolean => {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer ')) { sendJson({ error: 'Authorization required' }, 401); return false; }
        const payload = verifyToken(auth.slice(7), config.secret);
        if (!payload) { sendJson({ error: 'Invalid or expired token' }, 401); return false; }
        return true;
      };

      // Reload state on each request
      state = loadState(configDir) ?? state;

      // GET /health
      if (url.pathname === '/health' && method === 'GET') {
        return sendJson({ hive: config.name, id: config.id, agents: state.agents.length, tasks: state.tasks.length });
      }

      // POST /token — issue a JWT for an agent (requires registration_secret)
      if (url.pathname === '/token' && method === 'POST') {
        return withBody((body) => {
          const { agent_id, agent_name, registration_secret } = body as {
            agent_id?: string; agent_name?: string; registration_secret?: string;
          };
          if (!agent_id) return sendJson({ error: 'agent_id required' }, 400);
          // Constant-time comparison to prevent timing oracle on the hive secret
          if (!registration_secret) return sendJson({ error: 'registration_secret required' }, 401);
          const secBuf = Buffer.from(registration_secret);
          const cfgBuf = Buffer.from(config.secret);
          if (secBuf.length !== cfgBuf.length || !crypto.timingSafeEqual(secBuf, cfgBuf)) {
            return sendJson({ error: 'Invalid registration_secret' }, 401);
          }
          const token = signToken(
            { sub: agent_id, name: agent_name || agent_id, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 },
            config.secret
          );
          sendJson({ token });
        });
      }

      // POST /agents — register an agent
      if (url.pathname === '/agents' && method === 'POST') {
        if (!authenticate()) return;
        return withBody((body) => {
          const b = body as Partial<AgentRegistration>;
          if (!b.id || !b.name) return sendJson({ error: 'id and name required' }, 400);
          const now = new Date().toISOString();
          const agent: AgentRegistration = {
            id: b.id,
            name: b.name,
            type: b.type || 'generic',
            capabilities: b.capabilities || [],
            endpoint: b.endpoint,
            registered_at: now,
            last_seen: now,
            status: 'idle',
          };
          state.agents = state.agents.filter((a) => a.id !== agent.id);
          state.agents.push(agent);
          saveState(configDir, state);
          sendJson({ success: true, agent });
        });
      }

      // GET /agents — list all agents
      if (url.pathname === '/agents' && method === 'GET') {
        return sendJson({ agents: state.agents });
      }

      // POST /tasks — dispatch a task to an agent
      if (url.pathname === '/tasks' && method === 'POST') {
        if (!authenticate()) return;
        return withBody((body) => {
          const b = body as { agent_id?: string; type?: string; payload?: unknown };
          if (!b.agent_id || !b.type) return sendJson({ error: 'agent_id and type required' }, 400);
          const agent = state.agents.find((a) => a.id === b.agent_id);
          if (!agent) return sendJson({ error: `Agent '${b.agent_id}' not registered` }, 404);
          const task: Task = {
            id: crypto.randomUUID(),
            agent_id: b.agent_id,
            type: b.type,
            payload: b.payload ?? {},
            status: 'queued',
            created_at: new Date().toISOString(),
          };
          state.tasks.push(task);
          saveState(configDir, state);
          sendJson({ success: true, task });
        });
      }

      // GET /tasks — list tasks (filter by agent_id and/or status)
      if (url.pathname === '/tasks' && method === 'GET') {
        const agentId = url.searchParams.get('agent_id');
        const statusFilter = url.searchParams.get('status');
        let tasks = agentId ? state.tasks.filter((t) => t.agent_id === agentId) : state.tasks;
        if (statusFilter) tasks = tasks.filter((t) => t.status === statusFilter);
        return sendJson({ tasks });
      }

      // PATCH /tasks/:id — update task status/result
      const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
      if (taskMatch && method === 'PATCH') {
        if (!authenticate()) return;
        return withBody((body) => {
          const taskId = taskMatch[1];
          const idx = state.tasks.findIndex((t) => t.id === taskId);
          if (idx === -1) return sendJson({ error: 'Task not found' }, 404);
          const update = body as Partial<Task>;
          state.tasks[idx] = { ...state.tasks[idx], ...update };
          if (update.status === 'running') {
            const agent = state.agents.find((a) => a.id === state.tasks[idx].agent_id);
            if (agent) { agent.status = 'busy'; agent.last_seen = new Date().toISOString(); }
          }
          if (update.status === 'completed' || update.status === 'failed') {
            state.tasks[idx].completed_at = new Date().toISOString();
            const agent = state.agents.find((a) => a.id === state.tasks[idx].agent_id);
            if (agent) { agent.status = 'idle'; agent.last_seen = new Date().toISOString(); }
          }
          saveState(configDir, state);
          sendJson({ success: true, task: state.tasks[idx] });
        });
      }

      sendJson({ error: 'Not found' }, 404);
    });

    server.listen(config.port, () => {
      console.log(chalk.cyan(`\n  🐝 HIVE coordinator running\n`));
      console.log(chalk.dim(`  Name:    ${config.name}`));
      console.log(chalk.dim(`  Port:    ${config.port}`));
      console.log(chalk.dim(`  API:     http://localhost:${config.port}`));
      console.log('');
      console.log(chalk.dim('  Endpoints:'));
      console.log(chalk.dim(`  GET  /health       — health check`));
      console.log(chalk.dim(`  POST /token        — issue agent JWT`));
      console.log(chalk.dim(`  POST /agents       — register agent`));
      console.log(chalk.dim(`  GET  /agents       — list agents`));
      console.log(chalk.dim(`  POST /tasks        — dispatch task`));
      console.log(chalk.dim(`  GET  /tasks        — list tasks`));
      console.log(chalk.dim(`  PATCH /tasks/:id   — update task`));
      console.log('');
      console.log(chalk.dim('  Press Ctrl+C to stop\n'));
    });

    process.on('SIGINT', () => {
      console.log(chalk.dim('\n  HIVE shutting down...\n'));
      server.close();
      process.exit(0);
    });
  });

// ── hive register ─────────────────────────────────────────────────────────────

hiveCommand
  .command('register')
  .description('Register this agent with a running HIVE coordinator')
  .requiredOption('-i, --id <agentId>', 'Unique agent ID')
  .requiredOption('-n, --name <name>', 'Agent name')
  .option('-t, --type <type>', 'Agent type (e.g. llm, tool, router)', 'generic')
  .option('-c, --capabilities <caps>', 'Comma-separated capabilities', '')
  .option('-e, --endpoint <url>', 'Agent callback endpoint')
  .option('--hive-url <url>', 'HIVE coordinator URL', 'http://localhost:7433')
  .action(async (options) => {
    const spinner = ora('Connecting to HIVE...').start();

    try {
      // Load local hive config to get the registration secret
      const configDir = HIVE_DIR;
      const localConfig = loadConfig(configDir);
      if (!localConfig) {
        spinner.fail('No HIVE config found. Run: cerebrex hive init');
        process.exit(1);
      }

      // Get a JWT first — registration_secret authenticates the request
      const tokenRes = await fetch(`${options.hiveUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: options.id, agent_name: options.name, registration_secret: localConfig.secret }),
      });

      if (!tokenRes.ok) throw new Error(`Token request failed: ${tokenRes.status}`);
      const { token } = await tokenRes.json() as { token: string };

      // Register
      const regRes = await fetch(`${options.hiveUrl}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: options.id,
          name: options.name,
          type: options.type,
          capabilities: options.capabilities ? options.capabilities.split(',').map((s: string) => s.trim()) : [],
          endpoint: options.endpoint,
        }),
      });

      if (!regRes.ok) {
        const errBody = await regRes.json() as { error?: string };
        throw new Error(errBody.error || `Registration failed: ${regRes.status}`);
      }

      spinner.succeed(chalk.green(`Agent registered: ${options.name}`));
      console.log(chalk.dim(`\n  ID:    ${options.id}`));
      console.log(chalk.dim(`  Type:  ${options.type}`));
      console.log(chalk.dim(`  HIVE:  ${options.hiveUrl}`));
      console.log(chalk.cyan(`\n  JWT token (save this):\n`));
      console.log(chalk.white(`  ${token}\n`));
    } catch (e) {
      spinner.fail(chalk.red('Registration failed'));
      console.error(chalk.dim(`  ${(e as Error).message}\n`));
      process.exit(1);
    }
  });

// ── hive status ───────────────────────────────────────────────────────────────

hiveCommand
  .command('status')
  .description('Show HIVE agents and task queue')
  .option('--hive-url <url>', 'HIVE coordinator URL', 'http://localhost:7433')
  .action(async (options) => {
    try {
      const [healthRes, agentsRes, tasksRes] = await Promise.all([
        fetch(`${options.hiveUrl}/health`),
        fetch(`${options.hiveUrl}/agents`),
        fetch(`${options.hiveUrl}/tasks`),
      ]);

      if (!healthRes.ok) throw new Error('HIVE is not reachable');

      const health = await healthRes.json() as { hive: string; id: string };
      const { agents } = await agentsRes.json() as { agents: AgentRegistration[] };
      const { tasks } = await tasksRes.json() as { tasks: Task[] };

      console.log(chalk.cyan(`\n  🐝 HIVE: ${chalk.bold(health.hive)}`));
      console.log(chalk.dim(`  ID: ${health.id}\n`));

      if (!agents.length) {
        console.log(chalk.dim('  No agents registered.\n'));
      } else {
        console.log(chalk.bold('  Agents:'));
        for (const a of agents) {
          const statusColor = a.status === 'idle' ? chalk.green : a.status === 'busy' ? chalk.yellow : chalk.red;
          console.log(`  ${statusColor('●')} ${chalk.white(a.name)} ${chalk.dim(`(${a.type})`)} ${statusColor(a.status)}`);
          if (a.capabilities.length) console.log(chalk.dim(`    capabilities: ${a.capabilities.join(', ')}`));
        }
        console.log('');
      }

      const pending = tasks.filter((t) => t.status === 'queued' || t.status === 'running');
      if (pending.length) {
        console.log(chalk.bold('  Active tasks:'));
        for (const t of pending) {
          const agent = agents.find((a) => a.id === t.agent_id);
          console.log(`  ${chalk.yellow('›')} ${t.type} → ${chalk.dim(agent?.name ?? t.agent_id)} ${chalk.dim(`[${t.status}]`)}`);
        }
        console.log('');
      }
    } catch (e) {
      console.error(chalk.red(`\n  Cannot reach HIVE at ${options.hiveUrl}`));
      console.error(chalk.dim(`  ${(e as Error).message}`));
      console.error(chalk.dim('\n  Make sure it is running: cerebrex hive start\n'));
      process.exit(1);
    }
  });

// ── hive send ─────────────────────────────────────────────────────────────────

hiveCommand
  .command('send')
  .description('Send a task to a registered agent')
  .requiredOption('-a, --agent <agentId>', 'Target agent ID')
  .requiredOption('-t, --type <taskType>', 'Task type')
  .option('-p, --payload <json>', 'JSON payload', '{}')
  .option('--token <jwt>', 'JWT token (from cerebrex hive register)')
  .option('--hive-url <url>', 'HIVE coordinator URL', 'http://localhost:7433')
  .action(async (options) => {
    let payload: unknown;
    try {
      payload = JSON.parse(options.payload);
    } catch {
      console.error(chalk.red('  --payload must be valid JSON\n'));
      process.exit(1);
    }

    if (!options.token) {
      console.error(chalk.red('  --token required. Get one from: cerebrex hive register\n'));
      process.exit(1);
    }

    const spinner = ora(`Sending task '${options.type}' to agent ${options.agent}...`).start();

    try {
      const res = await fetch(`${options.hiveUrl}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.token}` },
        body: JSON.stringify({ agent_id: options.agent, type: options.type, payload }),
      });

      if (!res.ok) {
        const errBody = await res.json() as { error?: string };
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const { task } = await res.json() as { task: Task };
      spinner.succeed(chalk.green('Task queued'));
      console.log(chalk.dim(`\n  Task ID: ${task.id}`));
      console.log(chalk.dim(`  Status:  ${task.status}\n`));
    } catch (e) {
      spinner.fail(chalk.red('Failed to send task'));
      console.error(chalk.dim(`  ${(e as Error).message}\n`));
      process.exit(1);
    }
  });

// ── Built-in task executor ────────────────────────────────────────────────────

type ExecuteHandler = (task: Task) => Promise<unknown>;

async function builtinExecute(task: Task): Promise<unknown> {
  const p = (task.payload ?? {}) as Record<string, unknown>;

  switch (task.type) {
    case 'noop':
      return { completed: true };

    case 'echo':
      return task.payload;

    case 'fetch': {
      const { url, method = 'GET', headers, body } = p as {
        url?: string; method?: string;
        headers?: Record<string, string>; body?: unknown;
      };
      if (!url) throw new Error('fetch task requires payload.url');
      const res = await fetch(url, {
        method: (method as string).toUpperCase(),
        headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
        ...(body !== undefined && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
      });
      const ct = res.headers.get('content-type') ?? '';
      const responseBody = ct.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${typeof responseBody === 'string' ? responseBody.slice(0, 200) : JSON.stringify(responseBody).slice(0, 200)}`);
      return { status: res.status, body: responseBody };
    }

    case 'memex-set': {
      const { MemexEngine } = await import('../core/memex/engine.js');
      const { key, value, namespace = 'default', ttl } = p as {
        key?: string; value?: unknown; namespace?: string; ttl?: number;
      };
      if (!key) throw new Error('memex-set requires payload.key');
      const engine = new MemexEngine();
      engine.set(key, value, { namespace, ttlSeconds: ttl });
      return { stored: true, key, namespace };
    }

    case 'memex-get': {
      const { MemexEngine } = await import('../core/memex/engine.js');
      const { key, namespace = 'default' } = p as { key?: string; namespace?: string };
      if (!key) throw new Error('memex-get requires payload.key');
      const engine = new MemexEngine();
      const entry = engine.get(key, namespace);
      return entry ? { found: true, key, namespace, value: entry.value } : { found: false, key, namespace };
    }

    default:
      throw new Error(
        `No built-in handler for task type "${task.type}". ` +
        `Built-in types: noop, echo, fetch, memex-set, memex-get. ` +
        `Provide a custom handler with --handler <file>.`
      );
  }
}

// ── TRACE step emitter ────────────────────────────────────────────────────────

async function emitTraceStep(
  port: number,
  session: string,
  step: { type: string; toolName: string; inputs: unknown; latencyMs: number; output?: unknown; error?: string }
): Promise<void> {
  try {
    await fetch(`http://localhost:${port}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': session },
      body: JSON.stringify(step),
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    // TRACE emission is best-effort — never block the worker
  }
}

// ── hive worker ───────────────────────────────────────────────────────────────

hiveCommand
  .command('worker')
  .description('Start a worker that polls for tasks and executes them')
  .requiredOption('-i, --id <agentId>', 'Agent ID (must match a registered agent)')
  .requiredOption('--token <jwt>', 'JWT token (from cerebrex hive register)')
  .option('--handler <file>', 'Path to a JS module exporting: export async function execute(task) {}')
  .option('--hive-url <url>', 'HIVE coordinator URL', 'http://localhost:7433')
  .option('--poll-interval <ms>', 'How often to poll for new tasks (ms)', '2000')
  .option('--concurrency <n>', 'Max tasks to run in parallel', '1')
  .option('--trace-port <port>', 'TRACE server port to emit steps to')
  .option('--trace-session <id>', 'TRACE session ID to attach steps to')
  .option('--allow-high-risk', 'Allow HIGH-risk task types (fetch, deploy, send, etc.) — off by default')
  .option('--block-medium-risk', 'Block MEDIUM-risk task types (memex-set, write, etc.)')
  .action(async (options) => {
    const agentId: string = options.id;
    const hiveUrl: string = options.hiveUrl;
    const token: string = options.token;
    const pollIntervalMs = parseInt(options.pollInterval, 10);
    const maxConcurrency = parseInt(options.concurrency, 10);
    const tracePort = options.tracePort ? parseInt(options.tracePort, 10) : null;
    const traceSession: string | null = options.traceSession ?? null;
    const riskPolicy = buildPolicy({
      allowHighRisk: options.allowHighRisk ?? false,
      allowMediumRisk: !(options.blockMediumRisk ?? false),
    });

    // ── Load handler ──────────────────────────────────────────────────────────
    let execute: ExecuteHandler;

    if (options.handler) {
      const handlerPath = path.resolve(process.cwd(), options.handler as string);
      if (!fs.existsSync(handlerPath)) {
        console.error(chalk.red(`\n  Handler not found: ${handlerPath}\n`));
        process.exit(1);
      }
      try {
        const mod = await import(handlerPath) as { execute?: ExecuteHandler };
        if (typeof mod.execute !== 'function') {
          console.error(chalk.red('\n  Handler must export: export async function execute(task) { ... }\n'));
          process.exit(1);
        }
        execute = mod.execute;
      } catch (e) {
        console.error(chalk.red(`\n  Failed to load handler: ${(e as Error).message}\n`));
        process.exit(1);
      }
    } else {
      execute = builtinExecute;
    }

    // ── Verify connection ─────────────────────────────────────────────────────
    try {
      const res = await fetch(`${hiveUrl}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const health = await res.json() as { hive: string };
      console.log(chalk.cyan(`\n  🐝 HIVE Worker`));
      console.log(chalk.dim(`  Agent:       ${agentId}`));
      console.log(chalk.dim(`  HIVE:        ${chalk.white(health.hive)} (${hiveUrl})`));
      console.log(chalk.dim(`  Handler:     ${options.handler ? path.basename(options.handler as string) : 'built-in'}`));
      console.log(chalk.dim(`  Poll:        every ${pollIntervalMs}ms`));
      console.log(chalk.dim(`  Concurrency: ${maxConcurrency}`));
      const riskLabel = riskPolicy.allowHigh
        ? chalk.red('HIGH/MEDIUM/LOW')
        : riskPolicy.allowMedium
          ? chalk.yellow('MEDIUM/LOW (high blocked)')
          : chalk.green('LOW only');
      console.log(chalk.dim(`  Risk policy: ${riskLabel}`));
      if (tracePort && traceSession) {
        console.log(chalk.dim(`  Trace:       :${tracePort} / session=${traceSession}`));
      }
      console.log(chalk.dim('\n  Waiting for tasks... (Ctrl+C to stop)\n'));
    } catch (e) {
      console.error(chalk.red(`\n  Cannot reach HIVE at ${hiveUrl}: ${(e as Error).message}`));
      console.error(chalk.dim('  Start the coordinator first: cerebrex hive start\n'));
      process.exit(1);
    }

    // ── Worker loop ───────────────────────────────────────────────────────────
    let inFlight = 0;
    let running = true;

    const processTask = async (task: Task): Promise<void> => {
      inFlight++;
      const start = Date.now();

      // Claim the task — marks it running so other workers skip it
      try {
        const claimRes = await fetch(`${hiveUrl}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'running' }),
        });
        if (!claimRes.ok) { inFlight--; return; }
      } catch { inFlight--; return; }

      const payloadPreview = JSON.stringify(task.payload).slice(0, 60);

      // ── Risk gate — block task if policy doesn't permit it ────────────────────
      const gate = gateAction(task.type, riskPolicy);
      if (!gate.allowed) {
        console.log(`  ${chalk.red('⛔')} ${chalk.bold(task.type)} ${chalk.dim(task.id.slice(0, 8))} ${chalk.red(`[${gate.risk.toUpperCase()}]`)} ${chalk.dim(gate.reason)}`);
        // Mark as failed so the coordinator knows it was blocked
        try {
          await fetch(`${hiveUrl}/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: 'failed', error: gate.reason }),
          });
        } catch { /* best-effort */ }
        inFlight--;
        return;
      }

      console.log(`  ${chalk.yellow('→')} ${chalk.bold(task.type)} ${chalk.dim(task.id.slice(0, 8))} ${chalk.dim(`[${gate.risk}]`)} ${chalk.dim(payloadPreview)}`);

      let result: unknown;
      let taskError: string | undefined;

      try {
        result = await execute(task);
        const ms = Date.now() - start;
        console.log(`  ${chalk.green('✓')} ${chalk.bold(task.type)} ${chalk.dim(`${ms}ms`)}`);

        if (tracePort && traceSession) {
          await emitTraceStep(tracePort, traceSession, {
            type: 'tool_call',
            toolName: `hive:${agentId}:${task.type}`,
            inputs: task.payload,
            latencyMs: ms,
            output: result,
          });
        }
      } catch (e) {
        taskError = (e as Error).message;
        const ms = Date.now() - start;
        console.log(`  ${chalk.red('✗')} ${chalk.bold(task.type)} ${chalk.red(taskError)} ${chalk.dim(`${ms}ms`)}`);

        if (tracePort && traceSession) {
          await emitTraceStep(tracePort, traceSession, {
            type: 'error',
            toolName: `hive:${agentId}:${task.type}`,
            inputs: task.payload,
            latencyMs: ms,
            error: taskError,
          });
        }
      }

      // Report result back to coordinator
      try {
        await fetch(`${hiveUrl}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(
            taskError
              ? { status: 'failed', error: taskError }
              : { status: 'completed', result }
          ),
        });
      } catch {
        // Best-effort — coordinator may have restarted
      }

      inFlight--;
    };

    const poll = async (): Promise<void> => {
      if (inFlight >= maxConcurrency) return;
      try {
        const res = await fetch(
          `${hiveUrl}/tasks?agent_id=${encodeURIComponent(agentId)}&status=queued`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const { tasks } = await res.json() as { tasks: Task[] };

        for (const task of tasks) {
          if (inFlight >= maxConcurrency) break;
          void processTask(task);
        }
      } catch {
        // Coordinator unreachable — will retry on next interval
      }
    };

    void poll();
    const intervalId = setInterval(() => { if (running) void poll(); }, pollIntervalMs);

    process.on('SIGINT', () => {
      running = false;
      clearInterval(intervalId);
      console.log(chalk.dim('\n  Worker shutting down...\n'));
      process.exit(0);
    });

    // Keep process alive until SIGINT
    await new Promise<never>(() => {});
  });

// ── Swarm presets ──────────────────────────────────────────────────────────────

interface SwarmAgent {
  id: string;
  name: string;
  capabilities: string;
  role: string;
}

interface SwarmPreset {
  name: string;
  description: string;
  strategy: 'parallel' | 'pipeline' | 'competitive';
  agents: SwarmAgent[];
  judgePrompt?: string; // competitive only
}

const SWARM_PRESETS: Record<string, SwarmPreset> = {
  'research-and-recommend': {
    name: 'Research & Recommend',
    description: 'Three-agent parallel deep dive: researcher gathers, analyst synthesizes, strategist recommends.',
    strategy: 'parallel',
    agents: [
      { id: 'researcher', name: 'Researcher', capabilities: 'search,read,fetch', role: 'Gather all relevant information and evidence on the topic.' },
      { id: 'analyst',    name: 'Analyst',    capabilities: 'analyze,summarize', role: 'Synthesize the gathered information into structured insights.' },
      { id: 'strategist', name: 'Strategist', capabilities: 'plan,recommend',    role: 'Produce concrete, prioritized recommendations based on the analysis.' },
    ],
  },
  'code-review-pipeline': {
    name: 'Code Review Pipeline',
    description: 'Security → Performance → Maintainability — each agent refines the previous pass.',
    strategy: 'pipeline',
    agents: [
      { id: 'security',        name: 'Security Reviewer',        capabilities: 'security,audit',     role: 'Review for vulnerabilities, injection, auth gaps, and secrets exposure.' },
      { id: 'performance',     name: 'Performance Reviewer',     capabilities: 'performance,profile', role: 'Review for N+1 queries, memory leaks, and algorithmic complexity.' },
      { id: 'maintainability', name: 'Maintainability Reviewer', capabilities: 'refactor,document',  role: 'Review for clarity, testability, and long-term maintainability.' },
    ],
  },
  'best-solution': {
    name: 'Best Solution (Competitive)',
    description: 'Three agents produce competing solutions; coordinator picks the winner.',
    strategy: 'competitive',
    agents: [
      { id: 'solver-a', name: 'Solver A', capabilities: 'solve,implement', role: 'Produce a complete solution optimizing for correctness.' },
      { id: 'solver-b', name: 'Solver B', capabilities: 'solve,implement', role: 'Produce a complete solution optimizing for simplicity.' },
      { id: 'solver-c', name: 'Solver C', capabilities: 'solve,implement', role: 'Produce a complete solution optimizing for performance.' },
    ],
    judgePrompt: 'Evaluate the three solutions. Pick the best one based on overall quality, correctness, and maintainability. Output ONLY the winning solution with a brief justification.',
  },
  'product-spec': {
    name: 'Product Spec',
    description: 'Four specialists build a product spec in parallel: UX, Tech, Business, GTM.',
    strategy: 'parallel',
    agents: [
      { id: 'ux-designer',   name: 'UX Designer',        capabilities: 'design,ux',    role: 'Define user flows, personas, pain points, and UX requirements.' },
      { id: 'tech-lead',     name: 'Tech Lead',           capabilities: 'architecture', role: 'Define technical architecture, stack choices, and feasibility constraints.' },
      { id: 'business',      name: 'Business Analyst',    capabilities: 'business',     role: 'Define success metrics, monetization, and competitive positioning.' },
      { id: 'gtm',           name: 'GTM Strategist',      capabilities: 'marketing',    role: 'Define go-to-market strategy, launch plan, and growth channels.' },
    ],
  },
  'content-pipeline': {
    name: 'Content Pipeline',
    description: 'Research → Draft → Edit — sequential content refinement chain.',
    strategy: 'pipeline',
    agents: [
      { id: 'content-researcher', name: 'Content Researcher', capabilities: 'search,read', role: 'Research the topic thoroughly and produce a detailed brief with sources.' },
      { id: 'writer',             name: 'Writer',             capabilities: 'write',       role: 'Write a complete draft based on the research brief.' },
      { id: 'editor',             name: 'Editor',             capabilities: 'edit,polish', role: 'Edit for clarity, tone, grammar, and impact. Produce the final version.' },
    ],
  },
  'contract-audit': {
    name: 'Smart Contract Audit',
    description: 'Four auditors check reentrancy, access control, economics, and gas in parallel.',
    strategy: 'parallel',
    agents: [
      { id: 'reentrancy-auditor', name: 'Reentrancy Auditor',      capabilities: 'security,solidity', role: 'Find all reentrancy vulnerabilities and cross-function call risks.' },
      { id: 'access-auditor',     name: 'Access Control Auditor',  capabilities: 'security,solidity', role: 'Audit owner/role checks, privilege escalation paths, and missing guards.' },
      { id: 'economics-auditor',  name: 'Economics Auditor',       capabilities: 'defi,math',         role: 'Audit tokenomics, flash loan attack surfaces, and economic exploits.' },
      { id: 'gas-auditor',        name: 'Gas Optimization Auditor', capabilities: 'evm,gas',          role: 'Identify gas inefficiencies, storage layout issues, and optimization opportunities.' },
    ],
  },
};

// ── cerebrex hive swarm ────────────────────────────────────────────────────────

hiveCommand
  .command('swarm')
  .description('Launch a named swarm preset (parallel, pipeline, or competitive)')
  .argument('<preset>', `Preset name. Run ${chalk.dim('cerebrex hive strategies')} to list all.`)
  .argument('<task>', 'The task or objective for the swarm')
  .option('--hive-url <url>', 'HIVE coordinator URL', 'http://localhost:7433')
  .option('--token <jwt>', 'Coordinator admin JWT (optional for local)')
  .option('--dry-run', 'Print the swarm plan without registering agents or sending tasks')
  .addHelpText('after', `
Examples:
  cerebrex hive swarm research-and-recommend "What are the top 5 MCP servers for AI coding agents?"
  cerebrex hive swarm best-solution "Write a rate limiter in TypeScript"
  cerebrex hive swarm code-review-pipeline "Review the auth.ts file for security issues"
  cerebrex hive swarm product-spec "A CLI tool for managing Cloudflare Workers" --dry-run
  `)
  .action(async (presetName: string, task: string, options: {
    hiveUrl: string;
    token?: string;
    dryRun?: boolean;
  }) => {
    const preset = SWARM_PRESETS[presetName];
    if (!preset) {
      console.error(chalk.red(`\n  Unknown preset: "${presetName}"`));
      console.log(chalk.dim(`  Available presets: ${Object.keys(SWARM_PRESETS).join(', ')}\n`));
      process.exit(1);
    }

    console.log(chalk.cyan(`\n  Swarm: ${chalk.bold(preset.name)}`));
    console.log(chalk.dim(`  Strategy: ${preset.strategy} | Agents: ${preset.agents.length}`));
    console.log(chalk.dim(`  Task: "${task}"\n`));

    if (options.dryRun) {
      console.log(chalk.yellow('  [dry-run] Plan:\n'));
      for (const agent of preset.agents) {
        console.log(chalk.bold(`    ${agent.name} (${agent.id})`));
        console.log(chalk.dim(`      Capabilities: ${agent.capabilities}`));
        console.log(chalk.dim(`      Role: ${agent.role}`));
        console.log('');
      }
      if (preset.strategy === 'pipeline') {
        console.log(chalk.dim(`  Execution order:`));
        preset.agents.forEach((a, i) => {
          const arrow = i < preset.agents.length - 1 ? ` → ` : '';
          process.stdout.write(chalk.dim(`    ${a.name}${arrow}`));
        });
        console.log('\n');
      } else if (preset.strategy === 'competitive') {
        console.log(chalk.dim(`  All agents run in parallel, coordinator picks the winner.\n`));
      } else {
        console.log(chalk.dim(`  All agents run simultaneously via Promise.all.\n`));
      }
      return;
    }

    const hiveUrl = options.hiveUrl;
    const authHeader: Record<string, string> = options.token
      ? { Authorization: `Bearer ${options.token}` }
      : {};

    const spinner = ora('Registering swarm agents...').start();

    try {
      // Register all agents
      const agentTokens: Record<string, string> = {};
      for (const agent of preset.agents) {
        const res = await fetch(`${hiveUrl}/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({
            id: agent.id,
            name: agent.name,
            capabilities: agent.capabilities.split(','),
          }),
        });
        const data = await res.json() as { token?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? `Failed to register ${agent.id}`);
        agentTokens[agent.id] = data.token!;
      }

      spinner.text = 'Dispatching tasks...';

      if (preset.strategy === 'parallel' || preset.strategy === 'competitive') {
        // All agents get the same task simultaneously
        for (const agent of preset.agents) {
          const payload = { objective: task, role: agent.role };
          await fetch(`${hiveUrl}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentTokens[agent.id]}` },
            body: JSON.stringify({
              agent_id: agent.id,
              type: preset.strategy === 'competitive' ? 'competitive-solve' : 'parallel-task',
              payload,
            }),
          });
        }
        if (preset.strategy === 'competitive') {
          console.log('');
          console.log(chalk.dim(`  Judge prompt: ${preset.judgePrompt}`));
        }
      } else {
        // Pipeline: first agent gets the raw task, subsequent agents get role context
        const firstAgent = preset.agents[0]!;
        await fetch(`${hiveUrl}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentTokens[firstAgent.id]}` },
          body: JSON.stringify({
            agent_id: firstAgent.id,
            type: 'pipeline-stage',
            payload: { objective: task, role: firstAgent.role, stage: 1, total: preset.agents.length },
          }),
        });
        // Remaining stages are dispatched by each worker after completion (chain pattern)
        // Workers with pipeline-stage type should dispatch to the next agent on completion
      }

      spinner.succeed(chalk.green(`Swarm launched: ${preset.agents.length} agents registered`));
      console.log(chalk.dim(`\n  Strategy: ${chalk.bold(preset.strategy)}`));
      console.log(chalk.dim(`  Agents:   ${preset.agents.map((a) => a.id).join(', ')}`));
      console.log(chalk.dim(`\n  Monitor: cerebrex hive status --url ${hiveUrl}\n`));
    } catch (err) {
      spinner.fail(chalk.red('Swarm launch failed'));
      console.error(chalk.dim(`  ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

// ── cerebrex hive strategies ──────────────────────────────────────────────────

hiveCommand
  .command('strategies')
  .description('List all available swarm strategies and presets')
  .action(() => {
    console.log(chalk.cyan('\n  HIVE Swarm Strategies\n'));

    console.log(chalk.bold('  Execution Strategies\n'));
    console.log(`  ${chalk.green('parallel')}     All agents receive the same task simultaneously via Promise.all.`);
    console.log(`                Best for independent subtasks that don't depend on each other.\n`);
    console.log(`  ${chalk.yellow('pipeline')}     Agents run sequentially — each refines the output of the last.`);
    console.log(`                Best for multi-step refinement: research → draft → edit.\n`);
    console.log(`  ${chalk.red('competitive')}  All agents produce competing solutions. Coordinator picks the best.`);
    console.log(`                Best for finding the optimal answer when quality matters most.\n`);

    console.log(chalk.bold('  Presets\n'));
    for (const [key, preset] of Object.entries(SWARM_PRESETS)) {
      const stratColor = preset.strategy === 'parallel' ? chalk.green : preset.strategy === 'pipeline' ? chalk.yellow : chalk.red;
      console.log(`  ${chalk.bold(key)}`);
      console.log(`    ${preset.description}`);
      console.log(`    ${stratColor(preset.strategy)} · ${preset.agents.length} agents: ${preset.agents.map((a) => a.name).join(' → ')}`);
      console.log('');
    }

    console.log(chalk.dim('  Usage: cerebrex hive swarm <preset> "<task>"\n'));
  });
