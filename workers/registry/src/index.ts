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

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMITS_CONFIG = {
  publish: { windowMs: 60_000, max: 10 },
  search:  { windowMs: 60_000, max: 200 },
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

async function validateToken(token: string, env: Env): Promise<{ valid: boolean; owner: string }> {
  const hash = await hashToken(token);
  const row = await env.DB.prepare(
    'SELECT owner FROM tokens WHERE token_hash = ?'
  ).bind(hash).first<{ owner: string }>();
  if (!row) return { valid: false, owner: '' };
  await env.DB.prepare(
    'UPDATE tokens SET last_used_at = ? WHERE token_hash = ?'
  ).bind(new Date().toISOString(), hash).run();
  return { valid: true, owner: row.owner };
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

    // POST /v1/auth/register     — create a publish token (admin only)
    if (pathname === '/v1/auth/register' && method === 'POST') {
      return handleAuthRegister(request, env);
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
      return handleDownload(env, decodeURIComponent(name), decodeURIComponent(version));
    }

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
    .card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px 20px;cursor:pointer;transition:border-color .1s,transform .1s}
    .card:hover{border-color:var(--cyan);transform:translateY(-1px)}
    .card-name{font-size:15px;font-weight:600;color:var(--cyan);margin-bottom:4px}
    .card-desc{font-size:13px;color:var(--muted);margin-bottom:12px;line-height:1.5;min-height:38px}
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
    <a href="https://github.com/therealcoolnerd/CerebreX" target="_blank">GitHub</a>
    <a href="https://www.npmjs.com/package/cerebrex" target="_blank">npm</a>
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
    '<div class="card" onclick="showDetail(' + i + ')">' +
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
    '<div style="margin-top:16px;font-size:12px;color:var(--muted)">Published by ' + esc(p.author||'unknown') + ' · ' + fmtSize(p.tarball_size) + '</div>';
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

// ── API Handlers ──────────────────────────────────────────────────────────────

async function handleList(request: Request, env: Env, params: URLSearchParams): Promise<Response> {
  if (!await checkRateLimit(request, 'search', env)) {
    return err('Rate limit exceeded: max 200 searches per minute per IP', 429);
  }
  const q = params.get('q') || '';
  const limit = Math.min(parseInt(params.get('limit') || '50', 10), 100);
  const offset = parseInt(params.get('offset') || '0', 10);

  let stmt: D1PreparedStatement;
  if (q) {
    stmt = env.DB.prepare(
      `SELECT name, version, description, author, tags, tarball_size, published_at
       FROM packages
       WHERE name LIKE ? OR description LIKE ?
       ORDER BY published_at DESC LIMIT ? OFFSET ?`
    ).bind(`%${q}%`, `%${q}%`, limit, offset);
  } else {
    stmt = env.DB.prepare(
      `SELECT name, version, description, author, tags, tarball_size, published_at
       FROM packages
       ORDER BY published_at DESC LIMIT ? OFFSET ?`
    ).bind(limit, offset);
  }

  const { results } = await stmt.all();
  const packages = (results || []).map(parsePackageRow);
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

  await env.DB.prepare(
    'INSERT INTO tokens (token_hash, owner, created_at) VALUES (?, ?, ?)'
  ).bind(hash, owner, new Date().toISOString()).run();

  return json({ success: true, token: newToken, owner }, 201);
}

async function handlePublish(request: Request, env: Env): Promise<Response> {
  if (!await checkRateLimit(request, 'publish', env)) {
    return err('Rate limit exceeded: max 10 publishes per minute per IP', 429);
  }

  const token = getToken(request);
  if (!token) return err('Authorization required. Set a token with: cerebrex auth login', 401);

  const { valid, owner } = await validateToken(token, env);
  if (!valid) return err('Invalid or revoked token. Run: cerebrex auth login', 401);

  let body: {
    name?: string;
    version?: string;
    description?: string;
    tags?: string[];
    tarball?: string;
  };

  try {
    body = await request.json() as typeof body;
  } catch {
    return err('Invalid JSON body');
  }

  const { name, version, description = '', tags = [], tarball } = body;

  if (!name || typeof name !== 'string') return err('name is required');
  if (!version || typeof version !== 'string') return err('version is required');
  if (!tarball || typeof tarball !== 'string') return err('tarball (base64) is required');

  if (!/^\d+\.\d+\.\d+/.test(version)) return err('version must be semver (e.g. 1.0.0)');

  if (!/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9\-_.]*$/.test(name)) {
    return err('Invalid package name. Use lowercase letters, numbers, hyphens, and dots.');
  }

  let tarballBytes: Uint8Array;
  try {
    const binary = atob(tarball);
    tarballBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) tarballBytes[i] = binary.charCodeAt(i);
  } catch {
    return err('tarball must be valid base64');
  }

  if (tarballBytes.length < 1024) {
    return err('Tarball is too small (minimum 1KB). This does not look like a valid package.');
  }

  if (tarballBytes.length > 25 * 1024 * 1024) {
    return err('Tarball exceeds 25MB limit');
  }

  const tarballKey = `${name}@${version}.tgz`;

  const existing = await env.DB.prepare(
    'SELECT id FROM packages WHERE name = ? AND version = ?'
  ).bind(name, version).first();

  if (existing) return err(`${name}@${version} already published. Bump the version.`, 409);

  const sha256 = await hashBytes(tarballBytes);
  await env.TARBALLS.put(tarballKey, tarballBytes.buffer as ArrayBuffer);

  const publishedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO packages (name, version, description, author, tags, tarball_key, tarball_size, sha256, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    name, version, description, owner,
    JSON.stringify(tags), tarballKey,
    tarballBytes.length, sha256, publishedAt
  ).run();

  return json({
    success: true,
    package: { name, version, description, tags, tarball_size: tarballBytes.length, sha256, published_at: publishedAt },
    url: `https://cerebrex-registry.therealjosefdmcclammey.workers.dev/v1/packages/${encodeURIComponent(name)}/${version}`,
  }, 201);
}

