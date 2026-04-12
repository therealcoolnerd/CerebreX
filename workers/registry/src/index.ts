/**
 * CerebreX Registry — Cloudflare Worker
 * Handles publish, install, search, and web UI for MCP server packages.
 *
 * Bindings:
 *   DB       — D1 database (package metadata)
 *   TARBALLS — KV namespace (tarball blobs)
 *
 * Routes:
 *   GET  /              — Registry browser UI (HTML)
 *   GET  /ui/trace      — Hosted trace explorer UI (HTML)
 *   GET  /v1/packages   — list / search packages (JSON API)
 *   POST /v1/packages   — publish a package
 *   GET  /v1/packages/:name              — all versions
 *   GET  /v1/packages/:name/:version     — specific version metadata
 *   GET  /v1/packages/:name/:version/download — download tarball
 *   DELETE /v1/packages/:name/:version   — unpublish (auth required)
 *   GET  /health        — liveness check
 */

export interface Env {
  DB: D1Database;
  TARBALLS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  ENVIRONMENT: string;
  REGISTRY_ADMIN_TOKEN?: string;
}

// ── Security + CORS helpers ───────────────────────────────────────────────────

const ALLOWED_ORIGIN = 'https://registry.therealcool.site';

function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
  };
}

function corsHeaders(req?: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

/** Restricted CORS for admin routes — only the registry's own origin. */
function adminCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') ?? '';
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...securityHeaders(), ...corsHeaders(), ...extra },
  });
}

function adminJson(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...securityHeaders(), ...adminCorsHeaders(req) },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...securityHeaders(),
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self' https:",
        "frame-ancestors 'none'",
      ].join('; '),
    },
  });
}

function err(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function getToken(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison — prevents timing oracle attacks on admin tokens. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  const maxLen = Math.max(aBuf.length, bBuf.length);
  const aPad = new Uint8Array(maxLen);
  const bPad = new Uint8Array(maxLen);
  aPad.set(aBuf); bPad.set(bBuf);
  let diff = aBuf.length ^ bBuf.length;
  for (let i = 0; i < maxLen; i++) diff |= aPad[i]! ^ bPad[i]!;
  return diff === 0;
}

// ── Semver helpers ────────────────────────────────────────────────────────────

function semverParse(v: string): [number, number, number] {
  const parts = v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function semverGt(a: string, b: string): boolean {
  const [a1, a2, a3] = semverParse(a);
  const [b1, b2, b3] = semverParse(b);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

async function resolveLatestVersion(env: Env, name: string): Promise<string | null> {
  const { results } = await env.DB.prepare(
    'SELECT version FROM packages WHERE name = ? AND deprecated = 0'
  ).bind(name).all<{ version: string }>();
  if (!results?.length) {
    // Fall back to deprecated versions if all are deprecated
    const fallback = await env.DB.prepare(
      'SELECT version FROM packages WHERE name = ? ORDER BY published_at DESC LIMIT 1'
    ).bind(name).first<{ version: string }>();
    return fallback?.version ?? null;
  }
  return results.reduce((best, row) => semverGt(row.version, best.version) ? row : best).version;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMITS_CONFIG = {
  publish:      { windowMs: 60_000,       max: 10  },
  search:       { windowMs: 60_000,       max: 200 },
  signup:       { windowMs: 3_600_000,    max: 3   },  // 3 new accounts per IP per hour
  download:     { windowMs: 60_000,       max: 300 },
  memex_write:  { windowMs: 60_000,       max: 120 },  // 2/sec sustained memex writes
  hive_write:   { windowMs: 60_000,       max: 30  },  // 30 hive mutations per minute
} as const;

type RateLimitAction = keyof typeof RATE_LIMITS_CONFIG;

async function checkRateLimit(request: Request, action: RateLimitAction, env: Env): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? 'unknown';
  const { windowMs, max } = RATE_LIMITS_CONFIG[action];
  const window = Math.floor(Date.now() / windowMs);
  const key = `rl:${action}:${ip}:${window}`;

  const raw = await env.RATE_LIMITS.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= max) return false; // rate limit exceeded

  // Increment — store for 2 windows to cover boundary reads
  await env.RATE_LIMITS.put(key, String(count + 1), { expirationTtl: Math.ceil((windowMs * 2) / 1000) });
  return true;
}

async function validateToken(token: string, env: Env): Promise<{ valid: boolean; owner: string; hash: string }> {
  const hash = await hashToken(token);
  const row = await env.DB.prepare(
    'SELECT owner, expires_at FROM tokens WHERE token_hash = ?'
  ).bind(hash).first<{ owner: string; expires_at: string | null }>();
  if (!row) return { valid: false, owner: '', hash };
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { valid: false, owner: '', hash }; // expired
  }
  await env.DB.prepare(
    'UPDATE tokens SET last_used_at = ? WHERE token_hash = ?'
  ).bind(new Date().toISOString(), hash).run();
  return { valid: true, owner: row.owner, hash };
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── Web UI routes ──────────────────────────────────────────────────────
    if (method === 'GET' && (pathname === '/' || pathname === '/ui' || pathname === '/ui/')) {
      return html(await registryUI(env));
    }

    if (method === 'GET' && (pathname === '/ui/trace' || pathname === '/ui/trace/')) {
      return new Response(null, { status: 302, headers: { Location: '/#trace' } });
    }

    // ── PWA assets ─────────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/manifest.json') {
      return new Response(JSON.stringify({
        name: 'CerebreX Registry',
        short_name: 'CerebreX',
        description: 'Agent Infrastructure OS — browse packages, explore traces, manage hives',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0a0a0f',
        theme_color: '#00d4ff',
        categories: ['developer', 'utilities'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        screenshots: [
          { src: '/', sizes: '1280x720', type: 'image/png', label: 'Registry browser' },
        ],
      }), {
        headers: {
          'Content-Type': 'application/manifest+json',
          'Cache-Control': 'public, max-age=86400',
          ...corsHeaders(),
        },
      });
    }

    if (method === 'GET' && pathname === '/sw.js') {
      return new Response(
        `const CACHE='cerebrex-v1';
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/'])));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{e.waitUntil(clients.claim());});
self.addEventListener('fetch',e=>{
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).catch(()=>caches.match('/')));
  }
});`,
        {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'public, max-age=3600',
          },
        }
      );
    }

    // ── Health ─────────────────────────────────────────────────────────────
    if (pathname === '/health' && method === 'GET') {
      return json({ status: 'ok', version: '1.0.0' });
    }

    // ── API v1 ─────────────────────────────────────────────────────────────

    // POST /v1/auth/signup      — self-service account creation (open, rate-limited)
    if (pathname === '/v1/auth/signup' && method === 'POST') {
      return handleAuthSignup(request, env);
    }

    // POST /v1/auth/register     — create a publish token (admin only)
    if (pathname === '/v1/auth/register' && method === 'POST') {
      return handleAuthRegister(request, env);
    }

    // POST /v1/auth/tokens       — self-service additional token creation
    if (pathname === '/v1/auth/tokens' && method === 'POST') {
      return handleCreateToken(request, env);
    }

    // DELETE /v1/auth/token      — revoke the current token
    if (pathname === '/v1/auth/token' && method === 'DELETE') {
      return handleRevokeToken(request, env);
    }

    // GET /v1/packages           — list / search packages
    if (pathname === '/v1/packages' && method === 'GET') {
      return handleList(request, env, searchParams);
    }

    // POST /v1/packages          — publish a package
    if (pathname === '/v1/packages' && method === 'POST') {
      return handlePublish(request, env);
    }

    // GET /v1/packages/:name
    const pkgMatch = pathname.match(/^\/v1\/packages\/([^/]+)$/);
    if (pkgMatch && method === 'GET') {
      return handleGetPackage(env, decodeURIComponent(pkgMatch[1]));
    }

    // POST /v1/packages/:name/:version/deprecate
    const deprecateMatch = pathname.match(/^\/v1\/packages\/([^/]+)\/([^/]+)\/deprecate$/);
    if (deprecateMatch && method === 'POST') {
      const [, name, version] = deprecateMatch;
      return handleDeprecate(request, env, decodeURIComponent(name), decodeURIComponent(version));
    }

    // GET|DELETE /v1/packages/:name/:version
    const versionMatch = pathname.match(/^\/v1\/packages\/([^/]+)\/([^/]+)$/);
    if (versionMatch && method === 'GET') {
      const [, name, version] = versionMatch;
      return handleGetVersion(env, decodeURIComponent(name), decodeURIComponent(version));
    }
    if (versionMatch && method === 'DELETE') {
      const [, name, version] = versionMatch;
      return handleUnpublish(request, env, decodeURIComponent(name), decodeURIComponent(version));
    }

    // GET /v1/packages/:name/:version/download
    const downloadMatch = pathname.match(/^\/v1\/packages\/([^/]+)\/([^/]+)\/download$/);
    if (downloadMatch && method === 'GET') {
      const [, name, version] = downloadMatch;
      return handleDownload(env, request, decodeURIComponent(name), decodeURIComponent(version));
    }

    // ── User profile routes ─────────────────────────────────────────────────
    if (pathname === '/v1/users/me' && method === 'GET') return handleGetMe(request, env);
    if (pathname === '/v1/users/me' && method === 'PATCH') return handleUpdateMe(request, env);

    const userMatch = pathname.match(/^\/v1\/users\/([^/]+)$/);
    if (userMatch && method === 'GET') return handleGetUser(env, decodeURIComponent(userMatch[1]));

    // ── MEMEX routes ────────────────────────────────────────────────────────
    if (pathname === '/v1/memex' && method === 'GET') return handleMemexRecall(request, env);
    if (pathname === '/v1/memex' && method === 'POST') return handleMemexStore(request, env);
    if (pathname === '/v1/memex/namespaces' && method === 'GET') return handleMemexNamespaces(request, env);
    const memexIdMatch = pathname.match(/^\/v1\/memex\/([^/]+)$/);
    if (memexIdMatch && method === 'DELETE') return handleMemexForget(request, env, memexIdMatch[1]);

    // ── HIVE routes ─────────────────────────────────────────────────────────
    if (pathname === '/v1/hive' && method === 'GET') return handleHiveList(request, env);
    if (pathname === '/v1/hive' && method === 'POST') return handleHiveCreate(request, env);
    const hiveIdMatch = pathname.match(/^\/v1\/hive\/([^/]+)$/);
    if (hiveIdMatch && method === 'GET') return handleHiveGet(request, env, hiveIdMatch[1]);
    if (hiveIdMatch && method === 'PATCH') return handleHiveUpdate(request, env, hiveIdMatch[1]);
    if (hiveIdMatch && method === 'DELETE') return handleHiveDelete(request, env, hiveIdMatch[1]);

    // ── Admin routes ────────────────────────────────────────────────────────
    if (pathname === '/v1/admin/users' && method === 'GET') return handleAdminListUsers(request, env);

    const adminUserMatch = pathname.match(/^\/v1\/admin\/users\/([^/]+)$/);
    if (adminUserMatch && method === 'PATCH') {
      return handleAdminUpdateUser(request, env, decodeURIComponent(adminUserMatch[1]));
    }

    const adminFeatureMatch = pathname.match(/^\/v1\/admin\/packages\/([^/]+)\/feature$/);
    if (adminFeatureMatch && method === 'POST') {
      return handleAdminFeaturePackage(request, env, decodeURIComponent(adminFeatureMatch[1]));
    }

    // ── UI pages ────────────────────────────────────────────────────────────
    if (method === 'GET' && pathname.startsWith('/u/') && pathname.length > 3) {
      const uname = decodeURIComponent(pathname.slice(3).replace(/\/$/, ''));
      return html(profileUI(uname));
    }
    if (method === 'GET' && (pathname === '/account' || pathname === '/account/')) return html(accountUI());
    if (method === 'GET' && (pathname === '/admin' || pathname === '/admin/')) return html(adminUI());

    return err('Not found', 404);
  },
};

// ── HIVE Handlers ─────────────────────────────────────────────────────────────

async function handleHiveList(request: Request, env: Env): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authentication required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, name, description, status, created_at, updated_at FROM hives WHERE owner=? ORDER BY updated_at DESC`
    ).bind(owner).all();
    return json({ success: true, hives: results || [], count: (results || []).length });
  } catch (e: any) { return err('Database error: ' + e.message, 500); }
}

async function handleHiveCreate(request: Request, env: Env): Promise<Response> {
  if (!await checkRateLimit(request, 'hive_write', env)) {
    return err('Rate limit exceeded: max 30 hive mutations per minute', 429);
  }
  const token = getToken(request);
  if (!token) return err('Authentication required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);
  let body: any;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }
  const { name, description = '', config = {} } = body;
  const status = ['draft','active','archived'].includes(body.status) ? body.status : 'draft';
  if (!name || typeof name !== 'string') return err('name is required');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) return err('name must be 1-64 alphanumeric/dash/underscore chars');
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO hives (id, owner, name, description, config, status) VALUES (?,?,?,?,?,?)`
    ).bind(id, owner, name, description, JSON.stringify(config), status).run();
    return json({ success: true, id, name, owner }, 201);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return err('A hive named "' + name + '" already exists', 409);
    return err('Database error: ' + e.message, 500);
  }
}

async function handleHiveGet(request: Request, env: Env, id: string): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authentication required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);
  try {
    const row = await env.DB.prepare(
      `SELECT * FROM hives WHERE id=? AND owner=?`
    ).bind(id, owner).first() as any;
    if (!row) return err('Hive not found', 404);
    return json({ success: true, hive: { ...row, config: (() => { try { return JSON.parse(row.config); } catch { return {}; } })() } });
  } catch (e: any) { return err('Database error: ' + e.message, 500); }
}

async function handleHiveUpdate(request: Request, env: Env, id: string): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authentication required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);
  let body: any;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }
  const existing = await env.DB.prepare(`SELECT id FROM hives WHERE id=? AND owner=?`).bind(id, owner).first();
  if (!existing) return err('Hive not found', 404);
  const sets: string[] = [`updated_at=datetime('now')`];
  const params: any[] = [];
  if (body.description !== undefined) { sets.push('description=?'); params.push(String(body.description).slice(0, 512)); }
  if (body.config !== undefined) { sets.push('config=?'); params.push(JSON.stringify(body.config)); }
  if (body.status !== undefined) {
    if (!['draft','active','archived'].includes(body.status)) return err('status must be draft, active, or archived');
    sets.push('status=?'); params.push(body.status);
  }
  if (body.name !== undefined) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(body.name)) return err('name must be 1-64 alphanumeric/dash/underscore chars');
    sets.push('name=?'); params.push(body.name);
  }
  params.push(id, owner);
  try {
    await env.DB.prepare(`UPDATE hives SET ${sets.join(',')} WHERE id=? AND owner=?`).bind(...params).run();
    return json({ success: true });
  } catch (e: any) { return err('Database error: ' + e.message, 500); }
}

async function handleHiveDelete(request: Request, env: Env, id: string): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authentication required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);
  try {
    const result = await env.DB.prepare(`DELETE FROM hives WHERE id=? AND owner=?`).bind(id, owner).run();
    if ((result.meta as any)?.changes === 0) return err('Hive not found', 404);
    return json({ success: true });
  } catch (e: any) { return err('Database error: ' + e.message, 500); }
}

// ── MEMEX Handlers ────────────────────────────────────────────────────────────

async function handleMemexStore(request: Request, env: Env): Promise<Response> {
  if (!await checkRateLimit(request, 'memex_write', env)) {
    return err('Rate limit exceeded: max 120 memory writes per minute', 429);
  }
  const token = getToken(request);
  if (!token) return err('Authentication required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);

  let body: any;
  try { body = await request.json(); } catch { return err('Invalid JSON body'); }

  const { key, value, agent_id = 'default', namespace = 'default', type = 'episodic', ttl_seconds, tags = [] } = body;
  if (!key || typeof key !== 'string') return err('key is required');
  if (value === undefined) return err('value is required');
  if (key.length > 512) return err('key exceeds 512 characters');

  const checksum = await hashToken(JSON.stringify(value));
  const expiresAt = ttl_seconds ? new Date(Date.now() + ttl_seconds * 1000).toISOString() : null;
  const id = crypto.randomUUID();
  const valueStr = JSON.stringify(value);
  const tagsStr = JSON.stringify(Array.isArray(tags) ? tags : []);

  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM memories WHERE owner=? AND agent_id=? AND namespace=? AND key=?`
    ).bind(owner, agent_id, namespace, key).first();

    if (existing) {
      await env.DB.prepare(
        `UPDATE memories SET value=?, type=?, checksum=?, tags=?, expires_at=?, updated_at=datetime('now') WHERE owner=? AND agent_id=? AND namespace=? AND key=?`
      ).bind(valueStr, type, checksum, tagsStr, expiresAt, owner, agent_id, namespace, key).run();
      return json({ success: true, id: (existing as any).id, created: false });
    } else {
      await env.DB.prepare(
        `INSERT INTO memories (id, owner, agent_id, namespace, key, value, type, checksum, tags, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(id, owner, agent_id, namespace, key, valueStr, type, checksum, tagsStr, expiresAt).run();
      return json({ success: true, id, created: true });
    }
  } catch (e: any) {
    return err('Database error: ' + e.message, 500);
  }
}

async function handleMemexRecall(request: Request, env: Env): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authentication required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);

  const { searchParams } = new URL(request.url);
  const agent_id = searchParams.get('agent_id') || null;
  const namespace = searchParams.get('namespace') || null;
  const type = searchParams.get('type') || null;
  const q = searchParams.get('q') || null;
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  let sql = `SELECT id, agent_id, namespace, key, value, type, tags, expires_at, created_at, updated_at FROM memories WHERE owner=?`;
  const params: any[] = [owner];

  if (agent_id) { sql += ` AND agent_id=?`; params.push(agent_id); }
  if (namespace) { sql += ` AND namespace=?`; params.push(namespace); }
  if (type) { sql += ` AND type=?`; params.push(type); }
  if (q) { sql += ` AND key LIKE ?`; params.push('%' + q + '%'); }
  sql += ` AND (expires_at IS NULL OR expires_at > datetime('now'))`;
  sql += ` ORDER BY updated_at DESC LIMIT ?`;
  params.push(limit);

  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    const memories = (results || []).map((r: any) => ({
      ...r,
      value: (() => { try { return JSON.parse(r.value); } catch { return r.value; } })(),
      tags: (() => { try { return JSON.parse(r.tags || '[]'); } catch { return []; } })(),
    }));
    return json({ success: true, memories, count: memories.length });
  } catch (e: any) {
    return err('Database error: ' + e.message, 500);
  }
}

