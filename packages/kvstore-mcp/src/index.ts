#!/usr/bin/env node
/**
 * CerebreX KVSTORE — Ephemeral Key-Value Store MCP Server
 *
 * In-process key-value store for agent session state.
 * Perfect for sharing state between tool calls within a single session.
 * Data lives in memory — restarting the MCP server clears it.
 *
 * Tools exposed:
 *   kv_set    — store a key-value pair
 *   kv_get    — retrieve a value by key
 *   kv_delete — delete a key
 *   kv_list   — list all keys (optionally filtered by prefix)
 *   kv_clear  — clear all keys (or a namespace prefix)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ── In-memory store ───────────────────────────────────────────────────────────

const store = new Map<string, { value: any; expires?: number }>();

function isExpired(entry: { expires?: number }): boolean {
  return entry.expires !== undefined && Date.now() > entry.expires;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'kv_set',
    description: 'Store a value under a key. Use namespaces with ":" separators (e.g. "session:user_id"). Values can be strings, numbers, objects, or arrays.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The key to store under.' },
        value: { description: 'The value to store.' },
        ttl_seconds: { type: 'number', description: 'Optional TTL in seconds — key auto-expires after this duration.' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'kv_get',
    description: 'Retrieve a value by key. Returns null if not found or expired.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The key to retrieve.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'kv_delete',
    description: 'Delete a key from the store.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The key to delete.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'kv_list',
    description: 'List all keys in the store, optionally filtered by a prefix.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: { type: 'string', description: 'Only return keys starting with this prefix.' },
      },
    },
  },
  {
    name: 'kv_clear',
    description: 'Clear all keys from the store, or only keys matching a prefix.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: { type: 'string', description: 'Only clear keys starting with this prefix. Omit to clear everything.' },
      },
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

function handleKvSet(args: any): string {
  const { key, value, ttl_seconds } = args;
  const entry: { value: any; expires?: number } = { value };
  if (ttl_seconds) entry.expires = Date.now() + ttl_seconds * 1000;
  store.set(key, entry);
  return `Stored: ${key} = ${JSON.stringify(value)}${ttl_seconds ? ` (expires in ${ttl_seconds}s)` : ''}`;
}

function handleKvGet(args: any): string {
  const entry = store.get(args.key);
  if (!entry || isExpired(entry)) {
    if (entry) store.delete(args.key);
    return `null (key "${args.key}" not found)`;
  }
  const val = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value, null, 2);
  return val;
}

function handleKvDelete(args: any): string {
  const existed = store.has(args.key);
  store.delete(args.key);
  return existed ? `Deleted: ${args.key}` : `Key not found: ${args.key}`;
}

function handleKvList(args: any): string {
  const prefix = args.prefix || '';
  const keys: string[] = [];
  for (const [k, v] of store.entries()) {
    if (isExpired(v)) { store.delete(k); continue; }
    if (!prefix || k.startsWith(prefix)) keys.push(k);
  }
  if (!keys.length) return prefix ? `No keys with prefix "${prefix}"` : 'Store is empty';
  return keys.map(k => {
    const v = store.get(k)!;
    const val = typeof v.value === 'string' ? v.value : JSON.stringify(v.value);
    const short = val.length > 60 ? val.slice(0, 57) + '...' : val;
    return `${k}: ${short}`;
  }).join('\n');
}

function handleKvClear(args: any): string {
  const prefix = args.prefix || '';
  if (!prefix) {
    const count = store.size;
    store.clear();
    return `Cleared ${count} key${count === 1 ? '' : 's'}`;
  }
  let count = 0;
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) { store.delete(k); count++; }
  }
  return `Cleared ${count} key${count === 1 ? '' : 's'} with prefix "${prefix}"`;
}

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: '@arealcoolco/kvstore-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result: string;
    switch (name) {
      case 'kv_set':    result = handleKvSet(args || {}); break;
      case 'kv_get':    result = handleKvGet(args || {}); break;
      case 'kv_delete': result = handleKvDelete(args || {}); break;
      case 'kv_list':   result = handleKvList(args || {}); break;
      case 'kv_clear':  result = handleKvClear(args || {}); break;
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
