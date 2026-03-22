/**
 * CerebreX Registry — Cloudflare Worker
 * Handles publish, install, and search for MCP server packages.
 *
 * Bindings:
 *   DB       — D1 database (package metadata)
 *   TARBALLS — KV namespace (tarball blobs)
 */

export interface Env {
  DB: D1Database;
  TARBALLS: KVNamespace;
  ENVIRONMENT: string;
}

// ── CORS helpers ──────────────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function err(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
// For MVP: any non-empty Bearer token is accepted for publish.
// v0.4 will add proper account registration + token validation.

function getToken(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
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

    // GET /                      — health check
    if (pathname === '/' && method === 'GET') {
      return json({ name: 'CerebreX Registry', version: '1.0.0', status: 'ok' });
    }

    // GET /v1/packages           — list / search packages
    if (pathname === '/v1/packages' && method === 'GET') {
      return handleList(env, searchParams);
    }

    // POST /v1/packages          — publish a package
    if (pathname === '/v1/packages' && method === 'POST') {
      return handlePublish(request, env);
    }

    // GET /v1/packages/:name     — get all versions of a package
    const pkgMatch = pathname.match(/^\/v1\/packages\/([^/]+)$/);
    if (pkgMatch && method === 'GET') {
      return handleGetPackage(env, decodeURIComponent(pkgMatch[1]));
    }

    // GET /v1/packages/:name/:version            — get specific version metadata
    const versionMatch = pathname.match(/^\/v1\/packages\/([^/]+)\/([^/]+)$/);
    if (versionMatch && method === 'GET') {
      const [, name, version] = versionMatch;
      return handleGetVersion(env, decodeURIComponent(name), decodeURIComponent(version));
    }

    // GET /v1/packages/:name/:version/download   — download tarball
    const downloadMatch = pathname.match(/^\/v1\/packages\/([^/]+)\/([^/]+)\/download$/);
    if (downloadMatch && method === 'GET') {
      const [, name, version] = downloadMatch;
      return handleDownload(env, decodeURIComponent(name), decodeURIComponent(version));
    }

    // DELETE /v1/packages/:name/:version         — unpublish (auth required)
    if (versionMatch && method === 'DELETE') {
      const [, name, version] = versionMatch;
      return handleUnpublish(request, env, decodeURIComponent(name), decodeURIComponent(version));
    }

    return err('Not found', 404);
  },
};

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleList(env: Env, params: URLSearchParams): Promise<Response> {
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

async function handlePublish(request: Request, env: Env): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required. Set a token with: cerebrex auth login', 401);

  let body: {
    name?: string;
    version?: string;
    description?: string;
    tags?: string[];
    tarball?: string; // base64-encoded .tgz
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

  // Validate semver loosely
  if (!/^\d+\.\d+\.\d+/.test(version)) return err('version must be semver (e.g. 1.0.0)');

  // Validate package name
  if (!/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9\-_.]*$/.test(name)) {
    return err('Invalid package name. Use lowercase letters, numbers, hyphens, and dots.');
  }

  // Decode and store tarball
  let tarballBytes: Uint8Array;
  try {
    const binary = atob(tarball);
    tarballBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) tarballBytes[i] = binary.charCodeAt(i);
  } catch {
    return err('tarball must be valid base64');
  }

  if (tarballBytes.length > 25 * 1024 * 1024) {
    return err('Tarball exceeds 25MB limit');
  }

  const tarballKey = `${name}@${version}.tgz`;

  // Check duplicate
  const existing = await env.DB.prepare(
    'SELECT id FROM packages WHERE name = ? AND version = ?'
  ).bind(name, version).first();

  if (existing) return err(`${name}@${version} already published. Bump the version.`, 409);

  // Store tarball in KV
  await env.TARBALLS.put(tarballKey, tarballBytes.buffer as ArrayBuffer);

  // Store metadata in D1
  const publishedAt = new Date().toISOString();
  const author = token.slice(0, 8) + '...'; // store prefix only, never full token
  await env.DB.prepare(
    `INSERT INTO packages (name, version, description, author, tags, tarball_key, tarball_size, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    name, version, description, author,
    JSON.stringify(tags), tarballKey,
    tarballBytes.length, publishedAt
  ).run();

  return json({
    success: true,
    package: { name, version, description, tags, tarball_size: tarballBytes.length, published_at: publishedAt },
    url: `https://registry.cerebrex.dev/v1/packages/${encodeURIComponent(name)}/${version}`,
  }, 201);
}

async function handleGetPackage(env: Env, name: string): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT name, version, description, author, tags, tarball_size, published_at
     FROM packages WHERE name = ? ORDER BY published_at DESC`
  ).bind(name).all();

  if (!results?.length) return err(`Package '${name}' not found`, 404);

  const versions = (results).map(parsePackageRow);
  return json({ success: true, name, versions });
}

async function handleGetVersion(env: Env, name: string, version: string): Promise<Response> {
  const resolvedVersion = version === 'latest'
    ? (await env.DB.prepare(
        'SELECT version FROM packages WHERE name = ? ORDER BY published_at DESC LIMIT 1'
      ).bind(name).first<{ version: string }>())?.version
    : version;

  if (!resolvedVersion) return err(`Package '${name}' not found`, 404);

  const row = await env.DB.prepare(
    `SELECT name, version, description, author, tags, tarball_size, published_at
     FROM packages WHERE name = ? AND version = ?`
  ).bind(name, resolvedVersion).first();

  if (!row) return err(`${name}@${resolvedVersion} not found`, 404);

  const pkg = parsePackageRow(row);
  return json({
    success: true,
    ...pkg,
    download_url: `https://registry.cerebrex.dev/v1/packages/${encodeURIComponent(name)}/${resolvedVersion}/download`,
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
    'SELECT tarball_key FROM packages WHERE name = ? AND version = ?'
  ).bind(name, resolvedVersion).first<{ tarball_key: string }>();

  if (!row) return err(`${name}@${resolvedVersion} not found`, 404);

  const tarball = await env.TARBALLS.get(row.tarball_key, 'arrayBuffer');
  if (!tarball) return err('Tarball not found in storage', 404);

  return new Response(tarball, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${row.tarball_key}"`,
      ...corsHeaders(),
    },
  });
}

async function handleUnpublish(request: Request, env: Env, name: string, version: string): Promise<Response> {
  const token = getToken(request);
  if (!token) return err('Authorization required', 401);

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
    published_at: row.published_at as string,
  };
}