async function handleMemexForget(request: Request, env: Env, id: string): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authentication required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);

  try {
    const result = await env.DB.prepare(
      `DELETE FROM memories WHERE id=? AND owner=?`
    ).bind(id, owner).run();
    if ((result.meta as any)?.changes === 0) return err('Memory not found or not owned by you', 404);
    return json({ success: true });
  } catch (e: any) {
    return err('Database error: ' + e.message, 500);
  }
}

async function handleMemexNamespaces(request: Request, env: Env): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authentication required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);

  const { searchParams } = new URL(request.url);
  const agent_id = searchParams.get('agent_id') || null;

  let sql = `SELECT DISTINCT namespace, agent_id FROM memories WHERE owner=? AND (expires_at IS NULL OR expires_at > datetime('now'))`;
  const params: any[] = [owner];
  if (agent_id) { sql += ` AND agent_id=?`; params.push(agent_id); }
  sql += ` ORDER BY agent_id, namespace`;

  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return json({ success: true, namespaces: results || [] });
  } catch (e: any) {
    return err('Database error: ' + e.message, 500);
  }
}

// ── Web UI — Registry Browser ─────────────────────────────────────────────────

// traceUI removed — integrated into registryUI

async function registryUI(env: Env): Promise<string> {
  // Server-side render initial packages
  let initialPackages: any[] = [];
  let initialCount = 0;
  try {
    const { results } = await env.DB.prepare(
      `SELECT name, version, description, author, tags, tarball_size, published_at, download_count, deprecated, featured
       FROM packages ORDER BY featured DESC, published_at DESC LIMIT 100`
    ).all();
    initialPackages = (results || []).map((r: any) => ({
      ...r,
      tags: (() => { try { return JSON.parse(r.tags || '[]'); } catch { return []; } })(),
    }));
    initialCount = initialPackages.length;
  } catch (e) {
    initialPackages = [];
  }

  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>CerebreX Project Example</title>
  <link rel="manifest" href="/manifest.json"/>
  <meta name="theme-color" content="#00d4ff"/>
  <meta name="mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
  <meta name="apple-mobile-web-app-title" content="CerebreX"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap" rel="stylesheet"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{
      font-family:'JetBrains Mono',monospace;
      background:#000;
      color:#fff;
      min-height:100vh;
      overflow-x:hidden;
    }
    body::before{
      content:'';
      position:fixed;
      top:0;left:0;width:100%;height:100%;
      background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.008) 3px,rgba(255,255,255,0.008) 4px);
      pointer-events:none;
      z-index:900;
    }

    /* Scroll progress */
    #scroll-bar{
      position:fixed;top:0;left:0;height:2px;
      background:#fff;width:0%;
      z-index:1000;transition:width .05s linear;
    }

    /* NAV */
    nav{
      position:fixed;top:0;left:0;right:0;
      display:flex;align-items:center;
      padding:0 32px;
      height:48px;
      border-bottom:1px solid rgba(255,255,255,0.1);
      background:#000;
      z-index:800;
    }
    .nav-logo{
      font-size:14px;font-weight:700;letter-spacing:0.05em;
      color:#fff;text-decoration:none;
      margin-right:auto;
    }
    .nav-links{
      display:flex;gap:0;align-items:center;
    }
    .nav-links a{
      color:rgba(255,255,255,0.5);
      text-decoration:none;
      font-size:11px;
      padding:0 14px;
      height:48px;
      display:flex;align-items:center;
      border-left:1px solid rgba(255,255,255,0.1);
      transition:color .1s,background .1s;
      letter-spacing:0.03em;
    }
    .nav-links a:hover{color:#fff;background:rgba(255,255,255,0.05)}
    .nav-links a:last-child{border-right:1px solid rgba(255,255,255,0.1)}
    .nav-gh{
      margin-left:24px;
      color:rgba(255,255,255,0.5) !important;
      border:1px solid rgba(255,255,255,0.2) !important;
      padding:0 14px !important;
      font-size:11px !important;
    }
    .nav-gh:hover{color:#fff !important;border-color:#fff !important;background:transparent !important}

    /* HERO */
    .hero{
      padding:112px 32px 80px;
      text-align:center;
      border-bottom:1px solid rgba(255,255,255,0.1);
    }
    .hero-ascii{
      font-size:clamp(8px,1.4vw,13px);
      line-height:1.2;
      color:rgba(255,255,255,0.9);
      white-space:pre;
      display:inline-block;
      margin-bottom:32px;
      font-weight:400;
    }
    .hero-sub{
      font-size:12px;
      color:rgba(255,255,255,0.4);
      letter-spacing:0.3em;
      text-transform:uppercase;
      margin-bottom:48px;
    }
    .hero-pills{
      display:flex;justify-content:center;gap:8px;flex-wrap:wrap;
    }
    .hero-pill{
      font-size:10px;
      letter-spacing:0.1em;
      padding:6px 14px;
      border:1px solid rgba(255,255,255,0.2);
      color:rgba(255,255,255,0.5);
      text-decoration:none;
      transition:color .1s,border-color .1s;
    }
    .hero-pill:hover{color:#fff;border-color:#fff}
    .hero-pill.live{border-color:rgba(255,255,255,0.6);color:rgba(255,255,255,0.8)}

    /* SECTIONS */
    .module-section{
      padding:80px 32px;
      border-bottom:1px solid rgba(255,255,255,0.1);
      max-width:1100px;
      margin:0 auto;
    }
    .module-header{
      display:flex;align-items:baseline;gap:16px;
      margin-bottom:40px;
    }
    .module-num{
      font-size:11px;
      color:rgba(255,255,255,0.3);
      letter-spacing:0.1em;
    }
    .module-title{
      font-size:20px;
      font-weight:700;
      letter-spacing:0.05em;
    }
    .module-badge{
      font-size:9px;
      letter-spacing:0.15em;
      text-transform:uppercase;
      padding:3px 8px;
      border:1px solid #fff;
      color:#fff;
    }
    .module-badge.dim{
      border-color:rgba(255,255,255,0.25);
      color:rgba(255,255,255,0.3);
    }
    .module-desc{
      font-size:13px;
      color:rgba(255,255,255,0.5);
      margin-bottom:32px;
      line-height:1.7;
      max-width:600px;
    }

    /* INPUTS / BUTTONS */
    input,select,textarea{
      background:#000;
      border:1px solid rgba(255,255,255,0.3);
      color:#fff;
      font-family:'JetBrains Mono',monospace;
      font-size:12px;
      padding:10px 14px;
      outline:none;
      transition:border-color .1s;
      width:100%;
    }
    input:focus,select:focus,textarea:focus{border-color:#fff}
    select option{background:#000;color:#fff}
    button,.btn{
      background:#000;
      border:1px solid rgba(255,255,255,0.4);
      color:rgba(255,255,255,0.8);
      font-family:'JetBrains Mono',monospace;
      font-size:11px;
      letter-spacing:0.05em;
      padding:10px 20px;
      cursor:pointer;
      transition:background .1s,color .1s,border-color .1s;
      white-space:nowrap;
    }
    button:hover,.btn:hover{background:#fff;color:#000;border-color:#fff}
    .btn-primary{border-color:#fff;color:#fff}
    .btn-primary:hover{background:#fff;color:#000}

    /* FEATURE LIST */
    .feature-list{
      display:flex;flex-direction:column;gap:8px;
      margin-top:24px;
    }
    .feature-item{
      font-size:11px;
      color:rgba(255,255,255,0.4);
      padding:10px 14px;
      border:1px solid rgba(255,255,255,0.08);
      display:flex;gap:12px;align-items:flex-start;
    }
    .feature-item::before{content:'//';color:rgba(255,255,255,0.2)}

    /* FORGE SECTION */
    .forge-form{
      display:grid;
      grid-template-columns:1fr 1fr auto;
      gap:8px;
      align-items:end;
      max-width:680px;
    }
    .forge-output{
      margin-top:16px;
      background:#000;
      border:1px solid rgba(255,255,255,0.15);
      padding:14px 16px;
      font-size:12px;
      color:rgba(255,255,255,0.8);
      display:none;
    }
    .forge-output.show{display:flex;align-items:center;gap:12px}
    .forge-output code{flex:1;word-break:break-all}
    .forge-output button{flex-shrink:0}

    /* TRACE SECTION */
    .trace-layout{
      display:grid;
      grid-template-columns:240px 1fr;
      gap:0;
      border:1px solid rgba(255,255,255,0.15);
      min-height:460px;
    }
    .trace-sidebar{
      border-right:1px solid rgba(255,255,255,0.1);
      overflow:hidden;
      display:flex;flex-direction:column;
    }
    .trace-sidebar-header{
      padding:10px 14px;
      font-size:10px;
      letter-spacing:0.1em;
      color:rgba(255,255,255,0.3);
      border-bottom:1px solid rgba(255,255,255,0.1);
      display:flex;justify-content:space-between;align-items:center;
    }
    .trace-session-list{flex:1;overflow-y:auto}
    .trace-session-item{
      padding:10px 14px;
      cursor:pointer;
      border-bottom:1px solid rgba(255,255,255,0.05);
      transition:background .1s;
    }
    .trace-session-item:hover{background:rgba(255,255,255,0.05)}
    .trace-session-item.active{background:rgba(255,255,255,0.08);border-left:2px solid #fff}
    .trace-session-name{font-size:11px;color:rgba(255,255,255,0.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .trace-session-meta{font-size:10px;color:rgba(255,255,255,0.3);margin-top:3px}
    .trace-main{display:flex;flex-direction:column;overflow:hidden}
    .trace-drop{
      flex:1;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:16px;padding:48px 24px;
      border:1px dashed rgba(255,255,255,0.15);
      margin:24px;
      cursor:pointer;
      transition:border-color .1s;
    }
    .trace-drop:hover,.trace-drop.drag{border-color:rgba(255,255,255,0.5)}
    .trace-drop-title{font-size:13px;color:rgba(255,255,255,0.6)}
    .trace-drop-sub{font-size:11px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6}
    .trace-view-wrap{display:none;flex-direction:column;flex:1;overflow:hidden}
    .trace-view-header{
      padding:12px 16px;
      border-bottom:1px solid rgba(255,255,255,0.1);
      display:flex;align-items:center;gap:12px;flex-wrap:wrap;
      font-size:12px;
    }
    .trace-view-title{font-weight:700;color:#fff}
    .trace-badge{
      font-size:9px;letter-spacing:0.1em;padding:2px 7px;
      border:1px solid rgba(255,255,255,0.4);color:rgba(255,255,255,0.5);
    }
    .trace-stats{margin-left:auto;display:flex;gap:20px}
    .trace-stat{text-align:right}
    .trace-stat-val{font-size:13px;color:#fff}
    .trace-stat-lbl{font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:0.1em}
    .trace-timeline{flex:1;overflow-y:auto;padding:16px}
    .trace-step{display:flex;gap:12px;margin-bottom:6px;position:relative}
    .trace-step::before{content:'';position:absolute;left:15px;top:32px;bottom:-6px;width:1px;background:rgba(255,255,255,0.1)}
    .trace-step:last-child::before{display:none}
    .trace-step-dot{
      width:30px;height:30px;flex-shrink:0;
      border:1px solid rgba(255,255,255,0.2);
      display:flex;align-items:center;justify-content:center;
      font-size:11px;color:rgba(255,255,255,0.5);
    }
    .trace-step-dot.type-tool_call{border-color:rgba(255,255,255,0.6);color:#fff}
    .trace-step-dot.type-llm_call{border-color:rgba(255,255,255,0.4);color:rgba(255,255,255,0.7)}
    .trace-step-dot.type-error{border-color:rgba(255,255,255,0.8);color:#fff}
    .trace-step-body{
      flex:1;
      border:1px solid rgba(255,255,255,0.1);
      padding:10px 14px;
      cursor:pointer;
      transition:border-color .1s;
    }
    .trace-step-body:hover{border-color:rgba(255,255,255,0.3)}
    .trace-step-body.expanded{border-color:rgba(255,255,255,0.6)}
    .trace-step-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .trace-step-type{
      font-size:9px;letter-spacing:0.1em;text-transform:uppercase;
      padding:2px 6px;border:1px solid rgba(255,255,255,0.2);
      color:rgba(255,255,255,0.4);
    }
    .trace-step-type.type-tool_call{border-color:rgba(255,255,255,0.5);color:rgba(255,255,255,0.8)}
    .trace-step-type.type-error{border-color:#fff;color:#fff}
    .trace-step-name{font-size:12px;color:rgba(255,255,255,0.9)}
    .trace-step-ms{margin-left:auto;font-size:10px;color:rgba(255,255,255,0.3)}
    .trace-step-details{display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08)}
    .trace-step-details.show{display:block}
    .trace-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .trace-detail-lbl{font-size:9px;letter-spacing:0.1em;color:rgba(255,255,255,0.3);margin-bottom:6px;text-transform:uppercase}
    .trace-detail-val{
      background:#000;border:1px solid rgba(255,255,255,0.1);
      padding:8px 10px;font-size:11px;
      white-space:pre-wrap;word-break:break-all;
      max-height:180px;overflow-y:auto;
      color:rgba(255,255,255,0.7);
    }

    /* COMING SOON */
    .coming-soon{
      padding:40px;
      border:1px solid rgba(255,255,255,0.1);
      max-width:560px;
    }
    .coming-soon-label{
      font-size:10px;letter-spacing:0.2em;
      color:rgba(255,255,255,0.3);
      text-transform:uppercase;margin-bottom:16px;
    }
    .coming-soon-text{
      font-size:13px;color:rgba(255,255,255,0.5);
      line-height:1.7;margin-bottom:24px;
    }
    .notify-form{display:flex;gap:8px}
    .notify-form input{flex:1}
    .notify-msg{margin-top:10px;font-size:11px;color:rgba(255,255,255,0.4);display:none}

    /* AUTH SECTION */
    .auth-login{max-width:480px}
    .auth-login-row{display:flex;gap:8px;margin-bottom:8px}
    .auth-login-row input{flex:1}
    .auth-hint{font-size:10px;color:rgba(255,255,255,0.3);margin-top:8px;line-height:1.6}
    .auth-panel{display:none}
    .auth-panel.show{display:block}
    .auth-user-row{
      display:flex;align-items:center;gap:16px;
      padding:12px 16px;
      border:1px solid rgba(255,255,255,0.15);
      margin-bottom:24px;
      font-size:12px;
    }
    .auth-user-name{color:#fff;font-weight:700}
    .auth-user-lbl{color:rgba(255,255,255,0.4);font-size:10px}
    .auth-section-title{
      font-size:10px;letter-spacing:0.15em;text-transform:uppercase;
      color:rgba(255,255,255,0.3);margin-bottom:16px;padding-bottom:8px;
      border-bottom:1px solid rgba(255,255,255,0.08);
    }
    .token-create-form{
      display:grid;grid-template-columns:1fr auto;gap:8px;
      margin-bottom:16px;max-width:480px;
    }
    .scope-checks{
      display:flex;gap:16px;flex-wrap:wrap;
      margin-bottom:16px;
    }
    .scope-check{
      display:flex;align-items:center;gap:6px;
      font-size:11px;color:rgba(255,255,255,0.6);cursor:pointer;
    }
    .scope-check input[type=checkbox]{
      width:14px;height:14px;cursor:pointer;
      accent-color:#fff;
    }
    .token-list{display:flex;flex-direction:column;gap:6px;margin-top:16px}
    .token-row{
      display:flex;align-items:center;gap:12px;
      padding:10px 14px;
      border:1px solid rgba(255,255,255,0.1);
      font-size:11px;
    }
    .token-name{flex:1;color:rgba(255,255,255,0.8)}
    .token-scope{font-size:10px;color:rgba(255,255,255,0.3)}
    .token-copy-cmd{
      font-size:10px;color:rgba(255,255,255,0.3);
      border:1px solid rgba(255,255,255,0.1);
      padding:3px 8px;cursor:pointer;
      transition:border-color .1s,color .1s;background:#000;
      font-family:'JetBrains Mono',monospace;
    }
    .token-copy-cmd:hover{border-color:rgba(255,255,255,0.4);color:rgba(255,255,255,0.7)}

    /* REGISTRY SECTION */
    .reg-search{margin-bottom:20px}
    .reg-stats{
      font-size:11px;color:rgba(255,255,255,0.3);
      margin-bottom:20px;
      padding-bottom:12px;
      border-bottom:1px solid rgba(255,255,255,0.08);
    }
    .reg-stats strong{color:rgba(255,255,255,0.7)}
    .pkg-grid{
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
      gap:1px;
      background:rgba(255,255,255,0.08);
    }
    .pkg-card{
      background:#000;
      padding:20px;
      cursor:pointer;
      transition:background .1s;
      position:relative;
    }
    .pkg-card:hover{background:rgba(255,255,255,0.04)}
    .pkg-card.featured{border-top:2px solid rgba(255,255,255,0.6)}
    .pkg-official{
      position:absolute;top:14px;right:14px;
      font-size:9px;letter-spacing:0.1em;
      color:rgba(255,255,255,0.5);
    }
    .pkg-name{
      font-size:13px;font-weight:700;color:#fff;
      margin-bottom:6px;
    }
    .pkg-desc{
      font-size:11px;color:rgba(255,255,255,0.4);
      margin-bottom:14px;line-height:1.6;
      min-height:36px;
    }
    .pkg-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .pkg-tag{
      font-size:9px;letter-spacing:0.05em;
      padding:2px 7px;
      border:1px solid rgba(255,255,255,0.15);
      color:rgba(255,255,255,0.4);
    }
    .pkg-ver{
      margin-left:auto;font-size:10px;
      color:rgba(255,255,255,0.25);
    }
    .pkg-empty{
      padding:48px 24px;text-align:center;
      font-size:12px;color:rgba(255,255,255,0.3);
    }
    .pkg-empty code{color:rgba(255,255,255,0.5)}

    /* PKG MODAL */
    .pkg-overlay{
      display:none;position:fixed;inset:0;
      background:rgba(0,0,0,0.85);z-index:950;
      align-items:center;justify-content:center;padding:24px;
    }
    .pkg-overlay.show{display:flex}
    .pkg-modal{
      background:#000;border:1px solid rgba(255,255,255,0.25);
      width:100%;max-width:580px;max-height:88vh;overflow-y:auto;
    }
    .pkg-modal-header{
      padding:18px 20px;
      border-bottom:1px solid rgba(255,255,255,0.1);
      display:flex;align-items:center;gap:12px;
    }
    .pkg-modal-name{font-size:16px;font-weight:700;color:#fff}
    .pkg-modal-close{
      margin-left:auto;background:none;border:none;
      color:rgba(255,255,255,0.4);font-size:20px;
      cursor:pointer;line-height:1;font-family:'JetBrains Mono',monospace;
      padding:0 4px;
    }
    .pkg-modal-close:hover{color:#fff;background:none}
    .pkg-modal-body{padding:20px}
    .pkg-modal-desc{font-size:12px;color:rgba(255,255,255,0.5);line-height:1.7;margin-bottom:20px}
    .pkg-detail-label{
      font-size:9px;letter-spacing:0.15em;text-transform:uppercase;
      color:rgba(255,255,255,0.3);margin-bottom:8px;
    }
    .pkg-install-box{
      display:flex;align-items:center;gap:10px;
      background:#000;border:1px solid rgba(255,255,255,0.2);
      padding:12px 14px;margin-bottom:20px;
      font-size:12px;
    }
    .pkg-install-cmd{flex:1;word-break:break-all;color:rgba(255,255,255,0.8)}
    .pkg-tags-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
    .pkg-meta-row{font-size:11px;color:rgba(255,255,255,0.3);line-height:1.8}
    .pkg-meta-row a{color:rgba(255,255,255,0.5);text-decoration:none}
    .pkg-meta-row a:hover{color:#fff}

    /* FOOTER */
    footer{
      padding:40px 32px;
      border-top:1px solid rgba(255,255,255,0.08);
      text-align:center;
      font-size:11px;
      color:rgba(255,255,255,0.2);
      letter-spacing:0.05em;
    }
    footer a{color:rgba(255,255,255,0.3);text-decoration:none}
    footer a:hover{color:#fff}

    /* SCROLLBAR */
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15)}

    @media(max-width:700px){
      nav{padding:0 16px}
      .nav-links a{padding:0 8px;font-size:10px}
      .module-section{padding:56px 16px}
      .forge-form{grid-template-columns:1fr}
      .trace-layout{grid-template-columns:1fr}
      .trace-sidebar{border-right:none;border-bottom:1px solid rgba(255,255,255,0.1);max-height:200px}
      .trace-detail-grid{grid-template-columns:1fr}
    }
  </style>
</head>
<body>

<div id="scroll-bar"></div>

<!-- INTRO BANNER -->
<div style="position:fixed;bottom:0;left:0;right:0;z-index:200;background:rgba(0,0,0,0.92);border-top:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(16px);padding:0.75rem 2rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;" id="intro-banner">
  <div style="font-family:'JetBrains Mono',monospace;font-size:0.72rem;color:rgba(255,255,255,0.6);letter-spacing:0.05em;">
    <span style="color:#fff;font-weight:700;">cerebrex project example</span> — this is a live demo of all 8 CerebreX modules running in production. try everything.
  </div>
  <div style="display:flex;gap:0.75rem;align-items:center;flex-shrink:0;">
    <a href="https://therealcool.site/whitepaper" style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:rgba(255,255,255,0.5);text-decoration:none;letter-spacing:0.05em;border:1px solid rgba(255,255,255,0.2);padding:0.3rem 0.75rem;transition:all 0.2s;" onmouseover="this.style.color='#fff';this.style.borderColor='rgba(255,255,255,0.5)';" onmouseout="this.style.color='rgba(255,255,255,0.5)';this.style.borderColor='rgba(255,255,255,0.2)';">read whitepaper</a>
    <button onclick="document.getElementById('intro-banner').style.display='none';" style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:rgba(255,255,255,0.35);background:none;border:none;cursor:pointer;letter-spacing:0.05em;">dismiss</button>
  </div>
</div>

<!-- NAV -->
<nav>
  <a class="nav-logo" href="/">cerebrex / project example</a>
  <div class="nav-links">
    <a href="#forge">[forge]</a>
    <a href="#trace">[trace]</a>
    <a href="#memex">[memex]</a>
    <a href="#auth">[auth]</a>
    <a href="#registry">[registry]</a>
    <a href="#hive">[hive]</a>
    <a href="#kairos">[kairos]</a>
    <a href="#ultraplan">[ultraplan]</a>
    <a href="https://github.com/arealcoolco/CerebreX" target="_blank" class="nav-gh">[github]</a>
  </div>
</nav>

<!-- HERO -->
<section class="hero">
  <pre class="hero-ascii">
  ██████╗███████╗██████╗ ███████╗██████╗ ██████╗ ██╗  ██╗
 ██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔══██╗╚██╗██╔╝
 ██║     █████╗  ██████╔╝█████╗  ██████╔╝██████╔╝ ╚███╔╝
 ██║     ██╔══╝  ██╔══██╗██╔══╝  ██╔══██╗██╔══██╗ ██╔██╗
 ╚██████╗███████╗██║  ██║███████╗██████╔╝██║  ██║██╔╝ ██╗
  ╚═════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝</pre>
  <div class="hero-sub">cerebrex project example — v0.9.4 — every module, live in your browser</div>
  <div class="hero-pills">
    <a class="hero-pill live" href="#forge">forge</a>
    <a class="hero-pill live" href="#trace">trace</a>
    <a class="hero-pill live" href="#memex">memex</a>
    <a class="hero-pill live" href="#auth">auth</a>
    <a class="hero-pill live" href="#registry">registry</a>
    <a class="hero-pill live" href="#hive">hive</a>
    <a class="hero-pill live" href="#kairos">kairos</a>
    <a class="hero-pill live" href="#ultraplan">ultraplan</a>
  </div>
</section>

<!-- 01 FORGE -->
<section id="forge" style="border-bottom:1px solid rgba(255,255,255,0.1)">
<div class="module-section" style="max-width:1100px;margin:0 auto;padding:80px 32px">
  <div class="module-header">
    <span class="module-num">01</span>
    <span class="module-title">FORGE</span>
    <span class="module-badge">live</span>
  </div>
  <div class="module-desc">generate a production MCP server from any OpenAPI spec. one command, ready for Cloudflare Workers.</div>
  <div class="forge-form">
    <div>
      <div style="font-size:10px;letter-spacing:0.1em;color:rgba(255,255,255,0.3);margin-bottom:6px">OPENAPI SPEC URL OR PATH</div>
      <input type="text" id="forge-name" placeholder="https://api.example.com/openapi.json" autocomplete="off"/>
    </div>
    <div>
      <div style="font-size:10px;letter-spacing:0.1em;color:rgba(255,255,255,0.3);margin-bottom:6px">OUTPUT DIR</div>
      <input type="text" id="forge-template" placeholder="./cerebrex-output" autocomplete="off"/>
    </div>
    <div style="align-self:flex-end">
      <button onclick="generateForgeCmd()">generate command</button>
    </div>
  </div>
  <div class="forge-output" id="forge-output">
    <code id="forge-cmd-text"></code>
    <button onclick="copyForge(this)">copy</button>
  </div>
  <div class="feature-list">
    <div class="feature-item">parses OpenAPI 3.x and Swagger 2.x specs from URL or local file</div>
    <div class="feature-item">generates Zod validation for every tool parameter automatically</div>
    <div class="feature-item">wrangler.toml pre-configured for Cloudflare Workers deployment</div>
    <div class="feature-item">supports stdio, SSE, and Streamable HTTP transports</div>
    <div class="feature-item">ready for <code style="font-size:11px">cerebrex validate</code> and <code style="font-size:11px">cerebrex publish</code></div>
  </div>
</div>
</section>

<!-- 02 TRACE -->
<section id="trace" style="border-bottom:1px solid rgba(255,255,255,0.1)">
<div class="module-section" style="max-width:1100px;margin:0 auto;padding:80px 32px">
  <div class="module-header">
    <span class="module-num">02</span>
    <span class="module-title">TRACE</span>
    <span class="module-badge">live</span>
  </div>
  <div class="module-desc">real-time MCP call inspector. load a session JSON and walk through every tool call, LLM round-trip, and error step.</div>

  <div class="trace-layout">
    <!-- sidebar -->
    <div class="trace-sidebar">
      <div class="trace-sidebar-header">
        <span>SESSIONS</span>
        <span id="trace-session-count">0</span>
      </div>
      <div class="trace-session-list" id="trace-session-list"></div>
    </div>
    <!-- main -->
    <div class="trace-main" id="trace-main">
      <div class="trace-drop" id="trace-drop-zone">
        <div class="trace-drop-title">drop a trace file here</div>
        <div class="trace-drop-sub">or click to browse for a JSON trace file<br>exported with <code>cerebrex trace view --session &lt;id&gt;</code></div>
        <label class="btn btn-primary" for="trace-file-input" style="cursor:pointer;display:inline-block">browse files</label>
        <input type="file" id="trace-file-input" accept=".json" multiple style="display:none"/>
      </div>
      <div class="trace-view-wrap" id="trace-view-wrap">
        <div class="trace-view-header" id="trace-view-header"></div>
        <div class="trace-timeline" id="trace-timeline"></div>
      </div>
    </div>
  </div>
  <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
    <label class="btn" for="trace-file-input" style="cursor:pointer;display:inline-block;font-size:10px">load trace file</label>
    <span style="font-size:10px;color:rgba(255,255,255,0.2)">or drag a .json trace onto the panel above</span>
  </div>
</div>
</section>

<!-- 03 MEMEX -->
<section id="memex" style="border-bottom:1px solid rgba(255,255,255,0.1)">
<div class="module-section" style="max-width:1100px;margin:0 auto;padding:80px 32px">
  <div class="module-header">
    <span class="module-num">03</span>
    <span class="module-title">MEMEX</span>
    <span class="module-badge live">live</span>
  </div>
  <div class="module-desc">three-layer persistent memory for agents. KV index (≤25KB, sub-ms reads) → R2 topic blobs (≤512KB) → D1 append-only transcripts (≤1MB). nightly autoDream consolidation via Claude compresses raw history into structured topics automatically.</div>

  <!-- install -->
  <div style="margin:2rem 0 2.5rem">
    <div style="font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:0.5rem">install the memex mcp server</div>
    <div style="display:flex;gap:0;border:1px solid rgba(255,255,255,0.2)">
      <code style="flex:1;padding:0.75rem 1rem;font-size:0.85rem;color:rgba(255,255,255,0.8)">cerebrex install @arealcoolco/memex-mcp</code>
      <button onclick="navigator.clipboard.writeText('cerebrex install @arealcoolco/memex-mcp').then(()=>{this.textContent='copied';setTimeout(()=>this.textContent='copy',1500)})" style="padding:0.75rem 1.25rem;background:rgba(255,255,255,0.08);border:none;border-left:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);font-family:inherit;font-size:0.75rem;cursor:pointer;letter-spacing:0.1em">copy</button>
    </div>
  </div>

  <!-- auth gate -->
  <div id="memex-auth-gate" style="display:none;padding:2rem;border:1px solid rgba(255,255,255,0.15);text-align:center">
    <div style="font-size:0.8rem;color:rgba(255,255,255,0.5);margin-bottom:1rem">sign in via the AUTH section above to use the memory browser</div>
    <a href="#auth" style="color:#fff;font-size:0.75rem;letter-spacing:0.1em;text-decoration:none;border-bottom:1px solid rgba(255,255,255,0.4)">→ go to auth</a>
  </div>

  <!-- memory browser -->
  <div id="memex-browser" style="display:none">
    <!-- controls bar -->
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1.5rem;align-items:flex-end">
      <div style="flex:1;min-width:160px">
        <div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:0.4rem">agent id</div>
        <input id="mx-agent" placeholder="default" style="width:100%;background:#000;border:1px solid rgba(255,255,255,0.25);color:#fff;padding:0.5rem 0.75rem;font-family:inherit;font-size:0.8rem" oninput="memexLoad()"/>
      </div>
      <div style="flex:1;min-width:140px">
        <div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:0.4rem">namespace</div>
        <input id="mx-ns" placeholder="default" style="width:100%;background:#000;border:1px solid rgba(255,255,255,0.25);color:#fff;padding:0.5rem 0.75rem;font-family:inherit;font-size:0.8rem" oninput="memexLoad()"/>
      </div>
      <div style="flex:2;min-width:180px">
        <div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:0.4rem">search key</div>
        <input id="mx-q" placeholder="filter by key..." style="width:100%;background:#000;border:1px solid rgba(255,255,255,0.25);color:#fff;padding:0.5rem 0.75rem;font-family:inherit;font-size:0.8rem" oninput="memexLoad()"/>
      </div>
      <button onclick="memexLoad()" style="padding:0.5rem 1.25rem;background:#fff;color:#000;border:none;font-family:inherit;font-size:0.75rem;font-weight:700;letter-spacing:0.1em;cursor:pointer;white-space:nowrap">refresh</button>
    </div>

    <!-- memory list -->
    <div id="mx-list" style="border:1px solid rgba(255,255,255,0.1)">
      <div style="padding:2rem;text-align:center;color:rgba(255,255,255,0.35);font-size:0.8rem">loading memories...</div>
    </div>

    <!-- store form -->
    <div style="margin-top:2.5rem;border-top:1px solid rgba(255,255,255,0.1);padding-top:2rem">
      <div style="font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:1.25rem">store new memory</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:0.75rem">
        <div>
          <div style="font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:0.3rem">key *</div>
          <input id="mx-new-key" placeholder="project:context" style="width:100%;background:#000;border:1px solid rgba(255,255,255,0.25);color:#fff;padding:0.5rem 0.75rem;font-family:inherit;font-size:0.8rem"/>
        </div>
        <div>
          <div style="font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:0.3rem">type</div>
          <select id="mx-new-type" style="width:100%;background:#000;border:1px solid rgba(255,255,255,0.25);color:#fff;padding:0.5rem 0.75rem;font-family:inherit;font-size:0.8rem">
            <option value="episodic">episodic</option>
            <option value="semantic">semantic</option>
            <option value="working">working</option>
          </select>
        </div>
      </div>
      <div style="margin-bottom:0.75rem">
        <div style="font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:0.3rem">value * (text or JSON)</div>
        <textarea id="mx-new-val" rows="3" placeholder='{"stack":"next.js","db":"postgres"}' style="width:100%;background:#000;border:1px solid rgba(255,255,255,0.25);color:#fff;padding:0.5rem 0.75rem;font-family:inherit;font-size:0.8rem;resize:vertical"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:0.75rem;align-items:flex-end">
        <div>
          <div style="font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:0.3rem">agent id</div>
          <input id="mx-new-agent" placeholder="default" style="width:100%;background:#000;border:1px solid rgba(255,255,255,0.25);color:#fff;padding:0.5rem 0.75rem;font-family:inherit;font-size:0.8rem"/>
        </div>
        <div>
          <div style="font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:0.3rem">namespace</div>
          <input id="mx-new-ns" placeholder="default" style="width:100%;background:#000;border:1px solid rgba(255,255,255,0.25);color:#fff;padding:0.5rem 0.75rem;font-family:inherit;font-size:0.8rem"/>
        </div>
        <div>
          <div style="font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:0.3rem">ttl (seconds)</div>
          <input id="mx-new-ttl" placeholder="optional" type="number" style="width:100%;background:#000;border:1px solid rgba(255,255,255,0.25);color:#fff;padding:0.5rem 0.75rem;font-family:inherit;font-size:0.8rem"/>
        </div>
        <button onclick="memexStore()" id="mx-store-btn" style="padding:0.5rem 1.5rem;background:#fff;color:#000;border:none;font-family:inherit;font-size:0.75rem;font-weight:700;letter-spacing:0.1em;cursor:pointer;white-space:nowrap;align-self:flex-end">store →</button>
      </div>
      <div id="mx-store-msg" style="margin-top:0.75rem;font-size:0.75rem;color:rgba(255,255,255,0.5);display:none"></div>
    </div>
  </div>
</div>
</section>

<!-- 04 AUTH -->
<section id="auth" style="border-bottom:1px solid rgba(255,255,255,0.1)">
<div class="module-section" style="max-width:1100px;margin:0 auto;padding:80px 32px">
  <div class="module-header">
    <span class="module-num">04</span>
    <span class="module-title">AUTH</span>
    <span class="module-badge">live</span>
  </div>
  <div class="module-desc">token-based identity and access management for the cerebrex platform. create scoped tokens, manage credentials, authenticate CLI and agent calls.</div>

  <!-- login -->
  <div id="auth-login-panel" class="auth-login">
    <div style="font-size:10px;letter-spacing:0.1em;color:rgba(255,255,255,0.3);margin-bottom:8px">ACCESS TOKEN</div>
    <div class="auth-login-row">
      <input type="password" id="auth-token-input" placeholder="paste your cerebrex token" autocomplete="off"/>
      <button onclick="authSignIn()">sign in</button>
    </div>
    <div class="auth-hint">
      get a token at registry.therealcool.site/account — or run <code style="color:rgba(255,255,255,0.6)">cerebrex auth login</code> in your terminal
    </div>
    <div id="auth-error" style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:10px;display:none"></div>
  </div>

  <!-- authed panel -->
  <div id="auth-authed-panel" class="auth-panel">
    <div class="auth-user-row">
      <div>
        <div class="auth-user-lbl">SIGNED IN AS</div>
        <div class="auth-user-name" id="auth-username">—</div>
      </div>
      <button onclick="authSignOut()" style="margin-left:auto;font-size:10px">sign out</button>
    </div>

    <div class="auth-section-title">create token</div>
    <div class="token-create-form">
      <input type="text" id="new-token-name" placeholder="token name (e.g. ci-deploy)"/>
      <button onclick="createToken()">create</button>
    </div>
    <div class="scope-checks">
      <label class="scope-check"><input type="checkbox" id="scope-publish" checked/> publish</label>
      <label class="scope-check"><input type="checkbox" id="scope-install" checked/> install</label>
      <label class="scope-check"><input type="checkbox" id="scope-admin"/> admin</label>
    </div>
    <div id="new-token-result" style="display:none;margin-bottom:20px">
      <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-bottom:6px;letter-spacing:0.1em">NEW TOKEN (copy now — shown once)</div>
      <div class="pkg-install-box">
        <span class="pkg-install-cmd" id="new-token-value"></span>
        <button onclick="copyText(document.getElementById('new-token-value').textContent, this)">copy</button>
      </div>
    </div>

    <div class="auth-section-title" style="margin-top:8px">cli commands</div>
    <div class="token-list">
      <div class="token-row">
        <span class="token-name">authenticate cli</span>
        <code class="token-scope">terminal</code>
        <button class="token-copy-cmd" onclick="copyText('cerebrex auth login', this)">copy</button>
      </div>
      <div class="token-row">
        <span class="token-name">set token manually</span>
        <code class="token-scope">terminal</code>
        <button class="token-copy-cmd" onclick="copyText('cerebrex auth set-token YOUR_TOKEN', this)">copy</button>
      </div>
      <div class="token-row">
        <span class="token-name">list my tokens</span>
        <code class="token-scope">terminal</code>
        <button class="token-copy-cmd" onclick="copyText('cerebrex auth tokens', this)">copy</button>
      </div>
      <div class="token-row">
        <span class="token-name">revoke a token</span>
        <code class="token-scope">terminal</code>
        <button class="token-copy-cmd" onclick="copyText('cerebrex auth revoke TOKEN_ID', this)">copy</button>
      </div>
    </div>
  </div>
</div>
</section>

<!-- 05 REGISTRY -->
<section id="registry" style="border-bottom:1px solid rgba(255,255,255,0.1)">
<div class="module-section" style="max-width:1100px;margin:0 auto;padding:80px 32px">
  <div class="module-header">
    <span class="module-num">05</span>
    <span class="module-title">REGISTRY</span>
    <span class="module-badge">live</span>
  </div>
  <div class="module-desc">discover, install, and publish MCP servers. the cerebrex package registry is the central hub for agent tooling.</div>

  <div class="reg-search">
    <input type="text" id="reg-search" placeholder="search packages..." autocomplete="off" style="max-width:560px"/>
  </div>
  <div class="reg-stats" id="reg-stats">__INITIAL_STATS__</div>
  <div class="pkg-grid" id="pkg-grid">__INITIAL_GRID__</div>
</div>
</section>

<!-- 06 HIVE -->
<section id="hive" style="border-bottom:1px solid rgba(255,255,255,0.1)">
<div class="module-section" style="max-width:1100px;margin:0 auto;padding:80px 32px">
  <div class="module-header">
    <span class="module-num">06</span>
    <span class="module-title">HIVE</span>
    <span class="module-badge">live</span>
  </div>
  <div class="module-desc">multi-agent swarm orchestration with three execution strategies: parallel (all agents simultaneously), pipeline (output feeds next), competitive (fastest wins). six built-in presets. every task passes through the risk gate — LOW/MEDIUM/HIGH classification enforced before execution. nothing runs without your consent.</div>

  <div id="hive-auth-gate" style="margin-top:2rem;padding:2rem;border:1px solid rgba(255,255,255,0.1);text-align:center">
    <div style="font-size:0.8rem;color:rgba(255,255,255,0.4);margin-bottom:0.75rem">sign in via the AUTH module above to manage your hives</div>
    <a href="#auth" style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.15);padding:0.4rem 1.2rem;text-decoration:none">↑ go to auth</a>
  </div>

  <div id="hive-browser" style="display:none;margin-top:2rem">

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:0.75rem">
      <div style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.4)">agent networks</div>
      <button onclick="hiveOpenCreate()" style="background:transparent;border:1px solid rgba(255,255,255,0.3);color:rgba(255,255,255,0.8);font-family:inherit;font-size:0.7rem;letter-spacing:0.1em;padding:0.35rem 1rem;cursor:pointer;text-transform:uppercase">+ new hive</button>
    </div>

    <div id="hive-list" style="margin-bottom:1.5rem"></div>

    <div id="hive-create-form" style="display:none;border:1px solid rgba(255,255,255,0.15);padding:1.5rem;margin-bottom:1.5rem">
      <div style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:1rem">create hive</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:0.75rem">
        <div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:0.3rem;letter-spacing:0.1em">NAME *</div>
          <input id="hv-new-name" type="text" placeholder="my-agent-network" style="width:100%;box-sizing:border-box"/>
        </div>
        <div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:0.3rem;letter-spacing:0.1em">DESCRIPTION</div>
          <input id="hv-new-desc" type="text" placeholder="what this hive does" style="width:100%;box-sizing:border-box"/>
        </div>
      </div>
      <div style="margin-bottom:0.75rem">
        <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:0.3rem;letter-spacing:0.1em">CONFIG (JSON)</div>
        <textarea id="hv-new-config" rows="8" style="width:100%;box-sizing:border-box;font-family:inherit;font-size:0.75rem;resize:vertical">{"agents":[],"strategy":"parallel","shared_memory":true,"risk_policy":{"allowHighRisk":false,"allowMediumRisk":true}}</textarea>
      </div>
      <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">
        <button id="hv-create-btn" onclick="hiveCreate()" style="background:white;color:black;border:none;font-family:inherit;font-size:0.75rem;letter-spacing:0.1em;padding:0.5rem 1.5rem;cursor:pointer;text-transform:uppercase">create &#x2192;</button>
        <button onclick="hiveCloseCreate()" style="background:transparent;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);font-family:inherit;font-size:0.75rem;letter-spacing:0.1em;padding:0.5rem 1rem;cursor:pointer;text-transform:uppercase">cancel</button>
        <div id="hv-create-msg" style="display:none;font-size:0.75rem;color:rgba(255,255,255,0.7)"></div>
      </div>
    </div>

    <div id="hive-edit-panel" style="display:none;border:1px solid rgba(255,255,255,0.15);padding:1.5rem;margin-bottom:1.5rem">
      <input type="hidden" id="hive-edit-id"/>
      <div style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:1rem">edit hive</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 120px;gap:0.75rem;margin-bottom:0.75rem">
        <div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:0.3rem;letter-spacing:0.1em">NAME</div>
          <input id="hive-edit-name" type="text" disabled style="width:100%;box-sizing:border-box;opacity:0.5"/>
        </div>
        <div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:0.3rem;letter-spacing:0.1em">DESCRIPTION</div>
          <input id="hive-edit-desc" type="text" style="width:100%;box-sizing:border-box"/>
        </div>
        <div>
          <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:0.3rem;letter-spacing:0.1em">STATUS</div>
          <select id="hive-edit-status" style="width:100%;box-sizing:border-box;background:#0a0a0a;color:#fff;border:1px solid rgba(255,255,255,0.2);font-family:inherit;font-size:0.75rem;padding:0.4rem">
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
          </select>
        </div>
      </div>
      <div style="margin-bottom:0.75rem">
        <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:0.3rem;letter-spacing:0.1em">CONFIG (JSON)</div>
        <textarea id="hive-edit-config" rows="10" style="width:100%;box-sizing:border-box;font-family:inherit;font-size:0.75rem;resize:vertical"></textarea>
      </div>
      <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">
        <button onclick="hiveUpdate()" style="background:white;color:black;border:none;font-family:inherit;font-size:0.75rem;letter-spacing:0.1em;padding:0.5rem 1.5rem;cursor:pointer;text-transform:uppercase">save &#x2192;</button>
        <button onclick="hiveDelete(document.getElementById('hive-edit-id').value)" style="background:transparent;border:1px solid rgba(255,50,50,0.4);color:rgba(255,100,100,0.7);font-family:inherit;font-size:0.75rem;letter-spacing:0.1em;padding:0.5rem 1rem;cursor:pointer;text-transform:uppercase">delete</button>
        <button onclick="document.getElementById('hive-edit-panel').style.display='none'" style="background:transparent;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.4);font-family:inherit;font-size:0.75rem;padding:0.5rem 1rem;cursor:pointer">close</button>
        <div id="hive-edit-msg" style="display:none;font-size:0.75rem;color:rgba(255,255,255,0.7)"></div>
      </div>
    </div>

    <div style="border:1px solid rgba(255,255,255,0.08);padding:1.25rem;background:rgba(255,255,255,0.02)">
      <div style="font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:0.75rem">hive-mcp &#x2014; control your agent network from any mcp client</div>
      <div class="install-row">
        <span class="install-cmd">cerebrex install @arealcoolco/hive-mcp</span>
        <button onclick="copyText('cerebrex install @arealcoolco/hive-mcp', this)">copy</button>
      </div>
      <div style="margin-top:0.75rem;font-size:0.7rem;color:rgba(255,255,255,0.3)">tools: hive_list &nbsp;/&nbsp; hive_create &nbsp;/&nbsp; hive_get &nbsp;/&nbsp; hive_update &nbsp;/&nbsp; hive_delete</div>
    </div>
  </div>
</div>
</section>

<!-- 07 KAIROS -->
<section id="kairos" style="border-bottom:1px solid rgba(255,255,255,0.1)">
<div class="module-section" style="max-width:1100px;margin:0 auto;padding:80px 32px">
  <div class="module-header">
    <span class="module-num">07</span>
    <span class="module-title">KAIROS</span>
    <span class="module-badge live">live</span>
  </div>
  <div class="module-desc">autonomous background daemon built on Cloudflare Durable Objects. runs a 5-minute tick loop — continuously checking tasks, monitoring conditions, and taking action without being asked. exponential backoff on errors (1min → 30min cap). every decision written to an append-only D1 audit log.</div>

  <div style="margin:2rem 0 2.5rem">
    <div style="font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:1rem">register a daemon</div>
    <div style="display:flex;flex-direction:column;gap:0.5rem">
      <div style="display:flex;gap:0;border:1px solid rgba(255,255,255,0.2)">
        <code style="flex:1;padding:0.75rem 1rem;font-size:0.82rem;color:rgba(255,255,255,0.8)">cerebrex kairos daemon register --agent-id my-agent --goal "Monitor repo activity"</code>
        <button onclick="copyText('cerebrex kairos daemon register --agent-id my-agent --goal &quot;Monitor repo activity&quot;', this)" style="padding:0.75rem 1.25rem;background:rgba(255,255,255,0.08);border:none;border-left:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);font-family:inherit;font-size:0.75rem;cursor:pointer;letter-spacing:0.1em">copy</button>
      </div>
      <div style="display:flex;gap:0;border:1px solid rgba(255,255,255,0.1)">
        <code style="flex:1;padding:0.75rem 1rem;font-size:0.82rem;color:rgba(255,255,255,0.5)">cerebrex kairos task submit --agent-id my-agent --type "data_sync" --payload '{}'</code>
        <button onclick="copyText('cerebrex kairos task submit --agent-id my-agent --type &quot;data_sync&quot; --payload \'{}\'', this)" style="padding:0.75rem 1.25rem;background:rgba(255,255,255,0.04);border:none;border-left:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.4);font-family:inherit;font-size:0.75rem;cursor:pointer;letter-spacing:0.1em">copy</button>
      </div>
      <div style="display:flex;gap:0;border:1px solid rgba(255,255,255,0.1)">
        <code style="flex:1;padding:0.75rem 1rem;font-size:0.82rem;color:rgba(255,255,255,0.5)">cerebrex kairos log --agent-id my-agent --limit 20</code>
        <button onclick="copyText('cerebrex kairos log --agent-id my-agent --limit 20', this)" style="padding:0.75rem 1.25rem;background:rgba(255,255,255,0.04);border:none;border-left:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.4);font-family:inherit;font-size:0.75rem;cursor:pointer;letter-spacing:0.1em">copy</button>
      </div>
    </div>
  </div>

  <div class="feature-list">
    <div class="feature-item">5-minute tick loop via Durable Object alarm — no polling, no cron, always on</div>
    <div class="feature-item">exponential backoff on errors — 1min → 2 → 4 → up to 30min cap, resets on success</div>
    <div class="feature-item">append-only D1 audit log — every decision, reasoning, and action persisted</div>
    <div class="feature-item">JSON-validated tick responses — malformed output is rejected before acting</div>
    <div class="feature-item">50KB goal size limit — prevents runaway context injection</div>
    <div class="feature-item">strict agentId validation — alphanumeric format enforced, injection blocked</div>
  </div>
</div>
</section>

<!-- 08 ULTRAPLAN -->
<section id="ultraplan" style="border-bottom:1px solid rgba(255,255,255,0.1)">
<div class="module-section" style="max-width:1100px;margin:0 auto;padding:80px 32px">
  <div class="module-header">
    <span class="module-num">08</span>
    <span class="module-title">ULTRAPLAN</span>
    <span class="module-badge live">live</span>
  </div>
  <div class="module-desc">Opus-powered long-range planning with human-in-the-loop approval. Claude Opus decomposes your goal into a structured execution plan → you review and approve → HIVE executes all subtasks in parallel. goals capped at 50KB. every subtask inherits HIVE's risk gate. full audit trail in D1.</div>

  <div style="margin:2rem 0 2.5rem">
    <div style="font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:1rem">generate a plan → approve → execute</div>
    <div style="display:flex;flex-direction:column;gap:0.5rem">
      <div style="display:flex;gap:0;border:1px solid rgba(255,255,255,0.2)">
        <code style="flex:1;padding:0.75rem 1rem;font-size:0.82rem;color:rgba(255,255,255,0.8)">cerebrex ultraplan "Build a REST API with auth, docs, and tests"</code>
        <button onclick="copyText('cerebrex ultraplan &quot;Build a REST API with auth, docs, and tests&quot;', this)" style="padding:0.75rem 1.25rem;background:rgba(255,255,255,0.08);border:none;border-left:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);font-family:inherit;font-size:0.75rem;cursor:pointer;letter-spacing:0.1em">copy</button>
      </div>
      <div style="display:flex;gap:0;border:1px solid rgba(255,255,255,0.1)">
        <code style="flex:1;padding:0.75rem 1rem;font-size:0.82rem;color:rgba(255,255,255,0.5)">cerebrex ultraplan execute --plan-id &lt;id&gt; --approve</code>
        <button onclick="copyText('cerebrex ultraplan execute --plan-id <id> --approve', this)" style="padding:0.75rem 1.25rem;background:rgba(255,255,255,0.04);border:none;border-left:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.4);font-family:inherit;font-size:0.75rem;cursor:pointer;letter-spacing:0.1em">copy</button>
      </div>
    </div>
  </div>

  <div class="feature-list">
    <div class="feature-item">Claude Opus decomposes complex goals into structured, executable subtask trees</div>
    <div class="feature-item">human approval gate — the plan requires explicit confirmation before any execution begins</div>
    <div class="feature-item">parallel HIVE execution — approved tasks fan out across the swarm simultaneously</div>
    <div class="feature-item">50KB goal limit — enforced at API level, prevents context injection</div>
    <div class="feature-item">risk gate inheritance — every subtask passes through HIVE's LOW/MEDIUM/HIGH classification</div>
    <div class="feature-item">full auditability — plan, approval decision, and execution results all logged to D1</div>
  </div>
</div>
</section>

<!-- FOOTER -->
<footer>
  <div>cerebrex project example &mdash; v0.9.4 &mdash; a real cool co.</div>
  <div style="margin-top:10px;display:flex;justify-content:center;gap:20px;flex-wrap:wrap">
    <a href="https://therealcool.site" target="_blank">home</a>
    <a href="https://therealcool.site/whitepaper" target="_blank">whitepaper</a>
    <a href="https://github.com/arealcoolco/CerebreX" target="_blank">github</a>
    <a href="https://www.npmjs.com/package/cerebrex" target="_blank">npm</a>
    <a href="/v1/packages" target="_blank">api</a>
    <a href="#forge">forge</a>
    <a href="#trace">trace</a>
    <a href="#memex">memex</a>
    <a href="#auth">auth</a>
    <a href="#registry">registry</a>
    <a href="#hive">hive</a>
    <a href="#kairos">kairos</a>
    <a href="#ultraplan">ultraplan</a>
  </div>
</footer>

<!-- PKG MODAL -->
<div class="pkg-overlay" id="pkg-overlay" onclick="closePkgModal(event)">
  <div class="pkg-modal" id="pkg-modal">
    <div class="pkg-modal-header">
      <div class="pkg-modal-name" id="pm-name"></div>
      <button class="pkg-modal-close" onclick="document.getElementById('pkg-overlay').classList.remove('show')">x</button>
    </div>
    <div class="pkg-modal-body" id="pm-body"></div>
  </div>
</div>

<script>
// ── Scroll progress ──────────────────────────────────────────────────────────
window.addEventListener('scroll', function() {
  var scrolled = document.documentElement.scrollTop;
  var max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  document.getElementById('scroll-bar').style.width = (scrolled / max * 100) + '%';
});

// ── Utils ────────────────────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(); } catch(e) { return iso||''; } }
function fmtSize(b) { if(!b) return ''; return b < 1024 ? b+'B' : b < 1048576 ? (b/1024).toFixed(1)+'KB' : (b/1048576).toFixed(1)+'MB'; }
function fmtMs(ms) { return !ms ? '-' : ms < 1000 ? ms+'ms' : (ms/1000).toFixed(1)+'s'; }
function fmtTok(t) { return !t ? '' : t < 1000 ? t+' tok' : (t/1000).toFixed(1)+'k tok'; }

function copyText(txt, btn) {
  navigator.clipboard.writeText(txt).then(function() {
    var orig = btn.textContent;
    btn.textContent = 'copied';
    setTimeout(function() { btn.textContent = orig; }, 1500);
  });
}

// ── FORGE ────────────────────────────────────────────────────────────────────
function generateForgeCmd() {
  var spec = document.getElementById('forge-name').value.trim() || 'https://api.example.com/openapi.json';
  var out = document.getElementById('forge-template').value.trim() || './cerebrex-output';
  var cmd = 'cerebrex build --spec ' + spec + ' --output ' + out;
  document.getElementById('forge-cmd-text').textContent = cmd;
  document.getElementById('forge-output').classList.add('show');
}

function copyForge(btn) {
  copyText(document.getElementById('forge-cmd-text').textContent, btn);
}

// ── TRACE ────────────────────────────────────────────────────────────────────
var traceSessions = new Map();
var traceActive = null;

var TRACE_DOTS = {tool_call:'T',llm_call:'L',memory_read:'M',memory_write:'W',error:'E',custom:'*'};

function loadTrace(data, name) {
  var s = typeof data === 'string' ? JSON.parse(data) : data;
  var id = s.session || name || 'trace-' + Date.now();
  traceSessions.set(id, s);
  renderTraceSidebar();
  selectTrace(id);
}

function renderTraceSidebar() {
  document.getElementById('trace-session-count').textContent = traceSessions.size;
  var list = document.getElementById('trace-session-list');
  list.innerHTML = '';
  for (var entry of traceSessions.entries()) {
    var id = entry[0], s = entry[1];
    var steps = s.steps || [];
    var ms = steps.reduce(function(a, b) { return a + (b.latencyMs||0); }, 0);
    var el = document.createElement('div');
    el.className = 'trace-session-item' + (traceActive === id ? ' active' : '');
    el.innerHTML = '<div class="trace-session-name">' + esc(s.session||id) + '</div><div class="trace-session-meta">' + steps.length + ' steps / ' + fmtMs(ms) + '</div>';
    (function(sid) { el.addEventListener('click', function() { selectTrace(sid); }); })(id);
    list.appendChild(el);
  }
}

function selectTrace(id) {
  traceActive = id;
  renderTraceSidebar();
  renderTraceView(id);
}

function renderTraceView(id) {
  var s = traceSessions.get(id);
  var steps = s.steps || [];
  document.getElementById('trace-drop-zone').style.display = 'none';
  var wrap = document.getElementById('trace-view-wrap');
  wrap.style.display = 'flex';

  var ms = steps.reduce(function(a,b){return a+(b.latencyMs||0);},0);
  var tok = steps.reduce(function(a,b){return a+(b.tokens||0);},0);
  var errs = steps.filter(function(x){return x.type==='error';}).length;

  document.getElementById('trace-view-header').innerHTML =
    '<span class="trace-view-title">' + esc(s.session||id) + '</span>' +
    '<span class="trace-badge">' + (errs ? errs + ' error' + (errs>1?'s':'') : 'clean') + '</span>' +
    '<div class="trace-stats">' +
      '<div class="trace-stat"><div class="trace-stat-val">' + steps.length + '</div><div class="trace-stat-lbl">STEPS</div></div>' +
      '<div class="trace-stat"><div class="trace-stat-val">' + fmtMs(ms) + '</div><div class="trace-stat-lbl">TIME</div></div>' +
      (tok ? '<div class="trace-stat"><div class="trace-stat-val">' + fmtTok(tok) + '</div><div class="trace-stat-lbl">TOKENS</div></div>' : '') +
    '</div>';

  var tl = document.getElementById('trace-timeline');
  tl.innerHTML = '';
  if (!steps.length) {
    tl.innerHTML = '<div style="padding:32px;text-align:center;font-size:12px;color:rgba(255,255,255,0.3)">no steps recorded</div>';
    return;
  }
  steps.forEach(function(step, i) {
    var type = step.type || 'custom';
    var sname = esc(step.toolName || step.name || type);
    var hasDetails = !!(step.inputs || step.outputs || step.error);
    var el = document.createElement('div');
    el.className = 'trace-step';
    var dotChar = TRACE_DOTS[type] || TRACE_DOTS.custom;
    el.innerHTML =
      '<div class="trace-step-dot type-' + type + '">' + dotChar + '</div>' +
      '<div class="trace-step-body" id="tsb' + i + '">' +
        '<div class="trace-step-top">' +
          '<span class="trace-step-type type-' + type + '">' + type.replace('_',' ') + '</span>' +
          '<span class="trace-step-name">' + sname + '</span>' +
          (step.latencyMs ? '<span class="trace-step-ms">' + fmtMs(step.latencyMs) + '</span>' : '') +
        '</div>' +
        (hasDetails ?
          '<div class="trace-step-details" id="tsd' + i + '">' +
            '<div class="trace-detail-grid">' +
              (step.inputs ? '<div><div class="trace-detail-lbl">inputs</div><div class="trace-detail-val">' + esc(JSON.stringify(step.inputs,null,2)) + '</div></div>' : '') +
              (step.outputs ? '<div><div class="trace-detail-lbl">outputs</div><div class="trace-detail-val">' + esc(JSON.stringify(step.outputs,null,2)) + '</div></div>' : '') +
              (step.error ? '<div style="grid-column:span 2"><div class="trace-detail-lbl">error</div><div class="trace-detail-val">' + esc(step.error) + '</div></div>' : '') +
            '</div>' +
          '</div>'
        : '') +
      '</div>';
    if (hasDetails) {
      (function(idx) {
        el.querySelector('#tsb' + idx).addEventListener('click', function() {
          el.querySelector('#tsd' + idx).classList.toggle('show');
          el.querySelector('#tsb' + idx).classList.toggle('expanded');
        });
      })(i);
    }
    tl.appendChild(el);
  });
}

document.getElementById('trace-file-input').addEventListener('change', function(e) {
  for (var i = 0; i < e.target.files.length; i++) {
    (function(f) {
      var r = new FileReader();
      r.onload = function(ev) {
        try { loadTrace(ev.target.result, f.name.replace('.json','')); }
        catch(e2) { alert('Could not parse ' + f.name + ': ' + e2.message); }
      };
      r.readAsText(f);
    })(e.target.files[i]);
  }
});

var traceDz = document.getElementById('trace-drop-zone');
document.addEventListener('dragover', function(e) { e.preventDefault(); traceDz.classList.add('drag'); });
document.addEventListener('dragleave', function(e) { if (!e.relatedTarget) traceDz.classList.remove('drag'); });
document.addEventListener('drop', function(e) {
  e.preventDefault(); traceDz.classList.remove('drag');
  var files = e.dataTransfer.files;
  for (var i = 0; i < files.length; i++) {
    if (!files[i].name.endsWith('.json')) continue;
    (function(f) {
      var r = new FileReader();
      r.onload = function(ev) {
        try { loadTrace(ev.target.result, f.name.replace('.json','')); }
        catch(e2) { alert('Could not parse ' + f.name); }
      };
      r.readAsText(f);
    })(files[i]);
  }
});

// ── NOTIFY ───────────────────────────────────────────────────────────────────
function notifySignup(module) {
  var email = document.getElementById(module + '-email').value.trim();
  if (!email) return;
  document.getElementById(module + '-msg').style.display = 'block';
  document.getElementById(module + '-email').disabled = true;
}

// ── MEMEX ─────────────────────────────────────────────────────────────────────
function memexInit() {
  if (authToken) {
    document.getElementById('memex-auth-gate').style.display = 'none';
    document.getElementById('memex-browser').style.display = 'block';
    memexLoad();
  } else {
    document.getElementById('memex-auth-gate').style.display = 'block';
    document.getElementById('memex-browser').style.display = 'none';
  }
}

function memexLoad() {
  if (!authToken) return;
  var agent = (document.getElementById('mx-agent').value || '').trim();
  var ns = (document.getElementById('mx-ns').value || '').trim();
  var q = (document.getElementById('mx-q').value || '').trim();
  var url = '/v1/memex?limit=200';
  if (agent) url += '&agent_id=' + encodeURIComponent(agent);
  if (ns) url += '&namespace=' + encodeURIComponent(ns);
  if (q) url += '&q=' + encodeURIComponent(q);
  var list = document.getElementById('mx-list');
  list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:rgba(255,255,255,0.3);font-size:0.8rem">loading...</div>';
  fetch(url, { headers: { Authorization: 'Bearer ' + authToken } })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.success) { list.innerHTML = '<div style="padding:1.5rem;color:rgba(255,0,0,0.7);font-size:0.8rem">' + escHtml(d.error || 'error') + '</div>'; return; }
      if (!d.memories.length) {
        list.innerHTML = '<div style="padding:2rem;text-align:center;color:rgba(255,255,255,0.3);font-size:0.8rem">no memories stored yet. use the form below to store the first one.</div>';
        return;
      }
      var rows = d.memories.map(function(m) {
        var val = typeof m.value === 'string' ? m.value : JSON.stringify(m.value, null, 2);
        var valShort = val.length > 120 ? val.slice(0, 117) + '...' : val;
        return '<div style="display:grid;grid-template-columns:1fr 1fr 80px 70px auto;gap:0;border-bottom:1px solid rgba(255,255,255,0.06);padding:0.75rem 1rem;align-items:center" class="mx-row">' +
          '<div style="font-size:0.8rem;font-weight:700;word-break:break-all">' + escHtml(m.agent_id) + '<span style="color:rgba(255,255,255,0.35);margin:0 0.3rem">/</span>' + escHtml(m.namespace) + '<span style="color:rgba(255,255,255,0.35);margin:0 0.3rem">/</span>' + escHtml(m.key) + '</div>' +
          '<div style="font-size:0.75rem;color:rgba(255,255,255,0.55);word-break:break-all;padding:0 0.5rem" title="' + escHtml(val) + '">' + escHtml(valShort) + '</div>' +
          '<div style="font-size:0.65rem;color:rgba(255,255,255,0.35);text-align:center">' + escHtml(m.type) + '</div>' +
          '<div style="font-size:0.65rem;color:rgba(255,255,255,0.3);text-align:center">' + (m.expires_at ? 'exp ' + m.expires_at.slice(0,10) : 'no exp') + '</div>' +
          '<button onclick="memexForget(\'' + escHtml(m.id) + '\')" style="padding:0.3rem 0.75rem;background:transparent;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);font-family:inherit;font-size:0.65rem;cursor:pointer;letter-spacing:0.1em;white-space:nowrap">forget</button>' +
          '</div>';
      });
      list.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 80px 70px auto;padding:0.5rem 1rem;border-bottom:1px solid rgba(255,255,255,0.15)">' +
        '<div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.3)">agent / namespace / key</div>' +
        '<div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.3);padding:0 0.5rem">value</div>' +
        '<div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.3);text-align:center">type</div>' +
        '<div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.3);text-align:center">ttl</div>' +
        '<div></div>' +
        '</div>' + rows.join('');
    })
    .catch(function() { list.innerHTML = '<div style="padding:1.5rem;color:rgba(255,0,0,0.6);font-size:0.8rem">failed to load memories</div>'; });
}

function memexForget(id) {
  if (!authToken) return;
  fetch('/v1/memex/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + authToken } })
    .then(function(r) { return r.json(); })
    .then(function(d) { if (d.success) memexLoad(); else alert('Could not forget: ' + (d.error || 'unknown error')); });
}

function memexStore() {
  if (!authToken) return;
  var key = document.getElementById('mx-new-key').value.trim();
  var val = document.getElementById('mx-new-val').value.trim();
  var agent = document.getElementById('mx-new-agent').value.trim() || 'default';
  var ns = document.getElementById('mx-new-ns').value.trim() || 'default';
  var type = document.getElementById('mx-new-type').value;
  var ttl = document.getElementById('mx-new-ttl').value;
  var msg = document.getElementById('mx-store-msg');
  if (!key || !val) { msg.style.display='block'; msg.textContent='key and value are required'; return; }
  var body = { key: key, agent_id: agent, namespace: ns, type: type };
  try { body.value = JSON.parse(val); } catch(e) { body.value = val; }
  if (ttl) body.ttl_seconds = parseInt(ttl);
  var btn = document.getElementById('mx-store-btn');
  btn.textContent = 'storing...'; btn.disabled = true;
  fetch('/v1/memex', { method: 'POST', headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      btn.textContent = 'store →'; btn.disabled = false;
      if (d.success) {
        msg.style.display='block'; msg.textContent = d.created ? '✓ stored' : '✓ updated';
        document.getElementById('mx-new-key').value=''; document.getElementById('mx-new-val').value='';
        setTimeout(function(){msg.style.display='none';},3000);
        memexLoad();
      } else { msg.style.display='block'; msg.textContent='error: ' + (d.error||'unknown'); }
    })
    .catch(function(){btn.textContent='store →';btn.disabled=false;msg.style.display='block';msg.textContent='network error';});
}

// ── HIVE ─────────────────────────────────────────────────────────────────────
function hiveInit() {
  if (authToken) {
    document.getElementById('hive-auth-gate').style.display = 'none';
    document.getElementById('hive-browser').style.display = 'block';
    hiveLoad();
  } else {
    document.getElementById('hive-auth-gate').style.display = 'block';
    document.getElementById('hive-browser').style.display = 'none';
  }
}

function hiveLoad() {
  if (!authToken) return;
  var list = document.getElementById('hive-list');
  list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:rgba(255,255,255,0.3);font-size:0.8rem">loading...</div>';
  fetch('/v1/hive', { headers: { Authorization: 'Bearer ' + authToken } })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.success) { list.innerHTML = '<div style="padding:1rem;color:rgba(255,0,0,0.7);font-size:0.8rem">' + escHtml(d.error||'error') + '</div>'; return; }
      if (!d.hives.length) {
        list.innerHTML = '<div style="padding:2rem;text-align:center;color:rgba(255,255,255,0.3);font-size:0.8rem">no hives yet. create your first agent network above.</div>';
        return;
      }
      list.innerHTML = '<div style="display:grid;grid-template-columns:1fr 2fr 80px 90px auto;padding:0.5rem 1rem;border-bottom:1px solid rgba(255,255,255,0.15)">' +
        '<div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.3)">name</div>' +
        '<div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.3)">description</div>' +
        '<div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.3)">status</div>' +
        '<div style="font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.3)">created</div>' +
        '<div></div></div>' +
        d.hives.map(function(h) {
          var statusColor = h.status === 'active' ? 'rgba(100,255,100,0.8)' : h.status === 'archived' ? 'rgba(255,255,255,0.2)' : 'rgba(255,200,50,0.7)';
          return '<div style="display:grid;grid-template-columns:1fr 2fr 80px 90px auto;gap:0;border-bottom:1px solid rgba(255,255,255,0.06);padding:0.75rem 1rem;align-items:center">' +
            '<div style="font-size:0.8rem;font-weight:700">' + escHtml(h.name) + '</div>' +
            '<div style="font-size:0.75rem;color:rgba(255,255,255,0.55)">' + escHtml(h.description||'—') + '</div>' +
            '<div style="font-size:0.65rem;color:' + statusColor + '">' + escHtml(h.status) + '</div>' +
            '<div style="font-size:0.65rem;color:rgba(255,255,255,0.3)">' + (h.created_at||'').slice(0,10) + '</div>' +
            '<button onclick="hiveSelect(\'' + escHtml(h.id) + '\')" style="padding:0.3rem 0.75rem;background:transparent;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.5);font-family:inherit;font-size:0.65rem;cursor:pointer;letter-spacing:0.1em;white-space:nowrap">edit</button>' +
            '</div>';
        }).join('');
    })
    .catch(function() { list.innerHTML = '<div style="padding:1rem;color:rgba(255,0,0,0.6);font-size:0.8rem">failed to load hives</div>'; });
}

function hiveSelect(id) {
  fetch('/v1/hive/' + id, { headers: { Authorization: 'Bearer ' + authToken } })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.success) return;
      var h = d.hive;
      document.getElementById('hive-edit-id').value = h.id;
      document.getElementById('hive-edit-name').value = h.name;
      document.getElementById('hive-edit-desc').value = h.description || '';
      document.getElementById('hive-edit-config').value = typeof h.config === 'string' ? h.config : JSON.stringify(h.config, null, 2);
      document.getElementById('hive-edit-status').value = h.status || 'draft';
      document.getElementById('hive-edit-panel').style.display = 'block';
      document.getElementById('hive-create-form').style.display = 'none';
      document.getElementById('hive-edit-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

function hiveUpdate() {
  var id = document.getElementById('hive-edit-id').value;
  var desc = document.getElementById('hive-edit-desc').value.trim();
  var configStr = document.getElementById('hive-edit-config').value.trim();
  var status = document.getElementById('hive-edit-status').value;
  var msg = document.getElementById('hive-edit-msg');
  var config;
  try { config = JSON.parse(configStr || '{}'); } catch(e) { msg.style.display='block'; msg.textContent='invalid JSON config'; return; }
  fetch('/v1/hive/' + id, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: desc, config: config, status: status })
  }).then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) {
        msg.style.display='block'; msg.textContent='saved';
        setTimeout(function(){ msg.style.display='none'; }, 3000);
        hiveLoad();
      } else { msg.style.display='block'; msg.textContent='error: ' + (d.error||'unknown'); }
    });
}

function hiveDelete(id) {
  if (!confirm('Delete this hive? This cannot be undone.')) return;
  fetch('/v1/hive/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + authToken } })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) { document.getElementById('hive-edit-panel').style.display='none'; hiveLoad(); }
      else { alert('Could not delete: ' + (d.error||'unknown')); }
    });
}

function hiveCreate() {
  var name = document.getElementById('hv-new-name').value.trim();
  var desc = document.getElementById('hv-new-desc').value.trim();
  var configStr = document.getElementById('hv-new-config').value.trim();
  var msg = document.getElementById('hv-create-msg');
  if (!name) { msg.style.display='block'; msg.textContent='name is required'; return; }
  var config;
  try { config = JSON.parse(configStr || '{}'); } catch(e) { msg.style.display='block'; msg.textContent='invalid JSON config'; return; }
  var btn = document.getElementById('hv-create-btn');
  btn.textContent = 'creating...'; btn.disabled = true;
  fetch('/v1/hive', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, description: desc, config: config })
  }).then(function(r) { return r.json(); })
    .then(function(d) {
      btn.textContent = 'create \u2192'; btn.disabled = false;
      if (d.success) {
        msg.style.display='block'; msg.textContent='hive created';
        document.getElementById('hv-new-name').value='';
        document.getElementById('hv-new-desc').value='';
        document.getElementById('hv-new-config').value='{"agents":[],"routing":"sequential","shared_memory":true}';
        setTimeout(function(){ msg.style.display='none'; document.getElementById('hive-create-form').style.display='none'; }, 2000);
        hiveLoad();
      } else { msg.style.display='block'; msg.textContent='error: ' + (d.error||'unknown'); }
    })
    .catch(function(){ btn.textContent='create \u2192'; btn.disabled=false; msg.style.display='block'; msg.textContent='network error'; });
}

function hiveOpenCreate() {
  document.getElementById('hive-edit-panel').style.display = 'none';
  document.getElementById('hive-create-form').style.display = 'block';
}

function hiveCloseCreate() {
  document.getElementById('hive-create-form').style.display = 'none';
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
var authToken = null;

function authInit() {
  var saved = localStorage.getItem('cerebrex_token');
  if (saved) { authToken = saved; fetchMe(); }
}

function authSignIn() {
  var val = document.getElementById('auth-token-input').value.trim();
  if (!val) return;
  authToken = val;
  localStorage.setItem('cerebrex_token', val);
  fetchMe();
}

function fetchMe() {
  fetch('/v1/users/me', {
    headers: { 'Authorization': 'Bearer ' + authToken }
  }).then(function(r) {
    if (!r.ok) throw new Error('unauthorized');
    return r.json();
  }).then(function(d) {
    document.getElementById('auth-username').textContent = '@' + (d.username || d.name || 'user');
    document.getElementById('auth-login-panel').style.display = 'none';
    document.getElementById('auth-authed-panel').classList.add('show');
    memexInit();
    hiveInit();
  }).catch(function() {
    document.getElementById('auth-error').textContent = 'invalid token — check and try again';
    document.getElementById('auth-error').style.display = 'block';
    localStorage.removeItem('cerebrex_token');
    authToken = null;
  });
}

function authSignOut() {
  localStorage.removeItem('cerebrex_token');
  authToken = null;
  document.getElementById('auth-token-input').value = '';
  document.getElementById('auth-login-panel').style.display = 'block';
  document.getElementById('auth-authed-panel').classList.remove('show');
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('new-token-result').style.display = 'none';
  memexInit();
  hiveInit();
}

function createToken() {
  var name = document.getElementById('new-token-name').value.trim();
  if (!name) { alert('enter a token name'); return; }
  var scopes = [];
  if (document.getElementById('scope-publish').checked) scopes.push('publish');
  if (document.getElementById('scope-install').checked) scopes.push('install');
  if (document.getElementById('scope-admin').checked) scopes.push('admin');
  fetch('/v1/auth/tokens', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, scopes: scopes })
  }).then(function(r) { return r.json(); }).then(function(d) {
    var tok = d.token || d.value || d.secret || '';
    if (!tok) { alert('token created (value not returned by API)'); return; }
    document.getElementById('new-token-value').textContent = tok;
    document.getElementById('new-token-result').style.display = 'block';
    document.getElementById('new-token-name').value = '';
  }).catch(function(e2) { alert('failed to create token: ' + e2.message); });
}

