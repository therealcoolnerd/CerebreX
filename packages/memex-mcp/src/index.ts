#!/usr/bin/env node
/**
 * CerebreX MEMEX — MCP Server
 *
 * Provides persistent cloud memory for AI agents via the CerebreX registry API.
 *
 * Environment variables:
 *   CEREBREX_TOKEN        — your CerebreX auth token (required)
 *   CEREBREX_AGENT_ID     — default agent identity (default: "default")
 *   CEREBREX_REGISTRY_URL — registry base URL (default: https://registry.therealcool.site)
 *
 * Tools exposed:
 *   memory_store    — store or update a memory
 *   memory_recall   — search and retrieve memories
 *   memory_forget   — delete a memory by ID
 *   memory_list     — list all memories for an agent
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const REGISTRY_URL = process.env.CEREBREX_REGISTRY_URL || 'https://registry.therealcool.site';
const TOKEN = process.env.CEREBREX_TOKEN || '';
const DEFAULT_AGENT = process.env.CEREBREX_AGENT_ID || 'default';

if (!TOKEN) {
  process.stderr.write('[memex-mcp] WARNING: CEREBREX_TOKEN is not set. API calls will fail.\n');
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${REGISTRY_URL}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return res.json();
}

async function apiPost(path: string, body: object): Promise<any> {
  const res = await fetch(`${REGISTRY_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiDelete(path: string): Promise<any> {
  const res = await fetch(`${REGISTRY_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return res.json();
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'memory_store',
    description: 'Store or update a persistent memory for this agent. Use this to save important facts, decisions, context, or learned information that should survive across sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Unique key for this memory within the namespace (e.g. "project:stack", "user:preferences", "task:current"). Max 512 chars.',
        },
        value: {
          description: 'The value to store. Can be a string, number, object, or array.',
        },
        agent_id: {
          type: 'string',
          description: 'Agent identifier to scope this memory. Defaults to the configured CEREBREX_AGENT_ID.',
        },
        namespace: {
          type: 'string',
          description: 'Namespace to organize memories (e.g. "project", "user", "session"). Default: "default".',
        },
        type: {
          type: 'string',
          enum: ['episodic', 'semantic', 'working'],
          description: 'Memory type: episodic (events/actions), semantic (facts/knowledge), working (current task state). Default: episodic.',
        },
        ttl_seconds: {
          type: 'number',
          description: 'Time-to-live in seconds. Memory auto-expires after this duration. Omit for permanent storage.',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'memory_recall',
    description: 'Search and retrieve memories for an agent. Use this to look up previously stored facts, context, or decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent identifier to search memories for. Defaults to CEREBREX_AGENT_ID.',
        },
        namespace: {
          type: 'string',
          description: 'Filter to a specific namespace.',
        },
        query: {
          type: 'string',
          description: 'Search string to filter memories by key (partial match).',
        },
        type: {
          type: 'string',
          enum: ['episodic', 'semantic', 'working'],
          description: 'Filter by memory type.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of memories to return. Default: 50.',
        },
      },
    },
  },
  {
    name: 'memory_forget',
    description: 'Delete a specific memory by its ID. Use this to remove outdated or incorrect memories.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The memory ID to delete (returned by memory_store or memory_recall).',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_list',
    description: 'List all memories for an agent, optionally filtered by namespace or type. Returns a structured summary.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent identifier. Defaults to CEREBREX_AGENT_ID.',
        },
        namespace: {
          type: 'string',
          description: 'Filter to a specific namespace.',
        },
        type: {
          type: 'string',
          enum: ['episodic', 'semantic', 'working'],
          description: 'Filter by memory type.',
        },
      },
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleMemoryStore(args: any): Promise<string> {
  const {
    key, value,
    agent_id = DEFAULT_AGENT,
    namespace = 'default',
    type = 'episodic',
    ttl_seconds,
  } = args;

  const body: any = { key, value, agent_id, namespace, type };
  if (ttl_seconds !== undefined) body.ttl_seconds = ttl_seconds;

  const result = await apiPost('/v1/memex', body);
  if (!result.success) {
    return `Error storing memory: ${result.error || 'unknown error'}`;
  }
  return result.created
    ? `Memory stored — id: ${result.id} | key: ${key} | agent: ${agent_id} | namespace: ${namespace}`
    : `Memory updated — id: ${result.id} | key: ${key} | agent: ${agent_id} | namespace: ${namespace}`;
}

async function handleMemoryRecall(args: any): Promise<string> {
  const {
    agent_id = DEFAULT_AGENT,
    namespace,
    query,
    type,
    limit = 50,
  } = args;

  let url = `/v1/memex?limit=${limit}&agent_id=${encodeURIComponent(agent_id)}`;
  if (namespace) url += `&namespace=${encodeURIComponent(namespace)}`;
  if (query) url += `&q=${encodeURIComponent(query)}`;
  if (type) url += `&type=${encodeURIComponent(type)}`;

  const result = await apiGet(url);
  if (!result.success) {
    return `Error recalling memories: ${result.error || 'unknown error'}`;
  }

  if (!result.memories.length) {
    return `No memories found for agent "${agent_id}"${namespace ? ` in namespace "${namespace}"` : ''}${query ? ` matching "${query}"` : ''}.`;
  }

  const lines = result.memories.map((m: any) => {
    const val = typeof m.value === 'string' ? m.value : JSON.stringify(m.value);
    const exp = m.expires_at ? ` [expires: ${m.expires_at.slice(0, 10)}]` : '';
    return `[${m.id}] ${m.agent_id}/${m.namespace}/${m.key} (${m.type})${exp}\n  value: ${val}`;
  });

  return `Found ${result.count} memor${result.count === 1 ? 'y' : 'ies'}:\n\n${lines.join('\n\n')}`;
}

async function handleMemoryForget(args: any): Promise<string> {
  const { id } = args;
  const result = await apiDelete(`/v1/memex/${encodeURIComponent(id)}`);
  if (!result.success) {
    return `Error forgetting memory: ${result.error || 'unknown error'}`;
  }
  return `Memory ${id} has been forgotten.`;
}

async function handleMemoryList(args: any): Promise<string> {
  const { agent_id = DEFAULT_AGENT, namespace, type } = args;
  let url = `/v1/memex?limit=500&agent_id=${encodeURIComponent(agent_id)}`;
  if (namespace) url += `&namespace=${encodeURIComponent(namespace)}`;
  if (type) url += `&type=${encodeURIComponent(type)}`;

  const result = await apiGet(url);
  if (!result.success) {
    return `Error listing memories: ${result.error || 'unknown error'}`;
  }

  if (!result.memories.length) {
    return `No memories stored for agent "${agent_id}".`;
  }

  // Group by namespace
  const grouped: Record<string, any[]> = {};
  for (const m of result.memories) {
    const ns = m.namespace || 'default';
    (grouped[ns] ??= []).push(m);
  }

  const sections = Object.entries(grouped).map(([ns, mems]) => {
    const rows = mems.map((m: any) => {
      const val = typeof m.value === 'string' ? m.value : JSON.stringify(m.value);
      const short = val.length > 80 ? val.slice(0, 77) + '...' : val;
      return `  [${m.id.slice(0, 8)}...] ${m.key} (${m.type}): ${short}`;
    });
    return `[${ns}]\n${rows.join('\n')}`;
  });

  return `Agent: ${agent_id} — ${result.count} memor${result.count === 1 ? 'y' : 'ies'}\n\n${sections.join('\n\n')}`;
}

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: '@arealcoolco/memex-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;
    switch (name) {
      case 'memory_store':  result = await handleMemoryStore(args || {}); break;
      case 'memory_recall': result = await handleMemoryRecall(args || {}); break;
      case 'memory_forget': result = await handleMemoryForget(args || {}); break;
      case 'memory_list':   result = await handleMemoryList(args || {}); break;
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
