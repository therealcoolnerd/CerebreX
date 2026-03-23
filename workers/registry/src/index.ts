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

// ── CORS helpers ──────────────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...extra },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
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
  publish:  { windowMs: 60_000,       max: 10  },
  search:   { windowMs: 60_000,       max: 200 },
  signup:   { windowMs: 3_600_000,    max: 3   },  // 3 new accounts per IP per hour
  download: { windowMs: 60_000,       max: 300 },
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
      return html(registryUI());
    }

    if (method === 'GET' && (pathname === '/ui/trace' || pathname === '/ui/trace/')) {
      return html(traceUI());
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

// ── Web UI — Registry Browser ─────────────────────────────────────────────────

function registryUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>CerebreX Registry</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#0d0d0f;--surface:#16161a;--border:#2a2a30;
      --text:#e8e8f0;--muted:#6b6b80;
      --cyan:#00c8e0;--green:#22d3a0;--yellow:#f5a623;--red:#f56060;--purple:#a560f5;
    }
    body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
    header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 32px;display:flex;align-items:center;gap:16px}
    .logo{font-size:20px;font-weight:700;color:var(--cyan);letter-spacing:-0.5px}
    .logo span{color:var(--muted);font-weight:400;font-size:14px}
    .header-links{margin-left:auto;display:flex;gap:16px;align-items:center}
    .header-links a{color:var(--muted);text-decoration:none;font-size:13px;transition:color .1s}
    .header-links a:hover{color:var(--text)}
    .hero{padding:48px 32px 32px;text-align:center}
    .hero h1{font-size:28px;font-weight:700;margin-bottom:8px}
    .hero p{color:var(--muted);font-size:15px;margin-bottom:28px}
    .search-wrap{max-width:560px;margin:0 auto;position:relative}
    .search-wrap input{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 16px 12px 44px;font-size:15px;color:var(--text);outline:none;transition:border-color .15s}
    .search-wrap input:focus{border-color:var(--cyan)}
    .search-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:18px;pointer-events:none}
    .content{max-width:1100px;margin:0 auto;padding:24px 32px}
    .stats-row{display:flex;gap:8px;align-items:center;margin-bottom:20px;font-size:13px;color:var(--muted)}
    .stats-row strong{color:var(--text)}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
    .card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px 20px;cursor:pointer;transition:border-color .1s,transform .1s;position:relative}
    .card:hover{border-color:var(--cyan);transform:translateY(-1px)}
    .card.featured{border-color:var(--yellow)}
    .card-name{font-size:15px;font-weight:600;color:var(--cyan);margin-bottom:4px}
    .card-desc{font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.5;min-height:38px}
    .featured-badge{position:absolute;top:10px;right:12px;background:rgba(245,166,35,.15);color:var(--yellow);border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;letter-spacing:.5px}
    .card-footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .tag{background:rgba(0,200,224,.1);color:var(--cyan);border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600}
    .version-badge{color:var(--muted);font-size:11px;margin-left:auto}
    .empty{text-align:center;padding:64px 32px;color:var(--muted);font-size:15px}
    .loading{text-align:center;padding:64px;color:var(--muted)}
    /* Modal */
    .overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;align-items:center;justify-content:center;padding:24px}
    .overlay.show{display:flex}
    .modal{background:var(--surface);border:1px solid var(--border);border-radius:12px;width:100%;max-width:600px;max-height:85vh;overflow-y:auto}
    .modal-header{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
    .modal-title{font-size:18px;font-weight:700;color:var(--cyan)}
    .modal-close{margin-left:auto;background:none;border:none;color:var(--muted);font-size:22px;cursor:pointer;line-height:1}
    .modal-close:hover{color:var(--text)}
    .modal-body{padding:24px}
    .modal-desc{color:var(--muted);font-size:14px;line-height:1.6;margin-bottom:20px}
    .section-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:8px}
    .install-box{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-family:monospace;font-size:13px;display:flex;align-items:center;gap:10px;margin-bottom:20px}
    .install-cmd{flex:1;word-break:break-all}
    .copy-btn{background:var(--border);border:none;color:var(--text);border-radius:5px;padding:4px 10px;font-size:12px;cursor:pointer;white-space:nowrap;transition:background .1s}
    .copy-btn:hover{background:var(--cyan);color:var(--bg)}
    .versions-list{display:flex;flex-direction:column;gap:6px}
    .version-row{display:flex;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:13px}
    .version-row .v{color:var(--cyan);font-weight:600;margin-right:auto}
    .version-row .date{color:var(--muted);font-size:11px}
    .tags-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
    ::-webkit-scrollbar{width:6px;height:6px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
    @media(max-width:600px){.content{padding:16px}.hero{padding:32px 16px 20px}.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
<header>
  <div class="logo">CerebreX <span>Registry</span></div>
  <div class="header-links">
    <a href="/ui/trace">Trace Explorer</a>
    <a href="https://github.com/arealcoolco/CerebreX" target="_blank">GitHub</a>
    <a href="https://www.npmjs.com/package/cerebrex" target="_blank">npm</a>
    <a href="/account" id="acct-link" style="color:var(--cyan);font-weight:600">My Account</a>
  </div>
</header>
<div class="hero">
  <h1>MCP Server Registry</h1>
  <p>Discover and install community MCP servers for your AI agents</p>
  <div class="search-wrap">
    <span class="search-icon">🔍</span>
    <input type="text" id="search" placeholder="Search packages..." autocomplete="off"/>
  </div>
</div>
<div class="content">
  <div class="stats-row" id="stats">Loading...</div>
  <div class="grid" id="grid"><div class="loading">Loading packages...</div></div>
</div>

<!-- Package detail modal -->
<div class="overlay" id="overlay" onclick="closeModal(event)">
  <div class="modal" id="modal">
    <div class="modal-header">
      <div class="modal-title" id="modal-name"></div>
      <button class="modal-close" onclick="document.getElementById('overlay').classList.remove('show')">×</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
</div>

<script>
let allPackages = [];
let searchTimer = null;

async function load(q = '') {
  const url = '/v1/packages?limit=100' + (q ? '&q=' + encodeURIComponent(q) : '');
  try {
    const r = await fetch(url);
    const d = await r.json();
    allPackages = d.packages || [];
    render(allPackages, q);
    document.getElementById('stats').innerHTML =
      '<strong>' + (d.count || 0) + '</strong>&nbsp;packages' + (q ? ' matching <strong>"' + esc(q) + '"</strong>' : '');
  } catch(e) {
    document.getElementById('grid').innerHTML = '<div class="empty">Failed to load packages. Check the registry is running.</div>';
  }
}

function render(pkgs) {
  const grid = document.getElementById('grid');
  if (!pkgs.length) { grid.innerHTML = '<div class="empty">No packages found.</div>'; return; }
  grid.innerHTML = pkgs.map((p, i) =>
    '<div class="card' + (p.featured ? ' featured' : '') + '" onclick="showDetail(' + i + ')">' +
      (p.featured ? '<span class="featured-badge">★ Official</span>' : '') +
      '<div class="card-name">' + esc(p.name) + '</div>' +
      '<div class="card-desc">' + esc(p.description || 'No description') + '</div>' +
      '<div class="card-footer">' +
        (p.tags||[]).slice(0,3).map(t => '<span class="tag">' + esc(t) + '</span>').join('') +
        '<span class="version-badge">v' + esc(p.version) + '</span>' +
      '</div>' +
    '</div>'
  ).join('');
}

function showDetail(i) {
  const p = allPackages[i];
  document.getElementById('modal-name').textContent = p.name;
  const tags = (p.tags||[]).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
  document.getElementById('modal-body').innerHTML =
    '<div class="modal-desc">' + esc(p.description || 'No description provided.') + '</div>' +
    (tags ? '<div class="section-label">Tags</div><div class="tags-row">' + tags + '</div>' : '') +
    '<div class="section-label">Install</div>' +
    '<div class="install-box">' +
      '<span class="install-cmd">cerebrex install ' + esc(p.name) + '</span>' +
      '<button class="copy-btn" onclick="copyInstall(\''+esc(p.name)+'\',this)">Copy</button>' +
    '</div>' +
    '<div class="section-label">Latest Version</div>' +
    '<div class="versions-list">' +
      '<div class="version-row"><span class="v">v' + esc(p.version) + '</span><span class="date">' + fmtDate(p.published_at) + '</span></div>' +
    '</div>' +
    '<div style="margin-top:16px;font-size:12px;color:var(--muted)">Published by <a href="/u/'+esc(p.author||'')+'" style="color:var(--cyan);text-decoration:none">'+esc(p.author||'unknown')+'</a> · ' + fmtSize(p.tarball_size) + (p.deprecated ? ' · <span style="color:var(--red)">⚠ Deprecated</span>' : '') + '</div>';
  document.getElementById('overlay').classList.add('show');
}

function closeModal(e) { if (e.target === document.getElementById('overlay')) document.getElementById('overlay').classList.remove('show'); }

function copyInstall(name, btn) {
  navigator.clipboard.writeText('cerebrex install ' + name).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(); } catch { return iso||''; } }
function fmtSize(b) { if(!b) return ''; return b < 1024 ? b+'B' : b < 1048576 ? (b/1024).toFixed(1)+'KB' : (b/1048576).toFixed(1)+'MB'; }

document.getElementById('search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => load(e.target.value.trim()), 300);
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('overlay').classList.remove('show'); });

