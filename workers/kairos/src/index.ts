/**
 * CerebreX KAIROS — Autonomous Agent Daemon + ULTRAPLAN
 *
 * KAIROS: Durable Object daemon with 5-minute tick loop.
 *   Each tick: Claude decides whether to act and returns a structured task.
 *   All actions logged to append-only D1 table — agents cannot delete history.
 *
 * ULTRAPLAN: Submit a goal → Opus produces a full plan → you approve → tasks execute.
 *
 * Built-in task handlers:
 *   noop          — no-op, completes immediately
 *   echo          — returns payload as result
 *   fetch         — HTTP GET/POST to a public URL (SSRF-protected)
 *   memex-set     — write a key to MEMEX KV index for an agent
 *   memex-get     — read a key from MEMEX KV index for an agent
 *   kairos-action — structured task from the daemon (dispatches to sub-handler)
 *   claude-execute — run Claude with a task description, store result in MEMEX
 *
 * © 2026 A Real Cool Co. — Apache 2.0
 */

export interface Env {
  DB: D1Database;
  KAIROS: DurableObjectNamespace;
  TASK_QUEUE: Queue;
  MEMEX_INDEX?: KVNamespace;        // optional — enables memex-set/get task types
  CEREBREX_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  TICK_INTERVAL_MS: string;
  TICK_BUDGET_MS: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_GOAL_BYTES    = 50_000;   // ~12K tokens — generous but bounded
const MAX_PAYLOAD_BYTES = 65_536;   // 64KB per task payload
const MAX_AGENT_ID_LEN  = 128;
const MAX_CREATED_BY_LEN = 64;

// ── Security headers ──────────────────────────────────────────────────────────

function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...securityHeaders(),
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

/** Constant-time string comparison — prevents timing oracle attacks on API keys. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  const maxLen = Math.max(aBuf.length, bBuf.length);
  const aPad = new Uint8Array(maxLen);
  const bPad = new Uint8Array(maxLen);
  aPad.set(aBuf);
  bPad.set(bBuf);
  let diff = aBuf.length ^ bBuf.length;
  for (let i = 0; i < maxLen; i++) diff |= aPad[i]! ^ bPad[i]!;
  return diff === 0;
}

function auth(req: Request, env: Env): boolean {
  if (!env.CEREBREX_API_KEY) return false;
  const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!key) return false;
  return timingSafeEqual(key, env.CEREBREX_API_KEY);
}

/** Validate agentId format — prevent path traversal and injection. */
function validAgentId(s: string): boolean {
  return typeof s === 'string' && s.length > 0 && s.length <= MAX_AGENT_ID_LEN && /^[a-zA-Z0-9_-]+$/.test(s);
}

function nanoid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// ── SSRF Protection ───────────────────────────────────────────────────────────

/**
 * Block private/reserved IP ranges and cloud metadata endpoints.
 * Returns a reason string if blocked, or null if the URL is safe.
 */
function ssrfCheck(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'Invalid URL';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Scheme '${parsed.protocol.replace(':', '')}' not allowed — only http/https`;
  }

  const host = parsed.hostname.toLowerCase();

  // Block localhost and internal DNS suffixes
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.corp')
  ) {
    return `Host '${host}' resolves to a local/internal address`;
  }

  // Block known cloud metadata endpoints
  if (host === 'metadata.google.internal' || host === 'metadata.goog' || host === 'instance-data') {
    return `Host '${host}' is a cloud metadata endpoint`;
  }

  // Block private IPv4 ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b, c] = ipv4.map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 168) ||
      (a === 198 && b >= 18 && b <= 19) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    ) {
      return `IP ${host} is in a private or reserved range`;
    }
  }

  // Block private IPv6 ranges
  const ipv6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1).toLowerCase() : null;
  if (ipv6) {
    if (
      ipv6 === '::1' || ipv6 === '::' ||
      ipv6.startsWith('fc') || ipv6.startsWith('fd') ||
      ipv6.startsWith('fe80') || ipv6.startsWith('::ffff:') ||
      ipv6.startsWith('2001:db8')
    ) {
      return `IPv6 ${host} is in a private or reserved range`;
    }
  }

  return null; // safe
}

// ── Claude API call ───────────────────────────────────────────────────────────

async function claudeCall(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 500,
  timeoutMs = 15_000
): Promise<string> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
    const data = await res.json() as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? '';
  } finally {
    clearTimeout(timer);
  }
}

// ── KairosDaemon — Durable Object ────────────────────────────────────────────

export class KairosDaemon implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname === '/start') {
      await this.state.storage.put('running', true);
      const agentId = url.searchParams.get('agentId') ?? 'unknown';
      await this.state.storage.put('agentId', agentId);
      await this.state.storage.put('tickCount', 0);
      const intervalMs = parseInt(this.env.TICK_INTERVAL_MS, 10) || 300_000;
      await this.state.storage.setAlarm(Date.now() + intervalMs);
      return json({ success: true, message: 'KAIROS daemon started', agentId, intervalMs });
    }

    if (url.pathname === '/stop') {
      await this.state.storage.put('running', false);
      await this.state.storage.deleteAlarm();
      return json({ success: true, message: 'KAIROS daemon stopped' });
    }

    if (url.pathname === '/status' && method === 'GET') {
      const running = (await this.state.storage.get<boolean>('running')) ?? false;
      const agentId = (await this.state.storage.get<string>('agentId')) ?? '';
      const tickCount = (await this.state.storage.get<number>('tickCount')) ?? 0;
      const lastTick = (await this.state.storage.get<string>('lastTick')) ?? null;
      return json({ running, agentId, tickCount, lastTick });
    }

    return json({ error: 'Unknown DO route' }, 404);
  }

  async alarm(): Promise<void> {
    const running = (await this.state.storage.get<boolean>('running')) ?? false;
    if (!running) return;

    const agentId = (await this.state.storage.get<string>('agentId')) ?? 'unknown';
    const tickCount = ((await this.state.storage.get<number>('tickCount')) ?? 0) + 1;
    await this.state.storage.put('tickCount', tickCount);

    const now = new Date().toISOString();
    await this.state.storage.put('lastTick', now);

    const pending = await this.env.DB.prepare(
      `SELECT COUNT(*) as n FROM tasks WHERE agent_id = ? AND status = 'queued'`
    ).bind(agentId).first<{ n: number }>();

    const start = Date.now();
    let decided = false;
    let reasoning = '';
    let taskType = '';
    let taskPayload = '';
    let result = '';

    try {
      const budgetMs = parseInt(this.env.TICK_BUDGET_MS, 10) || 15_000;

      // Ask Claude to return a structured task, not a free-text action string.
      // The task_type must be one of the built-in handlers so it actually executes.
      const tickResponse = await claudeCall(
        this.env.ANTHROPIC_API_KEY,
        'claude-sonnet-4-6',
        `You are a background daemon for agent "${agentId}".
You receive periodic ticks. Decide whether to act or stay quiet.
Budget: ${budgetMs / 1000}s. Only act if genuinely valuable.
Pending tasks in queue: ${pending?.n ?? 0}.

If you decide to act, you MUST specify a concrete task using one of these types:
  - "fetch"     — fetch a URL: payload { "url": "https://...", "method": "GET" }
  - "memex-set" — store a value: payload { "agentId": "${agentId}", "key": "...", "content": "..." }
  - "memex-get" — read a value: payload { "agentId": "${agentId}", "key": "..." }
  - "echo"      — log a message: payload { "message": "..." }
  - "noop"      — do nothing: payload {}

Respond ONLY with valid JSON — no prose, no markdown:
{
  "act": boolean,
  "reasoning": "one sentence",
  "task_type": "fetch|memex-set|memex-get|echo|noop",
  "task_payload": {}
}`,
        `<tick num="${tickCount}" ts="${now}" pending="${pending?.n ?? 0}"/>`
      );

      let parsed: Record<string, unknown>;
      try {
        const raw = JSON.parse(tickResponse);
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new TypeError('tick response must be a JSON object');
        }
        parsed = raw as Record<string, unknown>;
      } catch {
        // Claude returned non-JSON — log and move on without queuing
        reasoning = tickResponse.slice(0, 500);
        result = 'parse-error';
        await this.logTick(agentId, now, false, reasoning, '', result, Date.now() - start);
        await this.reschedule();
        return;
      }

      decided   = parsed['act'] === true;
      reasoning = typeof parsed['reasoning'] === 'string' ? parsed['reasoning'].slice(0, 1000) : '';
      taskType  = typeof parsed['task_type']  === 'string' ? parsed['task_type'].slice(0, 64)  : 'noop';
      const rawPayload = parsed['task_payload'];
      taskPayload = typeof rawPayload === 'object' && rawPayload !== null
        ? JSON.stringify(rawPayload).slice(0, MAX_PAYLOAD_BYTES)
        : '{}';

      if (decided) {
        const taskId = nanoid();
        await this.env.DB.prepare(
          `INSERT INTO tasks (id, agent_id, type, payload, status, source) VALUES (?, ?, ?, ?, 'queued', 'kairos')`
        ).bind(taskId, agentId, taskType, taskPayload).run();
        result = `Queued task ${taskId} (${taskType})`;
      } else {
        result = 'quiet';
      }
    } catch (e) {
      result = `error: ${(e as Error).message}`;
      const errors = ((await this.state.storage.get<number>('consecutiveErrors')) ?? 0) + 1;
      await this.state.storage.put('consecutiveErrors', errors);
      const backoffMs = Math.min(errors * 60_000, 1_800_000);
      const intervalMs = parseInt(this.env.TICK_INTERVAL_MS, 10) || 300_000;
      await this.state.storage.setAlarm(Date.now() + Math.max(intervalMs, backoffMs));
      await this.logTick(agentId, now, false, reasoning, taskType, result, Date.now() - start);
      await this.updateRegistry(agentId, now);
      return;
    }

    await this.state.storage.put('consecutiveErrors', 0);
    await this.logTick(agentId, now, decided, reasoning, taskType, result, Date.now() - start);
    await this.updateRegistry(agentId, now);
    await this.reschedule();
  }

  private async logTick(
    agentId: string, now: string, decided: boolean,
    reasoning: string, action: string, result: string, latencyMs: number
  ): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO daemon_log (agent_id, tick_at, decided, reasoning, action, result, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(agentId, now, decided ? 1 : 0, reasoning, action, result, latencyMs).run();
  }

  private async updateRegistry(agentId: string, now: string): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE daemon_registry SET last_tick = ?, tick_count = tick_count + 1 WHERE agent_id = ?`
    ).bind(now, agentId).run();
  }

  private async reschedule(): Promise<void> {
    const intervalMs = parseInt(this.env.TICK_INTERVAL_MS, 10) || 300_000;
    await this.state.storage.setAlarm(Date.now() + intervalMs);
  }
}

