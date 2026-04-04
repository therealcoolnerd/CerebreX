/**
 * CerebreX MEMEX v2 — Three-Layer Agent Memory
 *
 * Layer 1 — KV pointer index   (MEMEX_INDEX): always hot, ≤200 lines, MEMORY.md-style
 * Layer 2 — R2 topic files     (MEMEX_TOPICS): per-topic knowledge, fetched on demand
 * Layer 3 — D1 transcripts     (DB):           session history, grep/search only
 *
 * autoDream — nightly cron (03:00 UTC) consolidates layers 2+3 → layer 1 via Claude
 *
 * © 2026 A Real Cool Co. — Apache 2.0
 */

export interface Env {
  DB: D1Database;
  MEMEX_INDEX: KVNamespace;
  MEMEX_TOPICS: R2Bucket;
  CEREBREX_API_KEY: string;
  ANTHROPIC_API_KEY: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

function auth(req: Request, env: Env): boolean {
  const key = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return key === env.CEREBREX_API_KEY;
}

// ── autoDream — 4-phase memory consolidation ──────────────────────────────────

async function runAutoDream(agentId: string, env: Env): Promise<void> {
  // Phase 1: Orient — read existing index
  const index = (await env.MEMEX_INDEX.get(`memex:index:${agentId}`)) ?? '';

  // Phase 2: Gather — pull last 50 session transcripts
  const { results } = await env.DB.prepare(
    `SELECT content FROM transcripts WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50`
  ).bind(agentId).all<{ content: string }>();

  if (!results?.length && !index) return; // nothing to consolidate

  const recentContent = (results ?? []).map((r) => r.content).join('\n---\n');

  // Phase 3: Consolidate — Claude synthesizes memory
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: `You are performing a memory consolidation pass for an AI agent.
Your job: synthesize the existing memory index and recent session transcripts into a clean, durable MEMORY.md-style index.

Rules:
- Convert vague notes into definite, actionable facts
- Remove contradicted or superseded information
- Keep entries atomic: one fact per line
- Group by semantic topic (use ## headers)
- Output ONLY the updated MEMORY.md content
- Strict limit: 200 lines, under 25KB
- Omit anything that cannot be verified from the provided context`,
      messages: [{
        role: 'user',
        content: `## Existing index\n\n${index || '(empty)'}\n\n## Recent sessions\n\n${recentContent || '(none)'}`,
      }],
    }),
  });

  if (!response.ok) return;
  const result = await response.json() as { content?: Array<{ text?: string }> };
  const consolidated = result.content?.[0]?.text ?? '';

  if (!consolidated) return;

  // Phase 4: Prune — enforce 200 line / 25KB hard limits
  const lines = consolidated.split('\n').slice(0, 200);
  const pruned = lines.join('\n').substring(0, 25_000);

  await env.MEMEX_INDEX.put(`memex:index:${agentId}`, pruned);
  await env.DB.prepare(
    `UPDATE agents SET last_consolidation = datetime('now'), session_count = 0 WHERE agent_id = ?`
  ).bind(agentId).run();
}

// ── Context assembler ─────────────────────────────────────────────────────────