load();
</script>
</body>
</html>`;
}

// ── Web UI — Trace Explorer ───────────────────────────────────────────────────

function traceUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>CerebreX — Trace Explorer</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#0d0d0f;--surface:#16161a;--border:#2a2a30;
      --text:#e8e8f0;--muted:#6b6b80;
      --cyan:#00c8e0;--green:#22d3a0;--yellow:#f5a623;--red:#f56060;--purple:#a560f5;
    }
    body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column}
    header{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;align-items:center;gap:16px}
    .logo{font-size:18px;font-weight:700;color:var(--cyan);letter-spacing:-0.5px}
    .logo span{color:var(--muted);font-weight:400}
    .header-right{margin-left:auto;display:flex;align-items:center;gap:12px}
    .header-right a{color:var(--muted);text-decoration:none;font-size:13px}
    .header-right a:hover{color:var(--text)}
    .app{display:flex;flex:1;overflow:hidden;height:calc(100vh - 53px)}
    .sidebar{width:280px;min-width:220px;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
    .sidebar-header{padding:12px 16px;border-bottom:1px solid var(--border);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--muted);display:flex;justify-content:space-between;align-items:center}
    .session-list{flex:1;overflow-y:auto;padding:8px}
    .session-item{padding:10px 12px;border-radius:6px;cursor:pointer;border:1px solid transparent;margin-bottom:2px;transition:background .1s}
    .session-item:hover{background:rgba(255,255,255,.05)}
    .session-item.active{background:rgba(0,200,224,.08);border-color:var(--cyan)}
    .session-name{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .session-meta{font-size:11px;color:var(--muted);margin-top:3px}
    .main{flex:1;display:flex;flex-direction:column;overflow:hidden}
    .drop-zone{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;border:2px dashed var(--border);margin:32px;border-radius:16px;cursor:pointer;transition:border-color .15s}
    .drop-zone:hover,.drop-zone.drag{border-color:var(--cyan)}
    .drop-zone .icon{font-size:48px}
    .drop-zone h2{font-size:18px;font-weight:600}
    .drop-zone p{color:var(--muted);font-size:14px;text-align:center}
    .btn{padding:8px 18px;border-radius:6px;font-size:13px;font-weight:500;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;transition:background .1s;font-family:inherit}
    .btn:hover{background:rgba(255,255,255,.06)}
    .btn-primary{background:var(--cyan);color:var(--bg);border-color:var(--cyan)}
    .btn-primary:hover{background:#00b0c8}
    .trace-header{padding:16px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;flex-wrap:wrap}
    .trace-title{font-size:16px;font-weight:600}
    .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:100px;font-size:11px;font-weight:600}
    .badge-green{background:rgba(34,211,160,.15);color:var(--green)}
    .badge-yellow{background:rgba(245,166,35,.15);color:var(--yellow)}
    .stats-row{display:flex;gap:24px;margin-left:auto}
    .stat{text-align:right}
    .stat-value{font-size:15px;font-weight:600;color:var(--cyan)}
    .stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
    .timeline{flex:1;overflow-y:auto;padding:16px 24px}
    .step{display:flex;gap:16px;margin-bottom:8px;position:relative}
    .step::before{content:'';position:absolute;left:19px;top:36px;bottom:-8px;width:2px;background:var(--border)}
    .step:last-child::before{display:none}
    .step-icon{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;border:2px solid transparent}
    .step-body{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;cursor:pointer;transition:border-color .1s}
    .step-body:hover{border-color:var(--muted)}
    .step-body.expanded{border-color:var(--cyan)}
    .step-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .step-type{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:2px 6px;border-radius:4px}
    .step-name{font-size:13px;font-weight:500}
    .step-meta{margin-left:auto;display:flex;gap:12px;align-items:center}
    .step-meta span{font-size:11px;color:var(--muted)}
    .step-details{display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
    .step-details.show{display:block}
    .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .detail-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:6px}
    .detail-value{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto}
    .type-tool_call{background:rgba(0,200,224,.12);color:var(--cyan)}
    .icon-tool_call{background:rgba(0,200,224,.12);border-color:var(--cyan)}
    .type-llm_call{background:rgba(160,96,245,.12);color:var(--purple)}
    .icon-llm_call{background:rgba(160,96,245,.12);border-color:var(--purple)}
    .type-memory_read,.type-memory_write{background:rgba(34,211,160,.12);color:var(--green)}
    .icon-memory_read,.icon-memory_write{background:rgba(34,211,160,.12);border-color:var(--green)}
    .type-error{background:rgba(245,96,96,.12);color:var(--red)}
    .icon-error{background:rgba(245,96,96,.12);border-color:var(--red)}
    .type-custom{background:rgba(245,166,35,.12);color:var(--yellow)}
    .icon-custom{background:rgba(245,166,35,.12);border-color:var(--yellow)}
    ::-webkit-scrollbar{width:6px;height:6px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
  </style>
</head>
<body>
<header>
  <div class="logo">CerebreX <span>Trace Explorer</span></div>
  <div class="header-right">
    <a href="/ui">Registry</a>
    <label class="btn" for="file-input" style="cursor:pointer">Load Trace</label>
    <input type="file" id="file-input" accept=".json" multiple style="display:none"/>
  </div>
</header>
<div class="app">
  <div class="sidebar">
    <div class="sidebar-header">
      <span>Sessions</span>
      <span id="session-count" style="color:var(--cyan)">0</span>
    </div>
    <div class="session-list" id="session-list"></div>
  </div>
  <div class="main" id="main-area">
    <div class="drop-zone" id="drop-zone">
      <div class="icon">🔍</div>
      <h2>Drop a trace file here</h2>
      <p>or click to browse for a JSON trace file<br>exported with <code style="color:var(--cyan)">cerebrex trace view --session &lt;id&gt;</code></p>
      <label class="btn btn-primary" for="file-input">Browse Files</label>
    </div>
    <div id="trace-view" style="display:none;flex-direction:column;flex:1;overflow:hidden">
      <div class="trace-header" id="trace-header"></div>
      <div class="timeline" id="timeline"></div>
    </div>
  </div>
</div>
<script>
const sessions = new Map();
let activeSession = null;
const ICONS = {tool_call:'🔧',llm_call:'🤖',memory_read:'📖',memory_write:'💾',error:'❌',custom:'⚡'};
const getIcon = t => ICONS[t]||ICONS.custom;
const fmtMs = ms => !ms?'–':ms<1000?ms+'ms':(ms/1000).toFixed(1)+'s';
const fmtTok = t => !t?'':t<1000?t+' tok':(t/1000).toFixed(1)+'k tok';

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

function loadTrace(data, name) {
  const s = typeof data==='string'?JSON.parse(data):data;
  const id = s.session||name||'trace-'+Date.now();
  sessions.set(id, s);
  renderSidebar();
  selectSession(id);
}

function renderSidebar() {
  document.getElementById('session-count').textContent = sessions.size;
  const list = document.getElementById('session-list');
  list.innerHTML='';
  for(const [id,s] of sessions){
    const steps=s.steps||[];
    const ms=steps.reduce((a,b)=>a+(b.latencyMs||0),0);
    const el=document.createElement('div');
    el.className='session-item'+(activeSession===id?' active':'');
    el.innerHTML='<div class="session-name">'+esc(s.session||id)+'</div><div class="session-meta">'+steps.length+' steps · '+fmtMs(ms)+'</div>';
    el.addEventListener('click',()=>selectSession(id));
    list.appendChild(el);
  }
}

function selectSession(id){activeSession=id;renderSidebar();renderTrace(id);}

function renderTrace(id) {
  const s=sessions.get(id);
  const steps=s.steps||[];
  document.getElementById('drop-zone').style.display='none';
  const tv=document.getElementById('trace-view');
  tv.style.display='flex';
  const ms=steps.reduce((a,b)=>a+(b.latencyMs||0),0);
  const tok=steps.reduce((a,b)=>a+(b.tokens||0),0);
  const errs=steps.filter(x=>x.type==='error').length;
  document.getElementById('trace-header').innerHTML=
    '<div class="trace-title">'+esc(s.session||id)+'</div>'+
    (errs?'<span class="badge badge-yellow">'+errs+' error'+(errs>1?'s':'')+'</span>':'<span class="badge badge-green">Clean</span>')+
    '<div class="stats-row">'+
    '<div class="stat"><div class="stat-value">'+steps.length+'</div><div class="stat-label">Steps</div></div>'+
    '<div class="stat"><div class="stat-value">'+fmtMs(ms)+'</div><div class="stat-label">Time</div></div>'+
    (tok?'<div class="stat"><div class="stat-value">'+fmtTok(tok)+'</div><div class="stat-label">Tokens</div></div>':'')+
    '</div>';
  const tl=document.getElementById('timeline');
  tl.innerHTML='';
  if(!steps.length){tl.innerHTML='<div style="color:var(--muted);padding:32px;text-align:center">No steps recorded</div>';return;}
  steps.forEach((step,i)=>{
    const type=step.type||'custom',name=esc(step.toolName||step.name||type);
    const el=document.createElement('div');
    el.className='step';
    const hasDetails=!!(step.inputs||step.outputs||step.error);
    el.innerHTML=
      '<div class="step-icon icon-'+type+'">'+getIcon(type)+'</div>'+
      '<div class="step-body" id="sb'+i+'">'+
        '<div class="step-top">'+
          '<span class="step-type type-'+type+'">'+type.replace('_',' ')+'</span>'+
          '<span class="step-name">'+name+'</span>'+
          '<div class="step-meta">'+
            (step.latencyMs?'<span>⏱ '+fmtMs(step.latencyMs)+'</span>':'')+
            (step.tokens?'<span>'+fmtTok(step.tokens)+'</span>':'')+
          '</div>'+
        '</div>'+
        (hasDetails?
          '<div class="step-details" id="sd'+i+'">'+
            '<div class="detail-grid">'+
              (step.inputs?'<div><div class="detail-label">Inputs</div><div class="detail-value">'+esc(JSON.stringify(step.inputs,null,2))+'</div></div>':'')+
              (step.outputs?'<div><div class="detail-label">Outputs</div><div class="detail-value">'+esc(JSON.stringify(step.outputs,null,2))+'</div></div>':'')+
              (step.error?'<div style="grid-column:span 2"><div class="detail-label" style="color:var(--red)">Error</div><div class="detail-value" style="color:var(--red)">'+esc(step.error)+'</div></div>':'')+
            '</div>'+
          '</div>'
        :'')+
      '</div>';
    if(hasDetails){
      el.querySelector('#sb'+i).addEventListener('click',()=>{
        el.querySelector('#sd'+i).classList.toggle('show');
        el.querySelector('#sb'+i).classList.toggle('expanded');
      });
    }
    tl.appendChild(el);
  });
}

// File input
document.getElementById('file-input').addEventListener('change',e=>{
  for(const f of e.target.files){
    const r=new FileReader();
    r.onload=ev=>{try{loadTrace(ev.target.result,f.name.replace('.json',''));}catch(e2){alert('Could not parse '+f.name+': '+e2.message);}};
    r.readAsText(f);
  }
});

// Drag and drop
const dz=document.getElementById('drop-zone');
document.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag');});
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)dz.classList.remove('drag');});
document.addEventListener('drop',e=>{
  e.preventDefault();dz.classList.remove('drag');
  for(const f of e.dataTransfer.files){
    if(!f.name.endsWith('.json'))continue;
    const r=new FileReader();
    r.onload=ev=>{try{loadTrace(ev.target.result,f.name.replace('.json',''));}catch(e2){alert('Could not parse '+f.name);}};
    r.readAsText(f);
  }
});
</script>
</body>
</html>`;
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
  if (!env.REGISTRY_ADMIN_TOKEN || token !== env.REGISTRY_ADMIN_TOKEN) {
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
  if (env.REGISTRY_ADMIN_TOKEN && token === env.REGISTRY_ADMIN_TOKEN) return true;
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

  return json({
    success: true,
    users: (users || []).map(u => ({ ...u, package_count: countMap.get(u.username) || 0 })),
    count: users?.length || 0,
  });
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

  return json({ success: true, message: `User '${username}' updated` });
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
  return json({ success: true, message: featured ? `'${name}' is now featured` : `'${name}' unfeatured` });
}