// ── REGISTRY ─────────────────────────────────────────────────────────────────
var allPackages = [];
var regSearchTimer = null;

async function regLoad(q) {
  q = q || '';
  var url = '/v1/packages?limit=100' + (q ? '&q=' + encodeURIComponent(q) : '');
  try {
    var r = await fetch(url);
    var d = await r.json();
    allPackages = d.packages || [];
    regRender(allPackages);
    document.getElementById('reg-stats').innerHTML = '<strong>' + (d.count || allPackages.length) + '</strong> packages' + (q ? ' matching "' + esc(q) + '"' : ' in the registry');
  } catch(e) {
    // keep SSR data if fetch fails
  }
}

function regRender(pkgs) {
  var grid = document.getElementById('pkg-grid');
  if (!pkgs.length) {
    grid.innerHTML = '<div class="pkg-empty">no packages found.</div>';
    return;
  }
  grid.innerHTML = pkgs.map(function(p, i) {
    return '<div class="pkg-card' + (p.featured ? ' featured' : '') + '" onclick="showPkg(' + i + ')">' +
      (p.featured ? '<span class="pkg-official">* official</span>' : '') +
      '<div class="pkg-name">' + esc(p.name) + '</div>' +
      '<div class="pkg-desc">' + esc(p.description || 'no description') + '</div>' +
      '<div class="pkg-meta">' +
        (p.tags||[]).slice(0,3).map(function(t) { return '<span class="pkg-tag">' + esc(t) + '</span>'; }).join('') +
        '<span class="pkg-ver">v' + esc(p.version) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function showPkg(i) {
  var p = allPackages[i];
  document.getElementById('pm-name').textContent = p.name;
  var tags = (p.tags||[]).map(function(t) { return '<span class="pkg-tag">' + esc(t) + '</span>'; }).join('');
  document.getElementById('pm-body').innerHTML =
    '<div class="pkg-modal-desc">' + esc(p.description || 'no description provided.') + '</div>' +
    (tags ? '<div class="pkg-detail-label">tags</div><div class="pkg-tags-row">' + tags + '</div>' : '') +
    '<div class="pkg-detail-label">install</div>' +
    '<div class="pkg-install-box">' +
      '<span class="pkg-install-cmd">cerebrex install ' + esc(p.name) + '</span>' +
      '<button onclick="copyText(\'cerebrex install ' + esc(p.name) + '\', this)">copy</button>' +
    '</div>' +
    '<div class="pkg-detail-label">version</div>' +
    '<div class="pkg-install-box" style="margin-bottom:16px">' +
      '<span class="pkg-install-cmd">v' + esc(p.version) + '</span>' +
      '<span style="font-size:10px;color:rgba(255,255,255,0.3)">' + fmtDate(p.published_at) + '</span>' +
    '</div>' +
    '<div class="pkg-meta-row">' +
      'by <a href="/u/' + esc(p.author||'') + '">@' + esc(p.author||'unknown') + '</a>' +
      (p.tarball_size ? ' &middot; ' + fmtSize(p.tarball_size) : '') +
      (p.deprecated ? ' &middot; <span style="color:rgba(255,255,255,0.6)">[deprecated]</span>' : '') +
      (p.download_count ? ' &middot; ' + p.download_count + ' installs' : '') +
    '</div>';
  document.getElementById('pkg-overlay').classList.add('show');
}

function closePkgModal(e) {
  if (e.target === document.getElementById('pkg-overlay')) document.getElementById('pkg-overlay').classList.remove('show');
}

document.getElementById('reg-search').addEventListener('input', function(e) {
  clearTimeout(regSearchTimer);
  regSearchTimer = setTimeout(function() { regLoad(e.target.value.trim()); }, 280);
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.getElementById('pkg-overlay').classList.remove('show');
  }
});

// ── INIT ─────────────────────────────────────────────────────────────────────
authInit();
regLoad();
memexInit();
hiveInit();

// ── PWA ───────────────────────────────────────────────────────────────────────
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
</script>
</body>
</html>`;

  const esc = (s: string) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const gridHtml = initialPackages.length === 0
    ? '<div class="pkg-empty">No packages published yet. Run <code>cerebrex publish</code> to add the first.</div>'
    : initialPackages.map((p: any, i: number) =>
        '<div class="pkg-card' + (p.featured ? ' featured' : '') + '" onclick="showPkg(' + i + ')">' +
          (p.featured ? '<span class="pkg-official">* official</span>' : '') +
          '<div class="pkg-name">' + esc(p.name) + '</div>' +
          '<div class="pkg-desc">' + esc(p.description || 'No description') + '</div>' +
          '<div class="pkg-meta">' +
            (p.tags||[]).slice(0,3).map((t: string) => '<span class="pkg-tag">' + esc(t) + '</span>').join('') +
            '<span class="pkg-ver">v' + esc(p.version) + '</span>' +
          '</div>' +
        '</div>'
      ).join('');

  const statsHtml = '<strong>' + initialCount + '</strong> packages in the registry';

  return page
    .replace('__INITIAL_GRID__', gridHtml)
    .replace('__INITIAL_STATS__', statsHtml)
    .replace('let allPackages = [];', 'let allPackages = ' + JSON.stringify(initialPackages) + ';');
}

// ── Web UI — Profile Page ─────────────────────────────────────────────────────

function profileUI(username: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${username} — CerebreX Registry</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0d0d0f;--surface:#16161a;--border:#2a2a30;--text:#e8e8f0;--muted:#6b6b80;--cyan:#00c8e0;--green:#22d3a0;--yellow:#f5a623;--red:#f56060}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
    header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 32px;display:flex;align-items:center;gap:16px}
    .logo{font-size:20px;font-weight:700;color:var(--cyan);text-decoration:none}
    .logo span{color:var(--muted);font-weight:400;font-size:14px}
    .header-links{margin-left:auto;display:flex;gap:16px}
    .header-links a{color:var(--muted);text-decoration:none;font-size:13px}
    .header-links a:hover{color:var(--text)}
    .content{max-width:900px;margin:40px auto;padding:0 32px}
    .profile-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:32px;display:flex;gap:24px;align-items:flex-start;margin-bottom:32px}
    .avatar{width:72px;height:72px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;overflow:hidden}
    .avatar img{width:100%;height:100%;object-fit:cover}
    .profile-info{flex:1}
    .profile-name{font-size:22px;font-weight:700;margin-bottom:4px}
    .profile-bio{color:var(--muted);font-size:14px;margin-bottom:8px;line-height:1.5}
    .profile-meta{display:flex;gap:16px;font-size:12px;color:var(--muted);flex-wrap:wrap}
    .profile-meta a{color:var(--cyan);text-decoration:none}
    .profile-meta a:hover{text-decoration:underline}
    .role-badge{background:rgba(245,166,35,.15);color:var(--yellow);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700}
    .admin-badge{background:rgba(245,96,96,.15);color:var(--red);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700}
    .section-title{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:16px}
    .pkg-list{display:flex;flex-direction:column;gap:10px}
    .pkg-row{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px 18px;display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--text);transition:border-color .1s}
    .pkg-row:hover{border-color:var(--cyan)}
    .pkg-name{font-weight:600;color:var(--cyan);font-size:14px}
    .pkg-desc{font-size:12px;color:var(--muted);margin-top:2px}
    .pkg-stat{margin-left:auto;font-size:12px;color:var(--muted);text-align:right;white-space:nowrap}
    .empty{color:var(--muted);font-size:14px;padding:32px 0;text-align:center}
    .loading{color:var(--muted);padding:32px 0;text-align:center}
  </style>
</head>
<body>
<header>
  <a href="/" class="logo">CerebreX <span>Registry</span></a>
  <div class="header-links">
    <a href="/ui/trace">Trace Explorer</a>
    <a href="/account">My Account</a>
    <a href="https://github.com/arealcoolco/CerebreX" target="_blank">GitHub</a>
  </div>
</header>
<div class="content">
  <div id="profile"><div class="loading">Loading profile...</div></div>
</div>
<script>
const username = ${JSON.stringify(username)};
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fmtDate(iso){try{return new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});}catch{return iso||''}}

async function load(){
  try{
    const r=await fetch('/v1/users/'+encodeURIComponent(username));
    const d=await r.json();
    if(!d.success){document.getElementById('profile').innerHTML='<div class="empty">User not found.</div>';return;}
    const u=d;
    const roleBadge = u.role==='admin'?'<span class="admin-badge">Admin</span>':u.role==='user'?'':'<span class="role-badge">'+esc(u.role)+'</span>';
    const avatarInner = u.avatar_url?'<img src="'+esc(u.avatar_url)+'" alt=""/>':'👤';
    let html='<div class="profile-card">'+
      '<div class="avatar">'+avatarInner+'</div>'+
      '<div class="profile-info">'+
        '<div class="profile-name">'+esc(u.username)+' '+roleBadge+'</div>'+
        (u.bio?'<div class="profile-bio">'+esc(u.bio)+'</div>':'')+
        '<div class="profile-meta">'+
          '<span>Joined '+fmtDate(u.member_since)+'</span>'+
          '<span>'+((u.packages||[]).length)+' package'+(((u.packages||[]).length)===1?'':'s')+'</span>'+
          (u.website?'<a href="'+esc(u.website)+'" target="_blank" rel="noopener">🌐 Website</a>':'')+
        '</div>'+
      '</div>'+
    '</div>';
    html+='<div class="section-title">Published Packages</div>';
    const pkgs=u.packages||[];
    if(!pkgs.length){html+='<div class="empty">No packages published yet.</div>';}
    else{
      html+='<div class="pkg-list">'+pkgs.map(p=>
        '<div class="pkg-row">'+
          '<div>'+
            '<div class="pkg-name">'+esc(p.name)+'</div>'+
            (p.description?'<div class="pkg-desc">'+esc(p.description)+'</div>':'')+
          '</div>'+
          '<div class="pkg-stat">'+
            '<div>v'+esc(p.version||'')+'</div>'+
            '<div>'+(p.download_count||0)+' downloads</div>'+
          '</div>'+
        '</div>'
      ).join('')+'</div>';
    }
    document.getElementById('profile').innerHTML=html;
  }catch(e){document.getElementById('profile').innerHTML='<div class="empty">Failed to load profile.</div>';}
}
load();
</script>
</body>
</html>`;
}

// ── Web UI — Account Dashboard ────────────────────────────────────────────────

function accountUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>My Account — CerebreX Registry</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0d0d0f;--surface:#16161a;--border:#2a2a30;--text:#e8e8f0;--muted:#6b6b80;--cyan:#00c8e0;--green:#22d3a0;--yellow:#f5a623;--red:#f56060}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
    header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 32px;display:flex;align-items:center;gap:16px}
    .logo{font-size:20px;font-weight:700;color:var(--cyan);text-decoration:none}
    .logo span{color:var(--muted);font-weight:400;font-size:14px}
    .header-links{margin-left:auto;display:flex;gap:16px}
    .header-links a{color:var(--muted);text-decoration:none;font-size:13px}
    .header-links a:hover{color:var(--text)}
    .content{max-width:860px;margin:40px auto;padding:0 32px}
    .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;margin-bottom:24px}
    .card-title{font-size:16px;font-weight:700;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--border)}
    .form-row{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
    .form-row label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
    .form-row input,.form-row textarea{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;color:var(--text);font-size:14px;font-family:inherit;outline:none;transition:border-color .15s;width:100%}
    .form-row input:focus,.form-row textarea:focus{border-color:var(--cyan)}
    .form-row textarea{resize:vertical;min-height:70px}
    .btn{padding:9px 18px;border-radius:6px;font-size:13px;font-weight:600;border:none;cursor:pointer;font-family:inherit;transition:background .1s}
    .btn-primary{background:var(--cyan);color:var(--bg)}
    .btn-primary:hover{background:#00b0c8}
    .btn-danger{background:rgba(245,96,96,.15);color:var(--red);border:1px solid rgba(245,96,96,.3)}
    .btn-danger:hover{background:rgba(245,96,96,.25)}
    .info-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px}
    .info-row:last-child{border-bottom:none}
    .info-label{color:var(--muted)}
    .info-value{color:var(--text);font-family:monospace;font-size:12px}
    .pkg-list{display:flex;flex-direction:column;gap:8px}
    .pkg-row{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px 16px;display:flex;align-items:center;gap:12px;font-size:13px}
    .pkg-name{color:var(--cyan);font-weight:600}
    .pkg-stat{margin-left:auto;color:var(--muted);font-size:12px}
    .login-box{text-align:center;padding:40px}
    .login-box p{color:var(--muted);margin-bottom:20px}
    .token-input{width:100%;max-width:400px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;color:var(--text);font-size:14px;font-family:monospace;outline:none;margin-bottom:12px;display:block;margin:0 auto 12px}
    .token-input:focus{border-color:var(--cyan)}
    .msg{padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:12px}
    .msg-ok{background:rgba(34,211,160,.1);color:var(--green)}
    .msg-err{background:rgba(245,96,96,.1);color:var(--red)}
    .admin-link{display:inline-block;margin-top:8px;color:var(--yellow);text-decoration:none;font-size:13px}
    .admin-link:hover{text-decoration:underline}
  </style>
</head>
<body>
<header>
  <a href="/" class="logo">CerebreX <span>Registry</span></a>
  <div class="header-links">
    <a href="/">Registry</a>
    <a href="/ui/trace">Trace Explorer</a>
    <a href="https://github.com/arealcoolco/CerebreX" target="_blank">GitHub</a>
  </div>
</header>
<div class="content" id="app">
  <div id="login-view">
    <div class="card">
      <div class="card-title">Sign In to Your Account</div>
      <div class="login-box">
        <p>Paste your CerebreX Registry token to view your account</p>
        <input type="password" class="token-input" id="token-input" placeholder="Paste token here..." autocomplete="off"/>
        <div id="login-msg"></div>
        <br/>
        <button class="btn btn-primary" onclick="doLogin()">Sign In</button>
        <br/><br/>
        <p style="font-size:12px;color:var(--muted)">Don't have an account? <code style="color:var(--cyan)">cerebrex auth register</code></p>
      </div>
    </div>
  </div>
  <div id="account-view" style="display:none"></div>
</div>
<script>
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fmtDate(iso){try{return new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});}catch{return iso||''}}