// ── HTTP Router ───────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
        },
      });
    }

    if (pathname === '/health') {
      return json({ status: 'ok', service: 'cerebrex-kairos', version: '1.1.0' });
    }

    if (!auth(request, env)) return err('Unauthorized', 401);

    // ── Daemon management ───────────────────────────────────────────────────
    const daemonMatch = pathname.match(/^\/v1\/agents\/([^/]+)\/daemon(?:\/(.+))?$/);
    if (daemonMatch) {
      const agentId = decodeURIComponent(daemonMatch[1]!);
      if (!validAgentId(agentId)) return err('Invalid agentId — alphanumeric, underscores, hyphens only (1-128 chars)', 400);
      const sub = daemonMatch[2] ?? '';
      const doId = env.KAIROS.idFromName(agentId);
      const stub = env.KAIROS.get(doId);

      if (sub === 'start' && method === 'POST') {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO daemon_registry (agent_id, do_id, started_at, is_active) VALUES (?, ?, datetime('now'), 1)`
        ).bind(agentId, doId.toString()).run();
        return stub.fetch(new Request(`http://do/start?agentId=${encodeURIComponent(agentId)}`));
      }

      if (sub === 'stop' && method === 'POST') {
        await env.DB.prepare(
          `UPDATE daemon_registry SET is_active = 0 WHERE agent_id = ?`
        ).bind(agentId).run();
        return stub.fetch(new Request('http://do/stop'));
      }

      if (sub === 'status' && method === 'GET') {
        return stub.fetch(new Request('http://do/status'));
      }

      if (sub === 'log' && method === 'GET') {
        const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
        const { results } = await env.DB.prepare(
          `SELECT * FROM daemon_log WHERE agent_id = ? ORDER BY tick_at DESC LIMIT ?`
        ).bind(agentId, limit).all();
        return json({ agentId, log: results ?? [] });
      }
    }

    // ── Tasks ───────────────────────────────────────────────────────────────
    const tasksMatch = pathname.match(/^\/v1\/agents\/([^/]+)\/tasks(?:\/([^/]+))?$/);
    if (tasksMatch) {
      const agentId = decodeURIComponent(tasksMatch[1]!);
      if (!validAgentId(agentId)) return err('Invalid agentId — alphanumeric, underscores, hyphens only (1-128 chars)', 400);
      const taskId = tasksMatch[2];

      if (!taskId && method === 'POST') {
        const body = await request.json() as { type: string; payload?: unknown; priority?: number };
        const { type, payload, priority = 5 } = body;
        if (!type || typeof type !== 'string') return err('type is required');
        const id = nanoid();
        await env.DB.prepare(
          `INSERT INTO tasks (id, agent_id, type, payload, priority, source) VALUES (?, ?, ?, ?, ?, 'manual')`
        ).bind(id, agentId, type, payload !== undefined ? JSON.stringify(payload) : null, priority).run();
        return json({ success: true, taskId: id, agentId, type, status: 'queued' });
      }

      if (!taskId && method === 'GET') {
        const status = url.searchParams.get('status');
        const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
        const q = status
          ? env.DB.prepare(`SELECT * FROM tasks WHERE agent_id = ? AND status = ? ORDER BY priority DESC, created_at DESC LIMIT ?`).bind(agentId, status, limit)
          : env.DB.prepare(`SELECT * FROM tasks WHERE agent_id = ? ORDER BY priority DESC, created_at DESC LIMIT ?`).bind(agentId, limit);
        const { results } = await q.all();
        return json({ agentId, tasks: results ?? [] });
      }

      if (taskId && method === 'PATCH') {
        const update = await request.json() as { status?: string; result?: unknown; error?: string };
        if (update.status === 'completed' || update.status === 'failed') {
          await env.DB.prepare(
            `UPDATE tasks SET status = ?, result = ?, error = ?, completed_at = datetime('now')
             WHERE id = ? AND agent_id = ?`
          ).bind(update.status, update.result ? JSON.stringify(update.result) : null, update.error ?? null, taskId, agentId).run();
        } else if (update.status === 'running') {
          await env.DB.prepare(
            `UPDATE tasks SET status = 'running', started_at = datetime('now') WHERE id = ? AND agent_id = ?`
          ).bind(taskId, agentId).run();
        }
        return json({ success: true, taskId, status: update.status });
      }
    }

    // ── ULTRAPLAN ───────────────────────────────────────────────────────────
    if (pathname === '/v1/ultraplan' && method === 'POST') {
      const body = await request.json() as { goal: string; createdBy?: string };
      const { goal, createdBy } = body;

      if (!goal?.trim()) return err('goal is required');
      if (new TextEncoder().encode(goal).length > MAX_GOAL_BYTES) {
        return err(`goal too large — max ${MAX_GOAL_BYTES} bytes`, 413);
      }

      // Validate createdBy — no arbitrary strings stored in D1
      if (createdBy !== undefined) {
        if (typeof createdBy !== 'string') return err('createdBy must be a string', 400);
        if (createdBy.length > MAX_CREATED_BY_LEN) return err(`createdBy exceeds ${MAX_CREATED_BY_LEN} character limit`, 400);
        if (!/^[a-zA-Z0-9 _\-@.]+$/.test(createdBy)) return err('createdBy contains invalid characters', 400);
      }

      const id = nanoid();

      await env.DB.prepare(
        `INSERT INTO ultraplans (id, goal, status, created_by) VALUES (?, ?, 'planning', ?)`
      ).bind(id, goal, createdBy ?? null).run();

      // Use ctx.waitUntil — extends Worker lifetime past response send
      // so the Opus call completes even on slow models (up to CF's 30s subrequest limit)
      const planningPromise = (async () => {
        try {
          const plan = await claudeCall(
            env.ANTHROPIC_API_KEY,
            'claude-opus-4-6',
            `You are an expert planning agent. Given a goal, produce a comprehensive, actionable execution plan.

IMPORTANT: Tasks must use only these supported types so they can actually execute:
  - "fetch"         — HTTP request: payload { "url": "https://...", "method": "GET|POST", "body": {} }
  - "memex-set"     — store knowledge: payload { "agentId": "...", "key": "...", "content": "..." }
  - "memex-get"     — retrieve knowledge: payload { "agentId": "...", "key": "..." }
  - "claude-execute"— run Claude on a subtask: payload { "agentId": "...", "description": "...", "storeKey": "..." }
  - "echo"          — log a note: payload { "message": "..." }
  - "noop"          — placeholder step: payload {}

Format your response as valid JSON only — no prose, no markdown:
{
  "summary": "one-line summary",
  "rationale": "why this approach",
  "tasks": [
    { "type": "string", "description": "string", "payload": {}, "priority": 1-10 }
  ],
  "risks": ["..."],
  "success_criteria": ["..."]
}`,
            `Goal: ${goal}`,
            8000,
            60_000
          );

          // Safe JSON parse — Claude occasionally adds prose before the JSON
          let parsed: { tasks?: Array<{ type: string; description: string; payload?: unknown; priority?: number }> };
          try {
            // Extract first JSON object if Claude wrapped it in text
            const jsonMatch = plan.match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as typeof parsed : { tasks: [] };
          } catch {
            parsed = { tasks: [] };
          }

          await env.DB.prepare(
            `UPDATE ultraplans SET plan = ?, task_count = ?, status = 'pending' WHERE id = ?`
          ).bind(plan, parsed.tasks?.length ?? 0, id).run();
        } catch (e) {
          await env.DB.prepare(
            `UPDATE ultraplans SET status = 'error', plan = ? WHERE id = ?`
          ).bind(`Planning failed: ${(e as Error).message}`, id).run();
        }
      })();

      ctx.waitUntil(planningPromise);

      return json({ success: true, planId: id, status: 'planning', message: 'Opus is thinking...' });
    }

    const planMatch = pathname.match(/^\/v1\/ultraplan\/([^/]+)(?:\/(.+))?$/);
    if (planMatch) {
      const planId = planMatch[1]!;
      const planSub = planMatch[2] ?? '';

      if (!planSub && method === 'GET') {
        const plan = await env.DB.prepare(`SELECT * FROM ultraplans WHERE id = ?`).bind(planId).first();
        if (!plan) return err('Plan not found', 404);
        return json(plan);
      }

      if (planSub === 'approve' && method === 'POST') {
        const plan = await env.DB.prepare(
          `SELECT * FROM ultraplans WHERE id = ? AND status = 'pending'`
        ).bind(planId).first<{ goal: string; plan: string; id: string }>();

        if (!plan) return err('Plan not found or not in pending state', 404);

        // Safe parse — plan may be malformed if Claude returned non-JSON
        let parsedPlan: { tasks?: Array<{ type: string; description: string; payload?: unknown; priority?: number }> };
        try {
          const jsonMatch = plan.plan.match(/\{[\s\S]*\}/);
          parsedPlan = jsonMatch ? JSON.parse(jsonMatch[0]) as typeof parsedPlan : { tasks: [] };
        } catch {
          return err('Plan JSON is malformed — cannot approve. The plan may still be generating, or planning failed. Check plan status.', 422);
        }

        const tasks = parsedPlan.tasks ?? [];
        const agentId = `ultraplan-${planId}`;

        for (const task of tasks) {
          const taskId = nanoid();
          await env.DB.prepare(
            `INSERT INTO tasks (id, agent_id, type, payload, priority, source) VALUES (?, ?, ?, ?, ?, 'ultraplan')`
          ).bind(taskId, agentId, task.type, JSON.stringify(task.payload ?? {}), task.priority ?? 5).run();
        }

        await env.DB.prepare(
          `UPDATE ultraplans SET status = 'executing', approved_at = datetime('now') WHERE id = ?`
        ).bind(planId).run();

        return json({ success: true, planId, tasksQueued: tasks.length, agentId });
      }

      if (planSub === 'reject' && method === 'POST') {
        await env.DB.prepare(
          `UPDATE ultraplans SET status = 'rejected' WHERE id = ?`
        ).bind(planId).run();
        return json({ success: true, planId, status: 'rejected' });
      }
    }

    return err('Not found', 404);
  },

  // ── Queue consumer — process queued tasks ────────────────────────────────
  async queue(batch: MessageBatch<{ taskId: string; agentId: string }>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { taskId, agentId } = msg.body;
      try {
        await env.DB.prepare(
          `UPDATE tasks SET status = 'running', started_at = datetime('now') WHERE id = ?`
        ).bind(taskId).run();

        const task = await env.DB.prepare(
          `SELECT * FROM tasks WHERE id = ?`
        ).bind(taskId).first<{ type: string; payload: string }>();

        if (!task) { msg.ack(); continue; }

        const payload = task.payload ? JSON.parse(task.payload) as Record<string, unknown> : {};

        let result: unknown;

        if (task.type === 'noop') {
          result = { completed: true };

        } else if (task.type === 'echo') {
          result = payload;

        } else if (task.type === 'fetch') {
          // ── SSRF-protected fetch task ──────────────────────────────────
          const { url, method = 'GET', headers, body } = payload as {
            url?: string; method?: string; headers?: Record<string, string>; body?: unknown;
          };
          if (!url) throw new Error('fetch task requires payload.url');

          const blocked = ssrfCheck(url);
          if (blocked) throw new Error(`SSRF protection blocked request: ${blocked}`);

          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
            ...(body !== undefined && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
          });
          const ct = res.headers.get('content-type') ?? '';
          result = {
            status: res.status,
            body: ct.includes('application/json') ? await res.json() : await res.text(),
          };

        } else if (task.type === 'memex-set') {
          // ── Write to MEMEX KV index ────────────────────────────────────
          const { agentId: targetAgent, key, content } = payload as {
            agentId?: string; key?: string; content?: string;
          };
          if (!targetAgent || !key || content === undefined) {
            throw new Error('memex-set requires agentId, key, and content');
          }
          if (!env.MEMEX_INDEX) throw new Error('MEMEX_INDEX binding not configured');
          const kvKey = `memex:index:${targetAgent}`;
          const existing = (await env.MEMEX_INDEX.get(kvKey)) ?? '';
          const updated = existing
            ? `${existing}\n- [${key}] ${content}`
            : `- [${key}] ${content}`;
          await env.MEMEX_INDEX.put(kvKey, updated.slice(0, 25_000));
          result = { success: true, agentId: targetAgent, key };

        } else if (task.type === 'memex-get') {
          // ── Read from MEMEX KV index ───────────────────────────────────
          const { agentId: targetAgent, key } = payload as { agentId?: string; key?: string };
          if (!targetAgent) throw new Error('memex-get requires agentId');
          if (!env.MEMEX_INDEX) throw new Error('MEMEX_INDEX binding not configured');
          const kvKey = `memex:index:${targetAgent}`;
          const content = await env.MEMEX_INDEX.get(kvKey);
          // If a specific key is requested, extract that line
          if (key && content) {
            const lines = content.split('\n').filter((l) => l.includes(`[${key}]`));
            result = { agentId: targetAgent, key, content: lines.join('\n') || null };
          } else {
            result = { agentId: targetAgent, content };
          }

        } else if (task.type === 'claude-execute') {
          // ── Run Claude on a subtask description ───────────────────────
          const { agentId: targetAgent, description, storeKey, context } = payload as {
            agentId?: string; description?: string; storeKey?: string; context?: string;
          };
          if (!description) throw new Error('claude-execute requires description');
          if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

          const response = await claudeCall(
            env.ANTHROPIC_API_KEY,
            'claude-sonnet-4-6',
            `You are an autonomous agent executing a specific task. Be concise and complete.`,
            context ? `Context:\n${context}\n\nTask: ${description}` : `Task: ${description}`,
            2000,
            30_000
          );

          result = { description, response: response.slice(0, 10_000) };

          // Optionally persist the result to MEMEX
          if (storeKey && targetAgent && env.MEMEX_INDEX) {
            const kvKey = `memex:index:${targetAgent}`;
            const existing = (await env.MEMEX_INDEX.get(kvKey)) ?? '';
            const entry = `- [${storeKey}] ${response.slice(0, 500)}`;
            await env.MEMEX_INDEX.put(kvKey, `${existing}\n${entry}`.slice(0, 25_000));
          }

        } else if (task.type === 'kairos-action') {
          // ── Daemon-generated structured action — re-dispatch by task_type ──
          const { task_type, task_payload } = payload as {
            task_type?: string; task_payload?: Record<string, unknown>;
          };
          if (task_type && task_type !== 'kairos-action') {
            // Re-queue as the concrete type so it executes on the next batch
            const subId = nanoid();
            await env.DB.prepare(
              `INSERT INTO tasks (id, agent_id, type, payload, priority, source) VALUES (?, ?, ?, ?, 5, 'kairos-redispatch')`
            ).bind(subId, agentId, task_type, JSON.stringify(task_payload ?? {})).run();
            result = { redispatched: true, subTaskId: subId, subTaskType: task_type };
          } else {
            result = { acknowledged: true, payload };
          }

        } else {
          result = { message: `task type "${task.type}" requires an external handler` };
        }

        await env.DB.prepare(
          `UPDATE tasks SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?`
        ).bind(JSON.stringify(result), taskId).run();

        msg.ack();
      } catch (e) {
        await env.DB.prepare(
          `UPDATE tasks SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`
        ).bind((e as Error).message, taskId).run();
        msg.ack();
      }
    }
  },
};
