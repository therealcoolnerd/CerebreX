/**
 * HIVE — Multi-agent coordination for CerebreX
 *
 * cerebrex hive init          — Initialize a HIVE config in this directory
 * cerebrex hive start         — Start the local HIVE coordinator
 * cerebrex hive register      — Register an agent with the active HIVE
 * cerebrex hive status        — Show active agents and task queue
 * cerebrex hive send          — Send a task to a registered agent
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'node:http';
import crypto from 'node:crypto';

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
    const [header, body, sig] = parts;

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

function saveState(configDir: string, state: HiveState): void {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(getStateFile(configDir), JSON.stringify(state, null, 2));
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

    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
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

      // POST /token — issue a JWT for an agent
      if (url.pathname === '/token' && method === 'POST') {
        return withBody((body) => {
          const { agent_id, agent_name } = body as { agent_id?: string; agent_name?: string };
          if (!agent_id) return sendJson({ error: 'agent_id required' }, 400);
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

      // GET /tasks — list tasks (optionally filter by agent)
      if (url.pathname === '/tasks' && method === 'GET') {
        const agentId = url.searchParams.get('agent_id');
        const tasks = agentId ? state.tasks.filter((t) => t.agent_id === agentId) : state.tasks;
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
      // Get a JWT first
      const tokenRes = await fetch(`${options.hiveUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: options.id, agent_name: options.name }),
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