let storedToken = localStorage.getItem('cerebrex_token') || '';

async function doLogin(){
  const t = document.getElementById('token-input').value.trim();
  if(!t){showMsg('login-msg','Token is required','err');return;}
  document.getElementById('login-msg').innerHTML='<div class="msg">Checking...</div>';
  const r = await fetch('/v1/users/me',{headers:{Authorization:'Bearer '+t}});
  const d = await r.json();
  if(!d.success){showMsg('login-msg','Invalid token. Try again.','err');return;}
  localStorage.setItem('cerebrex_token',t);
  storedToken = t;
  renderAccount(d);
}

function showMsg(id, text, type){
  document.getElementById(id).innerHTML = '<div class="msg msg-'+(type==='err'?'err':'ok')+'">'+esc(text)+'</div>';
}

function renderAccount(d){
  document.getElementById('login-view').style.display='none';
  const av=document.getElementById('account-view');
  av.style.display='block';
  const pkgs=d.packages||[];
  av.innerHTML=
    '<div class="card">'+
      '<div class="card-title">👤 '+esc(d.username)+(d.role==='admin'?'  <span style="background:rgba(245,96,96,.15);color:var(--red);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">Admin</span>':' <span style="background:rgba(0,200,224,.1);color:var(--cyan);border-radius:4px;padding:2px 8px;font-size:11px">User</span>')+'</div>'+
      '<div class="info-row"><span class="info-label">Username</span><span class="info-value">'+esc(d.username)+'</span></div>'+
      '<div class="info-row"><span class="info-label">Role</span><span class="info-value">'+esc(d.role)+'</span></div>'+
      '<div class="info-row"><span class="info-label">Member since</span><span class="info-value">'+fmtDate(d.member_since)+'</span></div>'+
      '<div class="info-row"><span class="info-label">Token expires</span><span class="info-value">'+(d.token_expires_at?fmtDate(d.token_expires_at):'No expiry')+'</span></div>'+
      '<br/>'+
      (d.role==='admin'?'<a href="/admin" class="admin-link">⚙ Go to Admin Panel →</a>':'')+
      '<br/><br/>'+
      '<button class="btn btn-danger" onclick="doLogout()">Sign Out</button>'+
    '</div>'+
    '<div class="card">'+
      '<div class="card-title">Edit Profile</div>'+
      '<div id="profile-msg"></div>'+
      '<div class="form-row"><label>Bio</label><textarea id="bio-input" maxlength="200" placeholder="Tell the community about yourself...">'+esc(d.bio)+'</textarea></div>'+
      '<div class="form-row"><label>Website</label><input type="url" id="website-input" placeholder="https://yoursite.com" value="'+esc(d.website||'')+'"/></div>'+
      '<div class="form-row"><label>Avatar URL</label><input type="url" id="avatar-input" placeholder="https://example.com/avatar.png" value="'+esc(d.avatar_url||'')+'"/></div>'+
      '<button class="btn btn-primary" onclick="saveProfile()">Save Profile</button>'+
      '<br/><br/><a href="/u/'+esc(d.username)+'" style="color:var(--cyan);font-size:13px">View public profile →</a>'+
    '</div>'+
    '<div class="card">'+
      '<div class="card-title">Your Packages ('+pkgs.length+')</div>'+
      (pkgs.length?
        '<div class="pkg-list">'+pkgs.map(p=>
          '<div class="pkg-row">'+
            '<div><span class="pkg-name">'+esc(p.name)+'</span> <span style="color:var(--muted);font-size:11px">v'+esc(p.version||'')+'</span>'+
            (p.deprecated?'<span style="color:var(--red);font-size:11px;margin-left:8px">deprecated</span>':'')+
            (p.description?'<div style="color:var(--muted);font-size:12px;margin-top:2px">'+esc(p.description)+'</div>':'')+
            '</div>'+
            '<div class="pkg-stat">'+esc(String(p.download_count||0))+' dl</div>'+
          '</div>'
        ).join('')+'</div>'
        :'<div style="color:var(--muted);font-size:14px;padding:16px 0">No packages yet. Publish with <code style="color:var(--cyan)">cerebrex publish</code></div>'
      )+
    '</div>';
}

