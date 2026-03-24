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
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'http_get',
    description: 'Fetch the contents of a URL via HTTP GET. Returns the response body as text. Use for reading web pages, APIs, or any HTTP resource.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch.' },
        headers: { type: 'object', description: 'Optional request headers as key-value pairs.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'http_post',
    description: 'Send an HTTP POST request with a JSON body. Returns the response body as text.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to POST to.' },
        body: { description: 'The request body — object, array, or string.' },
        headers: { type: 'object', description: 'Optional request headers.' },
      },
      required: ['url', 'body'],
    },
  },
  {
    name: 'http_request',
    description: 'Make an HTTP request with full control over method, headers, and body.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL.' },
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

const DEFAULT_MAX_BYTES = 32768;

async function doRequest(url: string, method: string, headers: Record<string, string>, body: any, maxBytes: number): Promise<string> {
  const opts: RequestInit = { method, headers: { 'User-Agent': 'cerebrex-fetch-mcp/1.0', ...headers } };

  if (body !== undefined && body !== null && ['POST','PUT','PATCH'].includes(method)) {
    if (typeof body === 'object') {
      opts.body = JSON.stringify(body);
      (opts.headers as any)['Content-Type'] = (opts.headers as any)['Content-Type'] || 'application/json';
    } else {
      opts.body = String(body);
    }
  }

  const res = await fetch(url, opts);
  const status = `${res.status} ${res.statusText}`;
  const contentType = res.headers.get('content-type') || '';

  let text = await res.text();
  if (text.length > maxBytes) {
    text = text.slice(0, maxBytes) + `\n\n[TRUNCATED — response was ${text.length} bytes, showing first ${maxBytes}]`;
  }

  return `HTTP ${status}\nContent-Type: ${contentType}\n\n${text}`;
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleHttpGet(args: any): Promise<string> {
  return doRequest(args.url, 'GET', args.headers || {}, undefined, DEFAULT_MAX_BYTES);
}

async function handleHttpPost(args: any): Promise<string> {
  return doRequest(args.url, 'POST', args.headers || {}, args.body, DEFAULT_MAX_BYTES);
}

async function handleHttpRequest(args: any): Promise<string> {
  const { url, method = 'GET', headers = {}, body, max_bytes = DEFAULT_MAX_BYTES } = args;
  return doRequest(url, method.toUpperCase(), headers, body, max_bytes);
}

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: '@arealcoolco/fetch-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result: string;
    switch (name) {
      case 'http_get':     result = await handleHttpGet(args || {}); break;
      case 'http_post':    result = await handleHttpPost(args || {}); break;
      case 'http_request': result = await handleHttpRequest(args || {}); break;
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    return { content: [{ type: 'text', text: result }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Tool error: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