async function assembleContext(
  agentId: string,
  topics: string[],
  env: Env
): Promise<{ index: string; topicFiles: Record<string, string>; recentTranscripts: string[] }> {
  const [index, ...topicResults] = await Promise.all([
    env.MEMEX_INDEX.get(`memex:index:${agentId}`).then((v) => v ?? ''),
    ...topics.map(async (t) => {
      const obj = await env.MEMEX_TOPICS.get(`memex/${agentId}/${t}.md`);
      return obj ? { topic: t, content: await obj.text() } : null;
    }),
  ]);

  const topicFiles: Record<string, string> = {};
  for (const r of topicResults) {
    if (r) topicFiles[r.topic] = r.content;
  }

  const { results } = await env.DB.prepare(
    `SELECT content FROM transcripts WHERE agent_id = ? ORDER BY created_at DESC LIMIT 10`
  ).bind(agentId).all<{ content: string }>();

  return {
    index,
    topicFiles,
    recentTranscripts: (results ?? []).map((r) => r.content),
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  // ── HTTP requests ────────────────────────────────────────────────────────
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
      return json({ status: 'ok', service: 'cerebrex-memex', version: '2.0.0' });
    }

    if (!auth(request, env)) return err('Unauthorized', 401);

    // ── Agent management ────────────────────────────────────────────────────
    const agentMatch = pathname.match(
      /^\/v1\/agents\/([^/]+)\/memory(?:\/(.+))?$/
    );
    if (!agentMatch) return err('Not found', 404);

    const agentId = decodeURIComponent(agentMatch[1]!);
    const sub = agentMatch[2] ?? '';

    // Ensure agent record exists
    await env.DB.prepare(
      `INSERT OR IGNORE INTO agents (agent_id) VALUES (?)`
    ).bind(agentId).run();

    // ── Layer 1: KV index ────────────────────────────────────────────────
    if (sub === 'index') {
      if (method === 'GET') {
        const content = await env.MEMEX_INDEX.get(`memex:index:${agentId}`);
        return json({ agentId, index: content ?? '', exists: content !== null });
      }
      if (method === 'POST' || method === 'PUT') {
        const { content } = await request.json() as { content: string };
        if (typeof content !== 'string') return err('content must be a string');
        const lines = content.split('\n').slice(0, 200).join('\n').substring(0, 25_000);
        await env.MEMEX_INDEX.put(`memex:index:${agentId}`, lines);
        return json({ success: true, agentId, lines: lines.split('\n').length });
      }
      if (method === 'DELETE') {
        await env.MEMEX_INDEX.delete(`memex:index:${agentId}`);
        return json({ success: true });
      }
    }

    // ── Layer 2: R2 topic files ──────────────────────────────────────────
    if (sub === 'topics') {
      if (method === 'GET') {
        const list = await env.MEMEX_TOPICS.list({ prefix: `memex/${agentId}/` });
        const topics = list.objects.map((o) => o.key.replace(`memex/${agentId}/`, '').replace('.md', ''));
        return json({ agentId, topics });
      }
    }

    const topicMatch = sub.match(/^topics\/(.+)$/);
    if (topicMatch) {
      const topic = topicMatch[1]!;
      const key = `memex/${agentId}/${topic}.md`;

      if (method === 'GET') {
        const obj = await env.MEMEX_TOPICS.get(key);
        if (!obj) return err(`Topic "${topic}" not found`, 404);
        return json({ agentId, topic, content: await obj.text() });
      }
      if (method === 'POST' || method === 'PUT') {
        const { content } = await request.json() as { content: string };
        if (typeof content !== 'string') return err('content must be a string');
        await env.MEMEX_TOPICS.put(key, content, {
          httpMetadata: { contentType: 'text/markdown' },
        });
        return json({ success: true, agentId, topic });
      }
      if (method === 'DELETE') {
        await env.MEMEX_TOPICS.delete(key);
        return json({ success: true, agentId, topic });
      }
    }

    // ── Layer 3: D1 transcripts ──────────────────────────────────────────
    if (sub === 'transcripts') {
      if (method === 'POST') {
        const { content, sessionId } = await request.json() as { content: string; sessionId?: string };
        if (typeof content !== 'string') return err('content must be a string');
        const tokens = Math.ceil(content.length / 4); // rough estimate
        await env.DB.prepare(
          `INSERT INTO transcripts (agent_id, session_id, content, token_count) VALUES (?, ?, ?, ?)`
        ).bind(agentId, sessionId ?? null, content, tokens).run();
        await env.DB.prepare(
          `UPDATE agents SET session_count = session_count + 1 WHERE agent_id = ?`
        ).bind(agentId).run();
        return json({ success: true, agentId, sessionId });
      }
    }

    if (sub === 'transcripts/search') {
      if (method === 'GET') {
        const q = url.searchParams.get('q') ?? '';
        const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
        if (!q) return err('q is required');
        const { results } = await env.DB.prepare(
          `SELECT id, session_id, content, created_at FROM transcripts
           WHERE agent_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT ?`
        ).bind(agentId, `%${q}%`, limit).all<{
          id: number; session_id: string | null; content: string; created_at: string;
        }>();
        return json({ agentId, query: q, results: results ?? [] });
      }
    }

    // ── Context assembly ─────────────────────────────────────────────────
    if (sub === 'context') {
      if (method === 'POST') {
        const { topics = [], baseSystemPrompt = '' } = await request.json() as {
          topics?: string[];
          baseSystemPrompt?: string;
        };
        const ctx = await assembleContext(agentId, topics, env);
        const parts: string[] = [];

        if (baseSystemPrompt) parts.push(baseSystemPrompt);
        if (ctx.index) parts.push(`\n## Agent Memory (Index)\n\n${ctx.index}`);
        for (const [topic, content] of Object.entries(ctx.topicFiles)) {
          parts.push(`\n## Memory: ${topic}\n\n${content}`);
        }
        if (ctx.recentTranscripts.length) {
          parts.push(`\n## Recent Sessions\n\n${ctx.recentTranscripts.slice(0, 5).join('\n---\n')}`);
        }

        return json({
          agentId,
          systemPrompt: parts.join('\n'),
          layers: {
            index: ctx.index.length,
            topics: Object.keys(ctx.topicFiles).length,
            transcripts: ctx.recentTranscripts.length,
          },
        });
      }
    }

    // ── Manual consolidation ─────────────────────────────────────────────
    if (sub === 'consolidate') {
      if (method === 'POST') {
        await runAutoDream(agentId, env);
        return json({ success: true, agentId, message: 'autoDream consolidation complete' });
      }
    }

    // ── Agent status ─────────────────────────────────────────────────────
    if (sub === 'status' || sub === '') {
      if (method === 'GET') {
        const agent = await env.DB.prepare(
          `SELECT * FROM agents WHERE agent_id = ?`
        ).bind(agentId).first<{
          agent_id: string; created_at: string; last_consolidation: string | null; session_count: number;
        }>();
        const indexContent = await env.MEMEX_INDEX.get(`memex:index:${agentId}`);
        const topicList = await env.MEMEX_TOPICS.list({ prefix: `memex/${agentId}/` });
        return json({
          agentId,
          exists: !!agent,
          created_at: agent?.created_at,
          last_consolidation: agent?.last_consolidation,
          session_count: agent?.session_count ?? 0,
          index_lines: indexContent ? indexContent.split('\n').length : 0,
          topic_count: topicList.objects.length,
        });
      }
    }

    return err('Not found', 404);
  },

  // ── Scheduled autoDream (03:00 UTC daily) ────────────────────────────────
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const { results } = await env.DB.prepare(
        `SELECT agent_id FROM agents WHERE
         (last_consolidation IS NULL OR last_consolidation < datetime('now', '-23 hours'))
         AND session_count >= 3`
      ).all<{ agent_id: string }>();

      const agents = results ?? [];
      console.log(`autoDream: consolidating ${agents.length} agent(s)`);

      // Process in serial to stay within CPU limits
      for (const { agent_id } of agents) {
        try {
          await runAutoDream(agent_id, env);
          console.log(`autoDream: consolidated ${agent_id}`);
        } catch (e) {
          console.error(`autoDream: failed for ${agent_id}:`, e);
        }
      }
    })());
  },
};