async function saveProfile(){
  const bio = document.getElementById('bio-input').value;
  const website = document.getElementById('website-input').value;
  const avatar_url = document.getElementById('avatar-input').value;
  const r = await fetch('/v1/users/me',{method:'PATCH',headers:{Authorization:'Bearer '+storedToken,'Content-Type':'application/json'},body:JSON.stringify({bio,website,avatar_url})});
  const d = await r.json();
  showMsg('profile-msg', d.success ? '✓ Profile updated' : (d.error||'Update failed'), d.success ? 'ok' : 'err');
}

function doLogout(){
  localStorage.removeItem('cerebrex_token');
  storedToken='';
  document.getElementById('account-view').style.display='none';
  document.getElementById('login-view').style.display='block';
}

// Auto-login if token stored
if(storedToken){
  fetch('/v1/users/me',{headers:{Authorization:'Bearer '+storedToken}})
    .then(r=>r.json()).then(d=>{if(d.success)renderAccount(d);else localStorage.removeItem('cerebrex_token');})
    .catch(()=>{});
}

document.getElementById('token-input').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
</script>
</body>
</html>`;
}

// ── Web UI — Admin Panel ──────────────────────────────────────────────────────

function adminUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Admin — CerebreX Registry</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0d0d0f;--surface:#16161a;--border:#2a2a30;--text:#e8e8f0;--muted:#6b6b80;--cyan:#00c8e0;--green:#22d3a0;--yellow:#f5a623;--red:#f56060}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
    header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 32px;display:flex;align-items:center;gap:16px}
    .logo{font-size:20px;font-weight:700;color:var(--cyan);text-decoration:none}
    .logo span{color:var(--muted);font-weight:400;font-size:14px}
    .header-links{margin-left:auto;display:flex;gap:16px}
    .header-links a{color:var(--muted);text-decoration:none;font-size:13px}
    .header-links a:hover{color:var(--text)}
    .content{max-width:1100px;margin:32px auto;padding:0 32px}
    .tabs{display:flex;gap:4px;margin-bottom:24px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:4px;width:fit-content}
    .tab{padding:7px 18px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;color:var(--muted);border:none;background:none;font-family:inherit;transition:background .1s,color .1s}
    .tab.active{background:var(--cyan);color:var(--bg)}
    .tab:hover:not(.active){color:var(--text);background:rgba(255,255,255,.05)}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:10px 14px;border-bottom:2px solid var(--border);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.6px;font-weight:600}
    td{padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
    tr:hover td{background:rgba(255,255,255,.02)}
    .badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700}
    .badge-admin{background:rgba(245,96,96,.15);color:var(--red)}
    .badge-user{background:rgba(0,200,224,.1);color:var(--cyan)}
    .badge-banned{background:rgba(107,107,128,.15);color:var(--muted)}
    .badge-featured{background:rgba(245,166,35,.15);color:var(--yellow)}
    .btn{padding:5px 12px;border-radius:5px;font-size:12px;font-weight:600;border:none;cursor:pointer;font-family:inherit;transition:background .1s}
    .btn-sm-danger{background:rgba(245,96,96,.15);color:var(--red);border:1px solid rgba(245,96,96,.3)}
    .btn-sm-danger:hover{background:rgba(245,96,96,.3)}
    .btn-sm{background:var(--border);color:var(--text)}
    .btn-sm:hover{background:rgba(255,255,255,.1)}
    .btn-sm-yellow{background:rgba(245,166,35,.15);color:var(--yellow);border:1px solid rgba(245,166,35,.3)}
    .btn-sm-yellow:hover{background:rgba(245,166,35,.3)}
    .login-box{text-align:center;padding:80px 32px;color:var(--muted)}
    .login-box input{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;color:var(--text);font-size:14px;font-family:monospace;outline:none;width:100%;max-width:380px;margin-bottom:12px;display:block;margin:0 auto 12px}
    .login-box input:focus{border-color:var(--cyan)}
    .btn-primary{background:var(--cyan);color:var(--bg);padding:9px 20px;border-radius:6px;font-size:13px;font-weight:600;border:none;cursor:pointer}
    .stats{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
    .stat-box{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px 20px;min-width:120px}
    .stat-num{font-size:24px;font-weight:700;color:var(--cyan)}
    .stat-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:4px}
    .msg{padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:12px}
    .msg-ok{background:rgba(34,211,160,.1);color:var(--green)}
    .msg-err{background:rgba(245,96,96,.1);color:var(--red)}
  </style>
</head>
<body>
<header>
  <a href="/" class="logo">CerebreX <span>Admin</span></a>
  <div class="header-links">
    <a href="/">Registry</a>
    <a href="/account">My Account</a>
  </div>
</header>
<div class="content" id="app">
  <div id="login-view">
    <div class="login-box">
      <h2 style="color:var(--red);margin-bottom:12px">⚠ Admin Access Required</h2>
      <p style="margin-bottom:24px">Enter your admin token to continue</p>
      <input type="password" id="token-input" placeholder="Admin token..." autocomplete="off"/>
      <br/>
      <button class="btn-primary" onclick="doLogin()">Access Admin Panel</button>
      <div id="login-msg" style="margin-top:12px"></div>
    </div>
  </div>
  <div id="admin-view" style="display:none"></div>
</div>
<script>
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fmtDate(iso){try{return new Date(iso).toLocaleDateString();}catch{return iso||''}}
let adminToken=localStorage.getItem('cerebrex_admin_token')||'';
let data={users:[],packages:[]};
let activeTab='users';

async function doLogin(){
  const t=document.getElementById('token-input').value.trim();
  if(!t){document.getElementById('login-msg').innerHTML='<div class="msg msg-err">Token required</div>';return;}
  document.getElementById('login-msg').innerHTML='<div class="msg">Checking...</div>';
  const r=await fetch('/v1/admin/users',{headers:{Authorization:'Bearer '+t}});
  const d=await r.json();
  if(!d.success){document.getElementById('login-msg').innerHTML='<div class="msg msg-err">'+(d.error||'Access denied')+'</div>';return;}
  adminToken=t;
  localStorage.setItem('cerebrex_admin_token',t);
  data.users=d.users||[];
  await loadPackages();
  document.getElementById('login-view').style.display='none';
  document.getElementById('admin-view').style.display='block';
  renderAll();
}

async function loadPackages(){
  const r=await fetch('/v1/packages?limit=100');
  const d=await r.json();
  data.packages=d.packages||[];
}

function renderAll(){
  const av=document.getElementById('admin-view');
  const totalDl=data.packages.reduce((a,p)=>a+(p.download_count||0),0);
  av.innerHTML=
    '<div class="stats">'+
      '<div class="stat-box"><div class="stat-num">'+data.users.length+'</div><div class="stat-label">Users</div></div>'+
      '<div class="stat-box"><div class="stat-num">'+data.packages.length+'</div><div class="stat-label">Packages</div></div>'+
      '<div class="stat-box"><div class="stat-num">'+totalDl+'</div><div class="stat-label">Downloads</div></div>'+
    '</div>'+
    '<div id="admin-msg"></div>'+
    '<div class="tabs">'+
      '<button class="tab'+(activeTab==='users'?' active':'')+'" onclick="switchTab(\'users\')">Users</button>'+
      '<button class="tab'+(activeTab==='packages'?' active':'')+'" onclick="switchTab(\'packages\')">Packages</button>'+
    '</div>'+
    '<div id="tab-content"></div>';
  renderTab();
}

function switchTab(tab){activeTab=tab;renderAll();}

function renderTab(){
  const c=document.getElementById('tab-content');
  if(activeTab==='users'){
    if(!data.users.length){c.innerHTML='<p style="color:var(--muted);padding:24px">No users yet.</p>';return;}
    c.innerHTML='<table><thead><tr><th>Username</th><th>Role</th><th>Packages</th><th>Joined</th><th>Actions</th></tr></thead><tbody>'+
      data.users.map(u=>
        '<tr>'+
          '<td><a href="/u/'+esc(u.username)+'" style="color:var(--cyan);text-decoration:none">'+esc(u.username)+'</a></td>'+
          '<td><span class="badge badge-'+esc(u.role||'user')+'">'+esc(u.role||'user')+'</span></td>'+
          '<td>'+esc(String(u.package_count||0))+'</td>'+
          '<td>'+fmtDate(u.created_at)+'</td>'+
          '<td style="display:flex;gap:6px;flex-wrap:wrap">'+
            (u.role!=='admin'?'<button class="btn btn-sm" onclick="setRole(\''+esc(u.username)+'\',\'admin\')">Make Admin</button>':'<button class="btn btn-sm" onclick="setRole(\''+esc(u.username)+'\',\'user\')">Remove Admin</button>')+
            (u.role!=='banned'?'<button class="btn btn-sm-danger" onclick="setRole(\''+esc(u.username)+'\',\'banned\')">Ban</button>':'<button class="btn btn-sm" onclick="setRole(\''+esc(u.username)+'\',\'user\')">Unban</button>')+
          '</td>'+
        '</tr>'
      ).join('')+'</tbody></table>';
  } else {
    if(!data.packages.length){c.innerHTML='<p style="color:var(--muted);padding:24px">No packages yet.</p>';return;}
    c.innerHTML='<table><thead><tr><th>Package</th><th>Author</th><th>Version</th><th>Downloads</th><th>Actions</th></tr></thead><tbody>'+
      data.packages.map(p=>
        '<tr>'+
          '<td><span style="color:var(--cyan);font-weight:600">'+esc(p.name)+'</span>'+(p.featured?'<span class="badge badge-featured" style="margin-left:6px">★</span>':'')+
          (p.deprecated?'<span style="color:var(--red);font-size:11px;margin-left:6px">deprecated</span>':'')+'</td>'+
          '<td><a href="/u/'+esc(p.author)+'" style="color:var(--muted);text-decoration:none">'+esc(p.author)+'</a></td>'+
          '<td>v'+esc(p.version||'')+'</td>'+
          '<td>'+esc(String(p.download_count||0))+'</td>'+
          '<td style="display:flex;gap:6px;flex-wrap:wrap">'+
            '<button class="btn btn-sm-yellow" onclick="toggleFeature(\''+esc(p.name)+'\','+(!p.featured)+')">'+(p.featured?'Unfeature':'★ Feature')+'</button>'+
          '</td>'+
        '</tr>'
      ).join('')+'</tbody></table>';
  }
}

async function setRole(username, role){
  const r=await fetch('/v1/admin/users/'+encodeURIComponent(username),{method:'PATCH',headers:{Authorization:'Bearer '+adminToken,'Content-Type':'application/json'},body:JSON.stringify({role})});
  const d=await r.json();
  showAdminMsg(d.success?(username+' → '+role):(d.error||'Error'), d.success?'ok':'err');
  if(d.success){const u=data.users.find(x=>x.username===username);if(u)u.role=role;renderAll();}
}

async function toggleFeature(name, featured){
  const r=await fetch('/v1/admin/packages/'+encodeURIComponent(name)+'/feature',{method:'POST',headers:{Authorization:'Bearer '+adminToken,'Content-Type':'application/json'},body:JSON.stringify({featured})});
  const d=await r.json();
  showAdminMsg(d.success?d.message:(d.error||'Error'), d.success?'ok':'err');
  if(d.success){const p=data.packages.find(x=>x.name===name);if(p)p.featured=featured;renderAll();}
}

function showAdminMsg(text,type){
  document.getElementById('admin-msg').innerHTML='<div class="msg msg-'+(type==='err'?'err':'ok')+'">'+esc(text)+'</div>';
  setTimeout(()=>{const el=document.getElementById('admin-msg');if(el)el.innerHTML='';},3000);
}

// Auto-login
if(adminToken){
  fetch('/v1/admin/users',{headers:{Authorization:'Bearer '+adminToken}})
    .then(r=>r.json()).then(d=>{
      if(d.success){data.users=d.users||[];loadPackages().then(()=>{
        document.getElementById('login-view').style.display='none';
        document.getElementById('admin-view').style.display='block';
        renderAll();
      });}
      else localStorage.removeItem('cerebrex_admin_token');
    }).catch(()=>{});
}

document.getElementById('token-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
</script>
</body>
</html>`;
}

