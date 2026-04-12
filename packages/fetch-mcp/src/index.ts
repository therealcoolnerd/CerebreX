#!/usr/bin/env node
/**
 * CerebreX FETCH — HTTP Request MCP Server
 *
 * Gives AI agents the ability to make HTTP requests to any URL.
 * Supports GET, POST, PUT, PATCH, DELETE with custom headers and bodies.
 *
 * Tools exposed:
 *   http_get     — fetch a URL and return its contents
 *   http_post    — send a POST request with a JSON body
 *   http_request — generic request with full control over method/headers/body
 *
 * Security: SSRF protection blocks private IP ranges, loopback, link-local,
 * and cloud metadata endpoints. Only http/https schemes are allowed.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ── SSRF Protection ───────────────────────────────────────────────────────────

/**
 * Block private/reserved IP ranges and cloud metadata endpoints.
 * Returns a reason string if blocked, or null if safe to proceed.
 */
function ssrfCheck(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'Invalid URL';
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Scheme '${parsed.protocol.replace(':', '')}' is not allowed — only http/https`;
  }

  const host = parsed.hostname.toLowerCase();

  // Block localhost variants
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.corp') ||
    host.endsWith('.home')
  ) {
    return `Host '${host}' resolves to a local/internal address`;
  }

  // Block cloud metadata endpoints
  const metadataHosts = [
    'metadata.google.internal',
    'metadata.goog',
    'instance-data',           // some cloud environments
  ];
  if (metadataHosts.includes(host)) {
    return `Host '${host}' is a cloud metadata endpoint`;
  }

  // Parse IPv4 and block private/reserved ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b, c] = ipv4.map(Number);
    if (
      a === 0 ||                                // 0.0.0.0/8      — this network
      a === 10 ||                               // 10.0.0.0/8     — private
      a === 127 ||                              // 127.0.0.0/8    — loopback
      (a === 100 && b >= 64 && b <= 127) ||     // 100.64.0.0/10  — shared address space (RFC 6598)
      (a === 169 && b === 254) ||               // 169.254.0.0/16 — link-local / AWS metadata
      (a === 172 && b >= 16 && b <= 31) ||      // 172.16.0.0/12  — private
      (a === 192 && b === 0 && c === 0) ||      // 192.0.0.0/24   — IETF protocol
      (a === 192 && b === 0 && c === 2) ||      // 192.0.2.0/24   — documentation
      (a === 192 && b === 168) ||               // 192.168.0.0/16 — private
      (a === 198 && b >= 18 && b <= 19) ||      // 198.18.0.0/15  — benchmarking
      (a === 198 && b === 51 && c === 100) ||   // 198.51.100.0/24— documentation
      (a === 203 && b === 0 && c === 113) ||    // 203.0.113.0/24 — documentation
      a >= 224                                  // 224.0.0.0+     — multicast/reserved
    ) {
      return `IP address ${host} is in a private or reserved range`;
    }
  }

  // Block IPv6 private/reserved ranges (bracket notation: [::1])
  const rawIpv6 = host.startsWith('[') && host.endsWith(']')
    ? host.slice(1, -1).toLowerCase()
    : null;
  if (rawIpv6 !== null) {
    if (
      rawIpv6 === '::1' ||                  // loopback
      rawIpv6 === '::' ||                   // unspecified
      rawIpv6.startsWith('fc') ||           // fc00::/7  — unique local
      rawIpv6.startsWith('fd') ||           // fd00::/8  — unique local
      rawIpv6.startsWith('fe80') ||         // fe80::/10 — link-local
      rawIpv6.startsWith('::ffff:') ||      // IPv4-mapped
      rawIpv6.startsWith('64:ff9b:') ||     // IPv4/IPv6 translation
      rawIpv6.startsWith('2001:db8') ||     // documentation
      rawIpv6.startsWith('100::') ||        // discard
      rawIpv6 === 'ff02::1'                 // all-nodes multicast
    ) {
      return `IPv6 address ${host} is in a private or reserved range`;
    }
  }

  return null; // safe
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'http_get',
    description: 'Fetch the contents of a URL via HTTP GET. Returns the response body as text. Use for reading web pages, APIs, or any HTTP resource. Note: requests to private IP ranges, localhost, and cloud metadata endpoints are blocked for security.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch. Must be a public http/https URL.' },
        headers: { type: 'object', description: 'Optional request headers as key-value pairs.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'http_post',
    description: 'Send an HTTP POST request with a JSON body. Returns the response body as text. Note: requests to private IP ranges, localhost, and cloud metadata endpoints are blocked for security.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to POST to. Must be a public http/https URL.' },
        body: { description: 'The request body — object, array, or string.' },
        headers: { type: 'object', description: 'Optional request headers.' },
      },
      required: ['url', 'body'],
    },
  },
  {
    name: 'http_request',
    description: 'Make an HTTP request with full control over method, headers, and body. Note: requests to private IP ranges, localhost, and cloud metadata endpoints are blocked for security.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL. Must be a public http/https URL.' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], description: 'HTTP method. Default: GET.' },
        headers: { type: 'object', description: 'Request headers.' },
        body: { description: 'Request body (for POST/PUT/PATCH). Serialized to JSON if object.' },
        max_bytes: { type: 'number', description: 'Truncate response to this many bytes. Default: 32768.' },
      },
      required: ['url'],
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_MAX_BYTES = 32_768;

async function doRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  maxBytes: number
): Promise<string> {
  // SSRF check — block before any network I/O
  const blocked = ssrfCheck(url);
  if (blocked) {
    throw new Error(`Request blocked (SSRF protection): ${blocked}`);
  }

  const opts: RequestInit = {
    method,
    headers: { 'User-Agent': 'cerebrex-fetch-mcp/1.0', ...headers },
  };

  if (body !== undefined && body !== null && ['POST', 'PUT', 'PATCH'].includes(method)) {
    if (typeof body === 'object') {
      opts.body = JSON.stringify(body);
      (opts.headers as Record<string, string>)['Content-Type'] =
        (opts.headers as Record<string, string>)['Content-Type'] || 'application/json';
    } else {
      opts.body = String(body);
    }
  }

  const res = await fetch(url, opts);
  const status = `${res.status} ${res.statusText}`;
  const contentType = res.headers.get('content-type') || '';

  let text = await res.text();
  if (text.length > maxBytes) {
    text = text.slice(0, maxBytes) +
      `\n\n[TRUNCATED — response was ${text.length} bytes, showing first ${maxBytes}]`;
  }

  return `HTTP ${status}\nContent-Type: ${contentType}\n\n${text}`;
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleHttpGet(args: Record<string, unknown>): Promise<string> {
  const url = args['url'] as string;
  const headers = (args['headers'] as Record<string, string>) || {};
  return doRequest(url, 'GET', headers, undefined, DEFAULT_MAX_BYTES);
}

async function handleHttpPost(args: Record<string, unknown>): Promise<string> {
  const url = args['url'] as string;
  const headers = (args['headers'] as Record<string, string>) || {};
  return doRequest(url, 'POST', headers, args['body'], DEFAULT_MAX_BYTES);
}

async function handleHttpRequest(args: Record<string, unknown>): Promise<string> {
  const url = args['url'] as string;
  const method = ((args['method'] as string) || 'GET').toUpperCase();
  const headers = (args['headers'] as Record<string, string>) || {};
  const maxBytes = (args['max_bytes'] as number) || DEFAULT_MAX_BYTES;
  return doRequest(url, method, headers, args['body'], maxBytes);
}

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: '@arealcoolco/fetch-mcp', version: '1.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result: string;
    switch (name) {
      case 'http_get':     result = await handleHttpGet((args || {}) as Record<string, unknown>); break;
      case 'http_post':    result = await handleHttpPost((args || {}) as Record<string, unknown>); break;
      case 'http_request': result = await handleHttpRequest((args || {}) as Record<string, unknown>); break;
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    return { content: [{ type: 'text', text: result }] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: 'text', text: `Tool error: ${msg}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