async function handleGetPackage(env: Env, name: string): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT name, version, description, author, tags, tarball_size, sha256, published_at
     FROM packages WHERE name = ? ORDER BY published_at DESC`
  ).bind(name).all();

  if (!results?.length) return err(`Package '${name}' not found`, 404);
  return json({ success: true, name, versions: results.map(parsePackageRow) });
}

async function handleGetVersion(env: Env, name: string, version: string): Promise<Response> {
  const resolvedVersion = version === 'latest'
    ? (await env.DB.prepare(
        'SELECT version FROM packages WHERE name = ? ORDER BY published_at DESC LIMIT 1'
      ).bind(name).first<{ version: string }>())?.version
    : version;

  if (!resolvedVersion) return err(`Package '${name}' not found`, 404);

  const row = await env.DB.prepare(
    `SELECT name, version, description, author, tags, tarball_size, sha256, published_at
     FROM packages WHERE name = ? AND version = ?`
  ).bind(name, resolvedVersion).first();

  if (!row) return err(`${name}@${resolvedVersion} not found`, 404);

  const pkg = parsePackageRow(row);
  return json({
    success: true,
    ...pkg,
    download_url: `https://cerebrex-registry.therealjosefdmcclammey.workers.dev/v1/packages/${encodeURIComponent(name)}/${resolvedVersion}/download`,
  });
}

async function handleDownload(env: Env, name: string, version: string): Promise<Response> {
  const resolvedVersion = version === 'latest'
    ? (await env.DB.prepare(
        'SELECT version FROM packages WHERE name = ? ORDER BY published_at DESC LIMIT 1'
      ).bind(name).first<{ version: string }>())?.version
    : version;

  if (!resolvedVersion) return err(`Package '${name}' not found`, 404);

  const row = await env.DB.prepare(
    'SELECT tarball_key, sha256 FROM packages WHERE name = ? AND version = ?'
  ).bind(name, resolvedVersion).first<{ tarball_key: string; sha256: string }>();

  if (!row) return err(`${name}@${resolvedVersion} not found`, 404);

  const tarball = await env.TARBALLS.get(row.tarball_key, 'arrayBuffer');
  if (!tarball) return err('Tarball not found in storage', 404);

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

  const { valid } = await validateToken(token, env);
  if (!valid) return err('Invalid or revoked token', 401);

  const row = await env.DB.prepare(
    'SELECT tarball_key FROM packages WHERE name = ? AND version = ?'
  ).bind(name, version).first<{ tarball_key: string }>();

  if (!row) return err(`${name}@${version} not found`, 404);

  await env.TARBALLS.delete(row.tarball_key);
  await env.DB.prepare('DELETE FROM packages WHERE name = ? AND version = ?').bind(name, version).run();

  return json({ success: true, message: `${name}@${version} unpublished` });
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
  };
}
