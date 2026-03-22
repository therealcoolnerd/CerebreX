/**
 * @cerebrex/types — Shared TypeScript type definitions
 * Used across all CerebreX packages
 */

// ── OpenAPI Types ─────────────────────────────────────────────────────────────
export interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths?: Record<string, PathItem>;
  components?: {
    securitySchemes?: Record<string, SecurityScheme>;
    schemas?: Record<string, SchemaObject>;
  };
  servers?: Array<{ url: string; description?: string }>;
  security?: SecurityRequirement[];
  // Swagger 2.x
  host?: string;
  basePath?: string;
  schemes?: string[];
}

export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  head?: Operation;
  options?: Operation;
}

export interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  tags?: string[];
  security?: SecurityRequirement[];
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: SchemaObject;
}

export interface RequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, { schema?: SchemaObject }>;
}

export interface SchemaObject {
  type?: string;
  format?: string;
  description?: string;
  enum?: string[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  nullable?: boolean;
  $ref?: string;
}

export type SecurityScheme = {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
};

export type SecurityRequirement = Record<string, string[]>;
export type Response = { description?: string; content?: Record<string, { schema?: SchemaObject }> };

// ── CerebreX Internal Types ───────────────────────────────────────────────────
export interface ParsedEndpoint {
  path: string;
  method: string;
  toolName: string;
  description: string;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  tags: string[];
  security: SecurityRequirement[];
}

export interface ParsedSpec {
  title: string;
  version: string;
  description: string;
  baseUrl: string;
  endpoints: ParsedEndpoint[];
  securitySchemes: Record<string, SecurityScheme>;
  rawSpec: OpenAPISpec;
}

export interface ForgeConfig {
  spec: ParsedSpec;
  outputDir: string;
  serverName?: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  authScheme: 'none' | 'apikey' | 'bearer' | 'oauth2';
}

export interface ForgeResult {
  serverName: string;
  toolCount: number;
  transport: string;
  outputDir: string;
  files: string[];
}

// ── Trace Types ───────────────────────────────────────────────────────────────
export interface TraceStep {
  id: string;
  timestamp: string;
  type: 'tool_call' | 'tool_result' | 'llm_request' | 'llm_response' | 'error';
  toolName?: string;
  inputs?: Record<string, unknown>;
  outputs?: unknown;
  tokens?: number;
  latencyMs?: number;
  error?: string;
}

export interface TraceSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  steps: TraceStep[];
  totalTokens: number;
  metadata?: Record<string, unknown>;
}

export interface TraceSummary {
  sessionId: string;
  stepCount: number;
  totalTokens: number;
  durationMs: number;
  filePath: string;
}

// ── Memory Types ──────────────────────────────────────────────────────────────
export type MemoryType = 'episodic' | 'semantic' | 'working';

export interface MemoryEntry {
  id: string;
  namespace: string;
  type: MemoryType;
  key: string;
  value: unknown;
  checksum: string;
  createdAt: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

// ── Registry Types ────────────────────────────────────────────────────────────
export interface RegistryPackage {
  name: string;
  version: string;
  description: string;
  publisher: string;
  downloads: number;
  stars: number;
  tags: string[];
  mcpVersion: string;
  createdAt: string;
  updatedAt: string;
  securityScore?: number;
}
