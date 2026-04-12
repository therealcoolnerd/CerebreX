/**
 * CerebreX TEST — Assertion Engine
 * Evaluates an AssertionSet against a replayed TraceSession.
 */

import type { TraceSession, TraceStep } from '@cerebrex/types';
import type {
  AssertionSet,
  AssertionResult,
  RangeAssertion,
  StepAssertion,
  ToolsCalledAssertion,
  OutputAssertion,
} from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkRange(
  value: number,
  spec: number | RangeAssertion,
  label: string
): AssertionResult {
  if (typeof spec === 'number') {
    return value === spec
      ? { name: label, status: 'pass' }
      : { name: label, status: 'fail', expected: spec, actual: value, message: `expected ${spec}, got ${value}` };
  }
  if (spec.exact !== undefined) {
    return value === spec.exact
      ? { name: label, status: 'pass' }
      : { name: label, status: 'fail', expected: spec.exact, actual: value, message: `expected exactly ${spec.exact}, got ${value}` };
  }
  if (spec.min !== undefined && value < spec.min) {
    return { name: label, status: 'fail', expected: `>= ${spec.min}`, actual: value, message: `${value} is below minimum ${spec.min}` };
  }
  if (spec.max !== undefined && value > spec.max) {
    return { name: label, status: 'fail', expected: `<= ${spec.max}`, actual: value, message: `${value} exceeds maximum ${spec.max}` };
  }
  return { name: label, status: 'pass' };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Resolve a dot-notation path into a nested object, e.g. "results.0.name" */
function resolvePath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur === 'object') return (cur as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

// ── Step resolution ───────────────────────────────────────────────────────────

function resolveStep(steps: TraceStep[], at: number | 'last'): TraceStep | undefined {
  if (at === 'last') return steps[steps.length - 1];
  return steps[at];
}

// ── Individual assertion evaluators ──────────────────────────────────────────

function assertStepCount(
  steps: TraceStep[],
  spec: NonNullable<AssertionSet['stepCount']>
): AssertionResult {
  return checkRange(steps.length, spec, 'stepCount');
}

function assertTokenCount(
  session: TraceSession,
  spec: NonNullable<AssertionSet['tokenCount']>
): AssertionResult {
  return checkRange(session.totalTokens, spec, 'tokenCount');
}

function assertDuration(
  session: TraceSession,
  spec: NonNullable<AssertionSet['durationMs']>
): AssertionResult {
  const dur = session.durationMs ?? 0;
  return checkRange(dur, spec, 'durationMs');
}

function assertNoErrors(steps: TraceStep[]): AssertionResult {
  const errStep = steps.find((s) => s.type === 'error');
  if (errStep) {
    return {
      name: 'noErrors',
      status: 'fail',
      message: `Found error step: ${errStep.error ?? 'unknown error'}`,
      actual: errStep,
    };
  }
  return { name: 'noErrors', status: 'pass' };
}

function assertToolsCalled(
  steps: TraceStep[],
  spec: ToolsCalledAssertion
): AssertionResult[] {
  const toolCalls = steps.filter((s) => s.type === 'tool_call' && s.toolName);
  const calledNames = toolCalls.map((s) => s.toolName as string);

  const results: AssertionResult[] = [];

  if (spec.exact) {
    // Only these tools, nothing else
    const unexpected = calledNames.filter((n) => !spec.tools.includes(n));
    if (unexpected.length > 0) {
      results.push({
        name: 'toolsCalled.exact',
        status: 'fail',
        message: `Unexpected tools called: ${unexpected.join(', ')}`,
        expected: spec.tools,
        actual: calledNames,
      });
    }
  }

  if (spec.ordered) {
    // Tools must appear in this exact order (as a subsequence)
    let pos = 0;
    for (const tool of spec.tools) {
      const idx = calledNames.indexOf(tool, pos);
      if (idx === -1) {
        results.push({
          name: `toolsCalled.ordered[${tool}]`,
          status: 'fail',
          message: `Tool '${tool}' not found in expected order after position ${pos}`,
          expected: spec.tools,
          actual: calledNames,
        });
        break;
      }
      pos = idx + 1;
    }
    if (results.length === 0) {
      results.push({ name: 'toolsCalled.ordered', status: 'pass' });
    }
  } else {
    // Each tool must appear at least once
    for (const tool of spec.tools) {
      if (!calledNames.includes(tool)) {
        results.push({
          name: `toolsCalled[${tool}]`,
          status: 'fail',
          message: `Expected tool '${tool}' was never called`,
          expected: tool,
          actual: calledNames,
        });
      } else {
        results.push({ name: `toolsCalled[${tool}]`, status: 'pass' });
      }
    }
  }

  return results.length > 0 ? results : [{ name: 'toolsCalled', status: 'pass' }];
}

function assertStepSpec(steps: TraceStep[], spec: StepAssertion): AssertionResult[] {
  const step = resolveStep(steps, spec.at);
  const label = `steps[${spec.at}]`;
  const results: AssertionResult[] = [];

  if (!step) {
    return [{ name: label, status: 'fail', message: `No step at index ${spec.at}` }];
  }

  if (spec.type && step.type !== spec.type) {
    results.push({
      name: `${label}.type`,
      status: 'fail',
      expected: spec.type,
      actual: step.type,
      message: `Expected step type '${spec.type}', got '${step.type}'`,
    });
  }

  if (spec.toolName && step.toolName !== spec.toolName) {
    results.push({
      name: `${label}.toolName`,
      status: 'fail',
      expected: spec.toolName,
      actual: step.toolName,
      message: `Expected toolName '${spec.toolName}', got '${step.toolName ?? 'undefined'}'`,
    });
  }

  if (spec.outputPath !== undefined) {
    const actual = resolvePath(step.outputs, spec.outputPath);
    if (spec.outputValue !== undefined && !deepEqual(actual, spec.outputValue)) {
      results.push({
        name: `${label}.output.${spec.outputPath}`,
        status: 'fail',
        expected: spec.outputValue,
        actual,
        message: `Output path '${spec.outputPath}' mismatch`,
      });
    } else if (spec.outputValue !== undefined) {
      results.push({ name: `${label}.output.${spec.outputPath}`, status: 'pass' });
    }
  }

  if (spec.latencyMs !== undefined && step.latencyMs !== undefined) {
    results.push(checkRange(step.latencyMs, spec.latencyMs, `${label}.latencyMs`));
  }

  return results.length > 0 ? results : [{ name: label, status: 'pass' }];
}

function assertOutput(steps: TraceStep[], spec: OutputAssertion): AssertionResult {
  const last = steps[steps.length - 1];
  if (!last) {
    return { name: 'output', status: 'fail', message: 'No steps in session' };
  }

  const value = resolvePath(last.outputs, spec.path);

  if (spec.equals !== undefined) {
    if (!deepEqual(value, spec.equals)) {
      return { name: `output.${spec.path}`, status: 'fail', expected: spec.equals, actual: value, message: `output path '${spec.path}' deep-equal failed` };
    }
    return { name: `output.${spec.path}`, status: 'pass' };
  }

  if (spec.contains !== undefined) {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (!str.includes(spec.contains)) {
      return { name: `output.${spec.path}`, status: 'fail', expected: `contains "${spec.contains}"`, actual: str };
    }
    return { name: `output.${spec.path}`, status: 'pass' };
  }

  if (spec.matches !== undefined) {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    const re = new RegExp(spec.matches);
    if (!re.test(str)) {
      return { name: `output.${spec.path}`, status: 'fail', expected: `matches /${spec.matches}/`, actual: str };
    }
    return { name: `output.${spec.path}`, status: 'pass' };
  }

  return { name: `output.${spec.path}`, status: 'skip', message: 'No output assertion condition specified' };
}

// ── Main evaluator ────────────────────────────────────────────────────────────

export function evaluate(session: TraceSession, assertions: AssertionSet): AssertionResult[] {
  const results: AssertionResult[] = [];

  if (assertions.stepCount !== undefined) {
    results.push(assertStepCount(session.steps, assertions.stepCount));
  }

  if (assertions.tokenCount !== undefined) {
    results.push(assertTokenCount(session, assertions.tokenCount));
  }

  if (assertions.durationMs !== undefined) {
    results.push(assertDuration(session, assertions.durationMs));
  }

  if (assertions.noErrors === true) {
    results.push(assertNoErrors(session.steps));
  }

  if (assertions.toolsCalled) {
    results.push(...assertToolsCalled(session.steps, assertions.toolsCalled));
  }

  if (assertions.steps) {
    for (const stepSpec of assertions.steps) {
      results.push(...assertStepSpec(session.steps, stepSpec));
    }
  }

  if (assertions.output) {
    results.push(assertOutput(session.steps, assertions.output));
  }

  return results;
}