// ── API Handlers ──────────────────────────────────────────────────────────────

async function handleList(request: Request, env: Env, params: URLSearchParams): Promise<Response> {
  if (!await checkRateLimit(request, 'search', env)) {
    return err('Rate limit exceeded: max 200 searches per minute per IP', 429);
  }
  const q = params.get('q') || '';
  const author = params.get('author') || '';
  const limit = Math.min(parseInt(params.get('limit') || '50', 10), 100);
  const offset = parseInt(params.get('offset') || '0', 10);

  // Return one row per package name (the latest semver, non-deprecated preferred)
  // We fetch all matching rows and deduplicate in JS for correct semver ordering
  let stmt: D1PreparedStatement;
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (q) {
    conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
    bindings.push(`%${q}%`, `%${q}%`);
  }
  if (author) {
    conditions.push('p.author = ?');
    bindings.push(author);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  stmt = env.DB.prepare(
    `SELECT p.name, p.version, p.description, p.author, p.tags,
            p.tarball_size, p.published_at, p.download_count, p.deprecated, p.featured
     FROM packages p
     ${where}
     ORDER BY p.published_at DESC`
  );
  if (bindings.length) {
    // D1 bind requires positional args
    stmt = (stmt as D1PreparedStatement).bind(...bindings);
  }

  const { results } = await stmt.all();
  const rows = (results || []).map(parsePackageRow);

  // Deduplicate: keep best semver per name
  const byName = new Map<string, ReturnType<typeof parsePackageRow>>();
  for (const row of rows) {
    const existing = byName.get(row.name);
    if (!existing) { byName.set(row.name, row); continue; }
    // Prefer non-deprecated; then higher semver
    if (existing.deprecated && !row.deprecated) { byName.set(row.name, row); continue; }
    if (!existing.deprecated && row.deprecated) continue;
    if (semverGt(row.version, existing.version)) byName.set(row.name, row);
  }

  const packages = Array.from(byName.values())
    .sort((a, b) =>
      (b.featured ? 1 : 0) - (a.featured ? 1 : 0) ||
      b.download_count - a.download_count ||
      (b.published_at > a.published_at ? 1 : -1)
    )
    .slice(offset, offset + limit);

  return json({ success: true, packages, count: packages.length });
}

async function handleAuthRegister(request: Request, env: Env): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);
  if (!env.REGISTRY_ADMIN_TOKEN || !timingSafeEqual(token, env.REGISTRY_ADMIN_TOKEN)) {
    return err('Invalid admin token', 403);
  }

  let body: { owner?: string } = {};
  try { body = await request.json() as { owner?: string }; } catch { /* owner defaults to 'unknown' */ }

  const owner = (typeof body.owner === 'string' && body.owner.trim()) ? body.owner.trim() : 'unknown';
  const newToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const hash = await hashToken(newToken);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await env.DB.prepare(
    'INSERT INTO tokens (token_hash, owner, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(hash, owner, now.toISOString(), expiresAt.toISOString()).run();

  // Create user profile record (admin-created accounts default to 'user' role)
  await env.DB.prepare(
    'INSERT OR IGNORE INTO users (username, role, created_at) VALUES (?, ?, ?)'
  ).bind(owner, 'user', now.toISOString()).run();

  return json({ success: true, token: newToken, owner }, 201);
}

