#!/usr/bin/env node
/**
 * CerebreX HIVE — MCP Server
 *
 * Manage multi-agent orchestration configs (hives) via the CerebreX registry API.
 *
 * Environment variables:
 *   CEREBREX_TOKEN        — your CerebreX auth token (required)
 *   CEREBREX_REGISTRY_URL — registry base URL (default: https://registry.therealcool.site)
 *
 * Tools exposed:
 *   hive_list    — list all hives for the authenticated user
 *   hive_create  — create a new hive config
 *   hive_get     — get a specific hive by ID or name
 *   hive_update  — update a hive's config, description, or status
 *   hive_delete  — delete a hive
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const REGISTRY_URL = process.env.CEREBREX_REGISTRY_URL || 'https://registry.therealcool.site';
const TOKEN = process.env.CEREBREX_TOKEN || '';

if (!TOKEN) {
  process.stderr.write('[hive-mcp] WARNING: CEREBREX_TOKEN is not set. API calls will fail.\n');
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

async function apiPatch(path: string, body: object): Promise<any> {
  const res = await fetch(`${REGISTRY_URL}${path}`, {
    method: 'PATCH',
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
    name: 'hive_list',
    description: 'List all hive agent-network configs for the authenticated user.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'active', 'archived'],
          description: 'Filter by status.',
        },
      },
    },
  },
  {
    name: 'hive_create',
    description: 'Create a new hive — a named, persistent multi-agent orchestration config.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Unique name for this hive (e.g. "research-pipeline", "customer-support-mesh"). Max 128 chars.',
        },
        description: {
          type: 'string',
          description: 'Human-readable description of what this hive does.',
        },
        config: {
          type: 'object',
          description: 'Hive configuration object. Example: { "agents": [{ "id": "planner", "role": "planner", "model": "claude-opus-4-6", "tools": ["memex-mcp"] }], "routing": "sequential", "shared_memory": true }',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'hive_get',
    description: 'Get a specific hive by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The hive ID (returned by hive_list or hive_create).',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'hive_update',
    description: 'Update a hive\'s config, description, or status.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The hive ID to update.',
        },
        description: {
          type: 'string',
          description: 'Updated description.',
        },
        config: {
          type: 'object',
          description: 'Updated configuration object.',
        },
        status: {
          type: 'string',
          enum: ['draft', 'active', 'archived'],
          description: 'Updated status.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'hive_delete',
    description: 'Permanently delete a hive by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The hive ID to delete.',
        },
      },
      required: ['id'],
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleHiveList(args: any): Promise<string> {
  let url = '/v1/hive';
  if (args.status) url += `?status=${encodeURIComponent(args.status)}`;
  const result = await apiGet(url);
  if (!result.success) return `Error listing hives: ${result.error || 'unknown error'}`;
  if (!result.hives.length) return 'No hives found.';
  const lines = result.hives.map((h: any) =>
    `[${h.id}] ${h.name} (${h.status}) — ${h.description || 'no description'} | created: ${(h.created_at||'').slice(0,10)}`
  );
  return `${result.count} hive${result.count === 1 ? '' : 's'}:\n\n${lines.join('\n')}`;
}

async function handleHiveCreate(args: any): Promise<string> {
  const { name, description = '', config = {} } = args;
  const result = await apiPost('/v1/hive', { name, description, config });
  if (!result.success) return `Error creating hive: ${result.error || 'unknown error'}`;
  return `Hive created — id: ${result.id} | name: ${name} | status: draft`;
}

async function handleHiveGet(args: any): Promise<string> {
  const result = await apiGet(`/v1/hive/${encodeURIComponent(args.id)}`);
  if (!result.success) return `Error fetching hive: ${result.error || 'unknown error'}`;
  const h = result.hive;
  const config = typeof h.config === 'string' ? h.config : JSON.stringify(h.config, null, 2);
  return `Hive: ${h.name} [${h.id}]\nStatus: ${h.status}\nDescription: ${h.description || '—'}\nCreated: ${h.created_at}\nUpdated: ${h.updated_at}\n\nConfig:\n${config}`;
}

async function handleHiveUpdate(args: any): Promise<string> {
  const { id, ...updates } = args;
  const result = await apiPatch(`/v1/hive/${encodeURIComponent(id)}`, updates);
  if (!result.success) return `Error updating hive: ${result.error || 'unknown error'}`;
  return `Hive ${id} updated.`;
}

async function handleHiveDelete(args: any): Promise<string> {
  const result = await apiDelete(`/v1/hive/${encodeURIComponent(args.id)}`);
  if (!result.success) return `Error deleting hive: ${result.error || 'unknown error'}`;
  return `Hive ${args.id} deleted.`;
}

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: '@arealcoolco/hive-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;
    switch (name) {
      case 'hive_list':   result = await handleHiveList(args || {}); break;
      case 'hive_create': result = await handleHiveCreate(args || {}); break;
      case 'hive_get':    result = await handleHiveGet(args || {}); break;
      case 'hive_update': result = await handleHiveUpdate(args || {}); break;
      case 'hive_delete': result = await handleHiveDelete(args || {}); break;
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
