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

      endpoints.push({
        path: pathStr,
        method: method.toUpperCase(),
        toolName,
        description: operation.summary || operation.description || `${method.toUpperCase()} ${pathStr}`,
        parameters: operation.parameters || [],
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