async function handleAuthSignup(request: Request, env: Env): Promise<Response> {
  if (!await checkRateLimit(request, 'signup', env)) {
    return err('Rate limit exceeded: max 3 accounts per IP per hour', 429);
  }

  let body: { username?: string } = {};
  try { body = await request.json() as { username?: string }; } catch { /* handled below */ }

  const username = (typeof body.username === 'string' ? body.username : '').trim().toLowerCase();

  if (!username) return err('username is required');
  if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(username)) {
    return err('username must be 3–30 lowercase alphanumeric characters, hyphens, or underscores');
  }

  // Check username not already taken (generic error to prevent enumeration)
  const existing = await env.DB.prepare(
    'SELECT id FROM tokens WHERE owner = ? LIMIT 1'
  ).bind(username).first();
  if (existing) return err('Username not available', 409);

  const newToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const hash = await hashToken(newToken);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1); // tokens expire in 1 year

  await env.DB.prepare(
    'INSERT INTO tokens (token_hash, owner, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(hash, username, now.toISOString(), expiresAt.toISOString()).run();

  // Create user profile record
  await env.DB.prepare(
    'INSERT OR IGNORE INTO users (username, role, created_at) VALUES (?, ?, ?)'
  ).bind(username, 'user', now.toISOString()).run();

  return json({
    success: true,
    username,
    token: newToken,
    message: 'Save this token — it will not be shown again. Run: cerebrex auth login --token <token>',
  }, 201);
}

