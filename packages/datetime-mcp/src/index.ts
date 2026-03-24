#!/usr/bin/env node
/**
 * CerebreX DATETIME — Time & Timezone MCP Server
 *
 * Gives AI agents accurate access to current time, date conversions,
 * timezone lookups, and elapsed time calculations.
 *
 * Tools exposed:
 *   datetime_now      — current UTC and local time + date
 *   datetime_convert  — convert a timestamp between timezones
 *   datetime_diff     — calculate difference between two dates
 *   datetime_format   — format a date string or timestamp
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
    name: 'datetime_now',
    description: 'Get the current date and time. Returns UTC, ISO 8601, Unix timestamp, and optionally a specific timezone.',
    inputSchema: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: 'IANA timezone name (e.g. "America/New_York", "Europe/London"). If omitted, returns UTC.' },
      },
    },
  },
  {
    name: 'datetime_convert',
    description: 'Convert a date/time from one timezone to another.',
    inputSchema: {
      type: 'object',
      properties: {
        datetime: { type: 'string', description: 'ISO 8601 datetime string (e.g. "2025-01-15T14:30:00Z") or Unix timestamp.' },
        from_timezone: { type: 'string', description: 'Source IANA timezone (e.g. "America/Los_Angeles"). Default: UTC.' },
        to_timezone: { type: 'string', description: 'Target IANA timezone (e.g. "Asia/Tokyo").' },
      },
      required: ['datetime', 'to_timezone'],
    },
  },
  {
    name: 'datetime_diff',
    description: 'Calculate the difference between two dates/times.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Start date/time (ISO 8601 or Unix timestamp).' },
        end: { type: 'string', description: 'End date/time (ISO 8601 or Unix timestamp). Default: now.' },
      },
      required: ['start'],
    },
  },
  {
    name: 'datetime_format',
    description: 'Format a date into a human-readable string with a specific locale or style.',
    inputSchema: {
      type: 'object',
      properties: {
        datetime: { type: 'string', description: 'ISO 8601 datetime or Unix timestamp. Default: now.' },
        timezone: { type: 'string', description: 'IANA timezone for display. Default: UTC.' },
        locale: { type: 'string', description: 'BCP 47 locale (e.g. "en-US", "fr-FR"). Default: en-US.' },
        style: { type: 'string', enum: ['full', 'long', 'medium', 'short'], description: 'Date/time style. Default: long.' },
      },
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(input: string | undefined): Date {
  if (!input) return new Date();
  const n = Number(input);
  if (!isNaN(n)) return new Date(n < 1e12 ? n * 1000 : n);
  return new Date(input);
}

function formatInTz(date: Date, timezone: string, opts?: Intl.DateTimeFormatOptions): string {
  try {
    return date.toLocaleString('en-US', { timeZone: timezone, ...opts });
  } catch {
    return date.toISOString();
  }
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

function handleDatetimeNow(args: any): string {
  const now = new Date();
  const tz = args.timezone;
  const lines = [
    `UTC:       ${now.toUTCString()}`,
    `ISO 8601:  ${now.toISOString()}`,
    `Unix:      ${Math.floor(now.getTime() / 1000)}`,
  ];
  if (tz) {
    try {
      lines.push(`${tz}:  ${formatInTz(now, tz, { dateStyle: 'full', timeStyle: 'long' })}`);
    } catch {
      lines.push(`(invalid timezone: ${tz})`);
    }
  }
  return lines.join('\n');
}

function handleDatetimeConvert(args: any): string {
  const date = parseDate(args.datetime);
  const toTz = args.to_timezone;
  if (!toTz) return 'to_timezone is required';
  try {
    const converted = formatInTz(date, toTz, { dateStyle: 'full', timeStyle: 'long' });
    return `Input:  ${date.toISOString()}\nOutput (${toTz}):  ${converted}`;
  } catch (e: any) {
    return `Conversion error: ${e.message}`;
  }
}

function handleDatetimeDiff(args: any): string {
  const start = parseDate(args.start);
  const end = parseDate(args.end);
  const diffMs = end.getTime() - start.getTime();
  const abs = Math.abs(diffMs);
  const sign = diffMs < 0 ? '-' : '+';
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  return [
    `Start:    ${start.toISOString()}`,
    `End:      ${end.toISOString()}`,
    `Diff:     ${sign}${days}d ${hours}h ${minutes}m ${seconds}s`,
    `Ms:       ${diffMs}`,
  ].join('\n');
}

function handleDatetimeFormat(args: any): string {
  const date = parseDate(args.datetime);
  const tz = args.timezone || 'UTC';
  const locale = args.locale || 'en-US';
  const style = (args.style || 'long') as 'full' | 'long' | 'medium' | 'short';
  try {
    return formatInTz(date, tz, { dateStyle: style, timeStyle: style, });
  } catch (e: any) {
    return `Format error: ${e.message}`;
  }
}

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: '@arealcoolco/datetime-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result: string;
    switch (name) {
      case 'datetime_now':     result = handleDatetimeNow(args || {}); break;
      case 'datetime_convert': result = handleDatetimeConvert(args || {}); break;
      case 'datetime_diff':    result = handleDatetimeDiff(args || {}); break;
      case 'datetime_format':  result = handleDatetimeFormat(args || {}); break;
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
