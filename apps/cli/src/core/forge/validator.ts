/**
 * CerebreX FORGE — MCP Server Validator
 * Checks parsed specs for issues before code generation.
 */

import type { ParsedSpec } from '@cerebrex/types';

export async function validateSpec(spec: ParsedSpec): Promise<string[]> {
  const warnings: string[] = [];

  if (!spec.baseUrl) {
    warnings.push('No base URL found in spec. You will need to set it manually in the generated server.');
  }
  if (spec.endpoints.length === 0) {
    throw new Error('Spec has no endpoints. Nothing to generate.');
  }
  if (spec.endpoints.length > 100) {
    warnings.push(`Large spec: ${spec.endpoints.length} endpoints. Generation may take a moment.`);
  }

  const toolNames = spec.endpoints.map((e) => e.toolName);
  const duplicates = toolNames.filter((n, i) => toolNames.indexOf(n) !== i);
  if (duplicates.length > 0) {
    warnings.push(`Duplicate tool names detected: ${[...new Set(duplicates)].join(', ')}. Some tools may be overwritten.`);
  }

  const unnamedOps = spec.endpoints.filter((e) => !e.description || e.description.length < 5);
  if (unnamedOps.length > 0) {
    warnings.push(`${unnamedOps.length} endpoint(s) have no description. AI agents rely on descriptions to use tools correctly.`);
  }

  return warnings;
}