async function handlePublish(request: Request, env: Env): Promise<Response> {
  if (!await checkRateLimit(request, 'publish', env)) {
    return err('Rate limit exceeded: max 10 publishes per minute per IP', 429);
  }

  const token = getToken(request);
  if (!token) return err('Authorization required. Set a token with: cerebrex auth login', 401);

  const { valid, owner, hash: tokenHash } = await validateToken(token, env);
  if (!valid) return err('Invalid or revoked token. Run: cerebrex auth login', 401);

  // Per-token rate limit: max 5 publishes per minute per token
  const tokenRlKey = `rl:pub_tok:${tokenHash}:${Math.floor(Date.now() / 60_000)}`;
  const tokenRlCount = parseInt((await env.RATE_LIMITS.get(tokenRlKey)) || '0', 10);
  if (tokenRlCount >= 5) return err('Rate limit exceeded: max 5 publishes per minute per token', 429);
  await env.RATE_LIMITS.put(tokenRlKey, String(tokenRlCount + 1), { expirationTtl: 120 });

  // Parse body — support both multipart/form-data and JSON (backward compat)
  let name: string | undefined;
  let version: string | undefined;
  let description = '';
  let tags: string[] = [];
  let readme = '';
  let tarballBytes: Uint8Array;

  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return err('Invalid multipart body');
    }
    name = (form.get('name') as string | null) ?? undefined;
    version = (form.get('version') as string | null) ?? undefined;
    description = (form.get('description') as string | null) ?? '';
    readme = (form.get('readme') as string | null) ?? '';
    const rawTags = (form.get('tags') as string | null) ?? '[]';
    try { tags = JSON.parse(rawTags) as string[]; } catch { tags = []; }
    const tarballFile = form.get('tarball') as File | null;
    if (!tarballFile) return err('tarball field is required');
    tarballBytes = new Uint8Array(await tarballFile.arrayBuffer());
  } else {
    let body: { name?: string; version?: string; description?: string; tags?: string[]; readme?: string; tarball?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return err('Invalid JSON body');
    }
    name = body.name;
    version = body.version;
    description = body.description ?? '';
    tags = body.tags ?? [];
    readme = body.readme ?? '';
    const tarballB64 = body.tarball;
    if (!tarballB64 || typeof tarballB64 !== 'string') return err('tarball (base64) is required');
    try {
      const binary = atob(tarballB64);
      tarballBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) tarballBytes[i] = binary.charCodeAt(i);
    } catch {
      return err('tarball must be valid base64');
    }
  }

  if (!name || typeof name !== 'string') return err('name is required');
  if (!version || typeof version !== 'string') return err('version is required');

  if (!/^\d+\.\d+\.\d+/.test(version)) return err('version must be semver (e.g. 1.0.0)');
  if (!/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9\-_.]*$/.test(name)) {
    return err('Invalid package name. Use lowercase letters, numbers, hyphens, and dots.');
  }

  if (tarballBytes!.length < 1024) return err('Tarball too small (minimum 1KB).');
  if (tarballBytes!.length > 25 * 1024 * 1024) return err('Tarball exceeds 25MB limit');

  // ── Name ownership: only the original author can publish new versions ────────
  const nameOwnerRow = await env.DB.prepare(
    'SELECT author FROM packages WHERE name = ? LIMIT 1'
  ).bind(name).first<{ author: string }>();
  if (nameOwnerRow && nameOwnerRow.author !== owner) {
    return err(`Package '${name}' is owned by another user`, 403);
  }

  // ── Scope ownership: only the first publisher of @scope/* can use that scope ─
  const scopeMatch = name.match(/^@([a-z0-9-]+)\//);
  if (scopeMatch) {
    const scope = scopeMatch[1];
    const scopeOwnerRow = await env.DB.prepare(
      'SELECT author FROM packages WHERE name LIKE ? LIMIT 1'
    ).bind(`@${scope}/%`).first<{ author: string }>();
    if (scopeOwnerRow && scopeOwnerRow.author !== owner) {
      return err(`Scope '@${scope}' is owned by another user`, 403);
    }
  }

  // ── Duplicate version check ──────────────────────────────────────────────────
  const existing = await env.DB.prepare(
    'SELECT id FROM packages WHERE name = ? AND version = ?'
  ).bind(name, version).first();
  if (existing) return err(`${name}@${version} already published. Bump the version.`, 409);

  const sha256 = await hashBytes(tarballBytes!);
  const tarballKey = `${name}@${version}.tgz`;
  await env.TARBALLS.put(tarballKey, tarballBytes!.buffer as ArrayBuffer);

  const publishedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO packages (name, version, description, author, tags, tarball_key, tarball_size, sha256, published_at, readme)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    name, version, description, owner,
    JSON.stringify(tags), tarballKey,
    tarballBytes!.length, sha256, publishedAt, readme
  ).run();

  return json({
    success: true,
    package: { name, version, description, tags, tarball_size: tarballBytes!.length, sha256, published_at: publishedAt },
    url: `https://registry.therealcool.site/v1/packages/${encodeURIComponent(name)}/${version}`,
  }, 201);
}

async function handleGetPackage(env: Env, name: string): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT name, version, description, author, tags, tarball_size, sha256, published_at,
            download_count, deprecated, readme
     FROM packages WHERE name = ? ORDER BY published_at DESC`
  ).bind(name).all();

  if (!results?.length) return err(`Package '${name}' not found`, 404);
  return json({ success: true, name, versions: results.map(parsePackageRow) });
}

async function handleGetVersion(env: Env, name: string, version: string): Promise<Response> {
  const resolvedVersion = version === 'latest'
    ? await resolveLatestVersion(env, name)
    : version;

  if (!resolvedVersion) return err(`Package '${name}' not found`, 404);

  const row = await env.DB.prepare(
    `SELECT name, version, description, author, tags, tarball_size, sha256, published_at,
            download_count, deprecated, readme
     FROM packages WHERE name = ? AND version = ?`
  ).bind(name, resolvedVersion).first();

  if (!row) return err(`${name}@${resolvedVersion} not found`, 404);

  const pkg = parsePackageRow(row);
  return json({
    success: true,
    ...pkg,
    download_url: `https://registry.therealcool.site/v1/packages/${encodeURIComponent(name)}/${resolvedVersion}/download`,
  });
}

async function handleDownload(env: Env, request: Request, name: string, version: string): Promise<Response> {
  if (!await checkRateLimit(request, 'download', env)) {
    return err('Rate limit exceeded: max 300 downloads per minute per IP', 429);
  }

  const resolvedVersion = version === 'latest'
    ? await resolveLatestVersion(env, name)
    : version;

  if (!resolvedVersion) return err(`Package '${name}' not found`, 404);

  const row = await env.DB.prepare(
    'SELECT tarball_key, sha256 FROM packages WHERE name = ? AND version = ?'
  ).bind(name, resolvedVersion).first<{ tarball_key: string; sha256: string }>();

  if (!row) return err(`${name}@${resolvedVersion} not found`, 404);

  const tarball = await env.TARBALLS.get(row.tarball_key, 'arrayBuffer');
  if (!tarball) return err('Tarball not found in storage', 404);

  // Increment download count (fire-and-forget — don't block the response)
  env.DB.prepare(
    'UPDATE packages SET download_count = download_count + 1 WHERE name = ? AND version = ?'
  ).bind(name, resolvedVersion).run().catch(() => { /* non-critical */ });

  return new Response(tarball, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${row.tarball_key}"`,
      ...(row.sha256 ? { 'X-Tarball-SHA256': row.sha256 } : {}),
      ...corsHeaders(),
    },
  });
}

async function handleUnpublish(request: Request, env: Env, name: string, version: string): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);

  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or revoked token', 401);

  const row = await env.DB.prepare(
    'SELECT tarball_key, author FROM packages WHERE name = ? AND version = ?'
  ).bind(name, version).first<{ tarball_key: string; author: string }>();

  if (!row) return err(`${name}@${version} not found`, 404);

  // Only the package owner (or admin) can unpublish
  const admin = await isAdmin(owner, token, env);
  if (!admin && row.author !== owner) {
    return err(`You do not own '${name}'`, 403);
  }

  await env.TARBALLS.delete(row.tarball_key);
  await env.DB.prepare('DELETE FROM packages WHERE name = ? AND version = ?').bind(name, version).run();

  return json({ success: true, message: `${name}@${version} unpublished` });
}

async function handleRevokeToken(request: Request, env: Env): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);

  const { valid, hash } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);

  await env.DB.prepare('DELETE FROM tokens WHERE token_hash = ?').bind(hash).run();
  return json({ success: true, message: 'Token revoked. Run: cerebrex auth logout' });
}

async function handleCreateToken(request: Request, env: Env): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);

  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);

  let body: { name?: string; scopes?: string[] } = {};
  try { body = await request.json() as typeof body; } catch { /**/ }

  const name = (typeof body.name === 'string' && body.name.trim()) ? body.name.trim().slice(0, 64) : 'unnamed';
  const allowedScopes = ['publish', 'install', 'admin'];
  const scopes = Array.isArray(body.scopes)
    ? body.scopes.filter((s: unknown) => typeof s === 'string' && allowedScopes.includes(s))
    : ['install'];

  // Non-admins cannot create admin-scoped tokens
  const userRow = await env.DB.prepare('SELECT role FROM users WHERE username = ?').bind(owner).first<{ role: string }>();
  const isAdminUser = userRow?.role === 'admin';
  const finalScopes = isAdminUser ? scopes : scopes.filter(s => s !== 'admin');

  const rawToken = 'cbrx_' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2,'0')).join('');
  const hash = await hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await env.DB.prepare(
    'INSERT INTO tokens (token_hash, owner, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(hash, owner, now.toISOString(), expiresAt.toISOString()).run();

  return json({ success: true, token: rawToken, name, scopes: finalScopes, owner }, 201);
}

async function handleDeprecate(request: Request, env: Env, name: string, version: string): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);

  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or revoked token', 401);

  const row = await env.DB.prepare(
    'SELECT author FROM packages WHERE name = ? AND version = ?'
  ).bind(name, version).first<{ author: string }>();

  if (!row) return err(`${name}@${version} not found`, 404);

  const admin = await isAdmin(owner, token, env);
  if (!admin && row.author !== owner) {
    return err(`You do not own '${name}'`, 403);
  }

  let body: { deprecated?: boolean } = { deprecated: true };
  try { body = await request.json() as typeof body; } catch { /* default to deprecating */ }
  const deprecated = body.deprecated !== false ? 1 : 0;

  await env.DB.prepare(
    'UPDATE packages SET deprecated = ? WHERE name = ? AND version = ?'
  ).bind(deprecated, name, version).run();

  return json({
    success: true,
    message: deprecated ? `${name}@${version} marked as deprecated` : `${name}@${version} deprecation removed`,
  });
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function parsePackageRow(row: Record<string, unknown>) {
  return {
    name: row.name as string,
    version: row.version as string,
    description: row.description as string,
    author: row.author as string,
    tags: JSON.parse((row.tags as string) || '[]') as string[],
    tarball_size: row.tarball_size as number,
    sha256: (row.sha256 as string) || '',
    published_at: row.published_at as string,
    download_count: (row.download_count as number) || 0,
    deprecated: !!(row.deprecated as number),
    readme: (row.readme as string) || '',
    featured: !!(row.featured as number),
  };
}

async function isAdmin(owner: string, token: string, env: Env): Promise<boolean> {
  if (env.REGISTRY_ADMIN_TOKEN && timingSafeEqual(token, env.REGISTRY_ADMIN_TOKEN)) return true;
  const user = await env.DB.prepare(
    'SELECT role FROM users WHERE username = ?'
  ).bind(owner).first<{ role: string }>();
  return user?.role === 'admin';
}

async function ensureUserExists(username: string, env: Env): Promise<void> {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO users (username, role, created_at) VALUES (?, ?, ?)'
  ).bind(username, 'user', new Date().toISOString()).run();
}

// ── User handlers ──────────────────────────────────────────────────────────────

async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);

  await ensureUserExists(owner, env);

  const user = await env.DB.prepare(
    'SELECT username, bio, website, avatar_url, role, created_at FROM users WHERE username = ?'
  ).bind(owner).first<{ username: string; bio: string; website: string; avatar_url: string; role: string; created_at: string }>();

  const { results: packages } = await env.DB.prepare(
    `SELECT name, version, description, download_count, deprecated, published_at
     FROM packages WHERE author = ? ORDER BY published_at DESC LIMIT 50`
  ).bind(owner).all();

  const tokenRow = await env.DB.prepare(
    'SELECT expires_at FROM tokens WHERE owner = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(owner).first<{ expires_at: string | null }>();

  return json({
    success: true,
    username: owner,
    bio: user?.bio || '',
    website: user?.website || '',
    avatar_url: user?.avatar_url || '',
    role: user?.role || 'user',
    member_since: user?.created_at || '',
    token_expires_at: tokenRow?.expires_at || null,
    packages: packages || [],
  });
}

async function handleUpdateMe(request: Request, env: Env): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or expired token', 401);

  let body: { bio?: string; website?: string; avatar_url?: string } = {};
  try { body = await request.json() as typeof body; } catch { return err('Invalid JSON'); }

  const bio = typeof body.bio === 'string' ? body.bio.slice(0, 200) : undefined;
  const website = typeof body.website === 'string' ? body.website.slice(0, 200) : undefined;
  const avatar_url = typeof body.avatar_url === 'string' ? body.avatar_url.slice(0, 500) : undefined;

  await ensureUserExists(owner, env);

  if (bio !== undefined) await env.DB.prepare('UPDATE users SET bio = ? WHERE username = ?').bind(bio, owner).run();
  if (website !== undefined) await env.DB.prepare('UPDATE users SET website = ? WHERE username = ?').bind(website, owner).run();
  if (avatar_url !== undefined) await env.DB.prepare('UPDATE users SET avatar_url = ? WHERE username = ?').bind(avatar_url, owner).run();

  return json({ success: true, message: 'Profile updated' });
}

async function handleGetUser(env: Env, username: string): Promise<Response> {
  const user = await env.DB.prepare(
    'SELECT username, bio, website, avatar_url, role, created_at FROM users WHERE username = ?'
  ).bind(username).first<{ username: string; bio: string; website: string; avatar_url: string; role: string; created_at: string }>();

  if (!user) return err(`User '${username}' not found`, 404);

  const { results: packages } = await env.DB.prepare(
    `SELECT name, version, description, download_count, published_at
     FROM packages WHERE author = ?
     ORDER BY download_count DESC, published_at DESC LIMIT 20`
  ).bind(username).all();

  return json({
    success: true,
    username: user.username,
    bio: user.bio || '',
    website: user.website || '',
    avatar_url: user.avatar_url || '',
    role: user.role,
    member_since: user.created_at,
    packages: packages || [],
  });
}

// ── Admin handlers ─────────────────────────────────────────────────────────────

async function handleAdminListUsers(request: Request, env: Env): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid token', 401);
  if (!await isAdmin(owner, token, env)) return err('Admin access required', 403);

  const { results: users } = await env.DB.prepare(
    'SELECT username, bio, role, created_at FROM users ORDER BY created_at DESC'
  ).all<{ username: string; bio: string; role: string; created_at: string }>();

  const { results: pkgCounts } = await env.DB.prepare(
    'SELECT author, COUNT(*) as count FROM packages GROUP BY author'
  ).all<{ author: string; count: number }>();

  const countMap = new Map((pkgCounts || []).map(r => [r.author, r.count]));

  return adminJson({
    success: true,
    users: (users || []).map(u => ({ ...u, package_count: countMap.get(u.username) || 0 })),
    count: users?.length || 0,
  }, 200, request);
}

async function handleAdminUpdateUser(request: Request, env: Env, username: string): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid token', 401);
  if (!await isAdmin(owner, token, env)) return err('Admin access required', 403);
  if (username === owner) return err('Cannot modify your own account this way', 400);

  let body: { role?: string } = {};
  try { body = await request.json() as typeof body; } catch { return err('Invalid JSON'); }

  if (body.role && ['admin', 'user', 'banned'].includes(body.role)) {
    await env.DB.prepare('UPDATE users SET role = ? WHERE username = ?').bind(body.role, username).run();
    // If banning, also delete their tokens
    if (body.role === 'banned') {
      await env.DB.prepare('DELETE FROM tokens WHERE owner = ?').bind(username).run();
    }
  }

  return adminJson({ success: true, message: `User '${username}' updated` }, 200, request);
}

async function handleAdminFeaturePackage(request: Request, env: Env, name: string): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);
  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid token', 401);
  if (!await isAdmin(owner, token, env)) return err('Admin access required', 403);

  let body: { featured?: boolean } = { featured: true };
  try { body = await request.json() as typeof body; } catch { /* default featured=true */ }
  const featured = body.featured !== false ? 1 : 0;

  await env.DB.prepare('UPDATE packages SET featured = ? WHERE name = ?').bind(featured, name).run();
  return adminJson({
    success: true,
    message: featured ? `'${name}' is now featured` : `'${name}' unfeatured`,
  }, 200, request);
}
