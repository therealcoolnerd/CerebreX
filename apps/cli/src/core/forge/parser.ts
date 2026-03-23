/**
 * CerebreX FORGE — OpenAPI Spec Parser
 * Converts OpenAPI 3.x / Swagger 2.x specs into an internal IR
 * ready for MCP server code generation.
 */

import type { OpenAPISpec, ParsedEndpoint, ParsedSpec } from '@cerebrex/types';

/**
 * Parse an OpenAPI spec from a local file path or remote URL.
 * Accepts JSON or YAML format.
 */
export async function parseSpec(specPathOrUrl: string): Promise<ParsedSpec> {
  let rawSpec: string;

  if (specPathOrUrl.startsWith('http://') || specPathOrUrl.startsWith('https://')) {
    const response = await fetch(specPathOrUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch spec: HTTP ${response.status} from ${specPathOrUrl}`);
    }
    rawSpec = await response.text();
  } else {
    const fs = await import('fs');
    if (!fs.existsSync(specPathOrUrl)) {
      throw new Error(`Spec file not found: ${specPathOrUrl}`);
    }
    rawSpec = fs.readFileSync(specPathOrUrl, 'utf-8');
  }

  // Parse YAML or JSON
  let specObj: OpenAPISpec;
  if (rawSpec.trimStart().startsWith('{')) {
    specObj = JSON.parse(rawSpec) as OpenAPISpec;
  } else {
    const { parse } = await import('yaml');
    specObj = parse(rawSpec) as OpenAPISpec;
  }

  return transformSpec(specObj);
}

// ── $ref resolution ──────────────────────────────────────────────────────────

/** Resolve a local JSON Pointer ref like "#/components/schemas/Pet" */
function resolveRef(spec: OpenAPISpec, ref: string): any {
  if (!ref.startsWith('#/')) return {};
  const parts = ref.slice(2).split('/');
  let node: any = spec;
  for (const part of parts) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    node = node?.[key];
    if (node === undefined) return {};
  }
  return node;
}

/** Recursively resolve all $ref pointers in a schema (max 10 levels deep). */
function resolveSchema(spec: OpenAPISpec, schema: any, depth = 0): any {
  if (!schema || depth > 10) return schema;
  if (schema.$ref) return resolveSchema(spec, resolveRef(spec, schema.$ref as string), depth + 1);
  if (schema.allOf) return { ...schema, allOf: schema.allOf.map((s: any) => resolveSchema(spec, s, depth + 1)) };
  if (schema.oneOf) return { ...schema, oneOf: schema.oneOf.map((s: any) => resolveSchema(spec, s, depth + 1)) };
  if (schema.anyOf) return { ...schema, anyOf: schema.anyOf.map((s: any) => resolveSchema(spec, s, depth + 1)) };
  if (schema.type === 'object' && schema.properties) {
    const props: Record<string, any> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      props[k] = resolveSchema(spec, v, depth + 1);
    }
    return { ...schema, properties: props };
  }
  if (schema.type === 'array' && schema.items) {
    return { ...schema, items: resolveSchema(spec, schema.items, depth + 1) };
  }
  return schema;
}

/**
 * Transform raw OpenAPI spec into CerebreX's internal ParsedSpec IR.
 */
function transformSpec(spec: OpenAPISpec): ParsedSpec {
  const endpoints: ParsedEndpoint[] = [];

  if (!spec.paths) {
    throw new Error('OpenAPI spec has no paths defined. Nothing to generate.');
  }

  for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      const toolName = operation.operationId
        ? sanitizeToolName(operation.operationId)
        : generateToolName(method, pathStr);

      // Resolve $ref in parameters so generator always gets concrete schemas
      const resolvedParameters = (operation.parameters || []).map((p: any) => ({
        ...p,
        schema: resolveSchema(spec, p.schema || { type: 'string' }),
      }));

      endpoints.push({
        path: pathStr,
        method: method.toUpperCase(),
        toolName,
        description: operation.summary || operation.description || `${method.toUpperCase()} ${pathStr}`,
        parameters: resolvedParameters,
        requestBody: operation.requestBody,
        responses: operation.responses || {},
        tags: operation.tags || [],
        security: operation.security || spec.security || [],
      });
    }
  }

  return {
    title: spec.info?.title || 'Generated MCP Server',
    version: spec.info?.version || '1.0.0',
    description: spec.info?.description || '',
    baseUrl: getBaseUrl(spec),
    endpoints,
    securitySchemes: spec.components?.securitySchemes || {},
    rawSpec: spec,
  };
}

function sanitizeToolName(operationId: string): string {
  return operationId
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function generateToolName(method: string, path: string): string {
  const parts = path.replace(/^\//, '').split('/');
  const cleanParts = parts
    .filter((p) => !p.startsWith('{'))
    .map((p) => p.replace(/[^a-zA-Z0-9]/g, '_'));
  return `${method}_${cleanParts.join('_')}`.toLowerCase();
}

function getBaseUrl(spec: OpenAPISpec): string {
  if (spec.servers && spec.servers.length > 0) {
    return spec.servers[0]?.url || '';
  }
  // Swagger 2.x fallback
  if ((spec as any).host) {
    const scheme = (spec as any).schemes?.[0] || 'https';
    const basePath = (spec as any).basePath || '';
    return `${scheme}://${(spec as any).host}${basePath}`;
  }
  return '';
}
