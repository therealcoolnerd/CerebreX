/**
 * CerebreX KAIROS — Autonomous Agent Daemon + ULTRAPLAN
 *
 * KAIROS: Durable Object daemon with 5-minute tick loop.
 *   Each tick: Claude decides whether to act or stay quiet (15s budget).
 *   All actions logged to append-only D1 table — agents cannot delete history.
 *
 * ULTRAPLAN: Submit a goal → Opus produces a full plan → you approve → tasks execute.
 *
 * © 2026 A Real Cool Co. — Apache 2.0
 */

export interface Env {
  DB: D1Database;
  KAIROS: DurableObjectNamespace;
  TASK_QUEUE: Queue;
  CEREBREX_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  TICK_INTERVAL_MS: string;
  TICK_BUDGET_MS: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function err(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

function auth(req: Request, env: Env): boolean {
  const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return key === env.CEREBREX_API_KEY;
}

function nanoid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
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
      body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }),
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

    // Pull pending task count for context
    const pending = await this.env.DB.prepare(
      `SELECT COUNT(*) as n FROM tasks WHERE agent_id = ? AND status = 'queued'`
    ).bind(agentId).first<{ n: number }>();

    const start = Date.now();
    let decided = false;
    let reasoning = '';
    let action = '';
    let result = '';

    try {
      const budgetMs = parseInt(this.env.TICK_BUDGET_MS, 10) || 15_000;
      const tickResponse = await claudeCall(
        this.env.ANTHROPIC_API_KEY,
        'claude-sonnet-4-6',
        `You are a background daemon for agent "${agentId}".
You receive periodic ticks. Decide whether to act or stay quiet.
Budget: ${budgetMs / 1000}s. Be brief. Only act if genuinely valuable.
Pending tasks in queue: ${pending?.n ?? 0}.
Respond with JSON: { "act": boolean, "reasoning": string, "action"?: string }`,
        `<tick num="${tickCount}" ts="${now}" pending="${pending?.n ?? 0}"/>`
      );

      try {
        const parsed = JSON.parse(tickResponse) as { act?: boolean; reasoning?: string; action?: string };
        decided = parsed.act ?? false;
        reasoning = parsed.reasoning ?? '';
        action = parsed.action ?? '';

        if (decided && action) {
          // Queue the proactive action as a task
          const taskId = nanoid();
          await this.env.DB.prepare(
            `INSERT INTO tasks (id, agent_id, type, payload, status, source) VALUES (?, ?, 'kairos-action', ?, 'queued', 'kairos')`
          ).bind(taskId, agentId, JSON.stringify({ action })).run();
          result = `Queued task ${taskId}`;
        } else {
          result = 'quiet';
        }
      } catch {
        reasoning = tickResponse.slice(0, 500);
        result = 'parse-error';
      }
    } catch (e) {
      result = `error: ${(e as Error).message}`;
    }

    // Append-only log — never delete
    await this.env.DB.prepare(
      `INSERT INTO daemon_log (agent_id, tick_at, decided, reasoning, action, result, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(agentId, now, decided ? 1 : 0, reasoning, action, result, Date.now() - start).run();

    await this.env.DB.prepare(
      `UPDATE daemon_registry SET last_tick = ?, tick_count = tick_count + 1 WHERE agent_id = ?`
    ).bind(now, agentId).run();

    // Reschedule next tick
    const intervalMs = parseInt(this.env.TICK_INTERVAL_MS, 10) || 300_000;
    await this.state.storage.setAlarm(Date.now() + intervalMs);
  }
}

// ── HTTP Router ───────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
      return json({ status: 'ok', service: 'cerebrex-kairos', version: '1.0.0' });
    }

    if (!auth(request, env)) return err('Unauthorized', 401);

    // ── Daemon management ───────────────────────────────────────────────────
    const daemonMatch = pathname.match(/^\/v1\/agents\/([^/]+)\/daemon(?:\/(.+))?$/);
    if (daemonMatch) {
      const agentId = decodeURIComponent(daemonMatch[1]!);
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
      const taskId = tasksMatch[2];

      if (!taskId && method === 'POST') {
        const { type, payload, priority = 5 } = await request.json() as {
          type: string; payload?: unknown; priority?: number;
        };
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
      const { goal, createdBy } = await request.json() as { goal: string; createdBy?: string };
      if (!goal?.trim()) return err('goal is required');

      const id = nanoid();

      // Async Opus planning — fire and store result when done
      const planningPromise = (async () => {
        try {
          const plan = await claudeCall(
            env.ANTHROPIC_API_KEY,
            'claude-opus-4-6',
            `You are an expert planning agent.
Given a goal, produce a comprehensive, actionable execution plan.
Format your response as JSON:
{
  "summary": "one-line summary",
  "rationale": "why this approach",
  "tasks": [
    { "type": "string", "description": "string", "payload": {}, "priority": 1-10 }
  ],
  "risks": ["..."],
  "success_criteria": ["..."]
}
Be thorough. Think through edge cases. Opus-quality output required.`,
            `Goal: ${goal}`,
            8000,
            60_000
          );

          const parsed = JSON.parse(plan) as { tasks?: Array<{ type: string; description: string; payload?: unknown; priority?: number }> };
          await env.DB.prepare(
            `UPDATE ultraplans SET plan = ?, task_count = ?, status = 'pending' WHERE id = ?`
          ).bind(plan, parsed.tasks?.length ?? 0, id).run();
        } catch (e) {
          await env.DB.prepare(
            `UPDATE ultraplans SET status = 'error', plan = ? WHERE id = ?`
          ).bind(`Planning failed: ${(e as Error).message}`, id).run();
        }
      })();

      await env.DB.prepare(
        `INSERT INTO ultraplans (id, goal, status, created_by) VALUES (?, ?, 'planning', ?)`
      ).bind(id, goal, createdBy ?? null).run();

      // Don't await — let it run async
      void planningPromise;

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

        const parsed = JSON.parse(plan.plan) as {
          tasks?: Array<{ type: string; description: string; payload?: unknown; priority?: number }>;
        };
        const tasks = parsed.tasks ?? [];
        const agentId = `ultraplan-${planId}`;

        // Queue all tasks simultaneously
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

        // Built-in handlers
        let result: unknown;
        if (task.type === 'noop') {
          result = { completed: true };
        } else if (task.type === 'echo') {
          result = payload;
        } else if (task.type === 'fetch') {
          const { url, method = 'GET', headers, body } = payload as {
            url?: string; method?: string; headers?: Record<string, string>; body?: unknown;
          };
          if (!url) throw new Error('fetch task requires payload.url');
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
        } else if (task.type === 'kairos-action') {
          result = { message: `kairos action acknowledged: ${(payload as { action?: string }).action ?? ''}` };
        } else {
          result = { message: `task type "${task.type}" requires external handler` };
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
