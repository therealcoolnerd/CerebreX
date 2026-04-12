/**
 * CerebreX TEST — Test Engine
 * Loads test specs, replays fixtures, and runs assertions.
 */

import type { TraceSession, TraceStep } from '@cerebrex/types';
import type {
  TestSpec,
  TestCase,
  TestCaseResult,
  TestSuiteResult,
  RunOptions,
} from './types.js';
import { evaluate } from './assertions.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parse as parseYaml } from 'yaml';
import crypto from 'crypto';

const TRACES_DIR = path.join(os.homedir(), '.cerebrex', 'traces');
const TESTS_DIR = path.join(os.homedir(), '.cerebrex', 'tests');

// ── Spec loading ──────────────────────────────────────────────────────────────

export function loadSpec(specPath: string): TestSpec {
  const abs = path.resolve(specPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Test spec not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf-8');
  const ext = path.extname(abs).toLowerCase();

  let parsed: unknown;
  if (ext === '.json') {
    parsed = JSON.parse(raw);
  } else if (ext === '.yaml' || ext === '.yml') {
    parsed = parseYaml(raw) as unknown;
  } else {
    throw new Error(`Unsupported spec format: ${ext} (use .yaml, .yml, or .json)`);
  }

  return validateSpec(parsed);
}

function validateSpec(raw: unknown): TestSpec {
  if (!raw || typeof raw !== 'object') throw new Error('Spec must be an object');
  const spec = raw as Record<string, unknown>;
  if (!spec.name || typeof spec.name !== 'string') throw new Error('Spec requires a "name" field');
  if (!Array.isArray(spec.tests)) throw new Error('Spec requires a "tests" array');
  return spec as unknown as TestSpec;
}

// ── Fixture loading ───────────────────────────────────────────────────────────

function loadFixture(fixturePath: string, specFileDir: string): TraceSession {
  // Resolve relative to spec file location first, then absolute
  const candidates = [
    path.resolve(specFileDir, fixturePath),
    path.resolve(TRACES_DIR, fixturePath),
    path.resolve(TRACES_DIR, fixturePath.endsWith('.json') ? fixturePath : `${fixturePath}.json`),
    path.resolve(fixturePath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as TraceSession;
    }
  }

  throw new Error(
    `Fixture not found: "${fixturePath}"\n` +
    `  Looked in:\n${candidates.map((c) => `    ${c}`).join('\n')}\n` +
    `  Run: cerebrex test record <session-id>  to create a fixture`
  );
}

// ── Inline step replay ────────────────────────────────────────────────────────

function buildSessionFromSteps(testCase: TestCase): TraceSession {
  const steps: TraceStep[] = (testCase.steps ?? []).map((s) => ({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: s.type,
    toolName: s.toolName,
    inputs: s.inputs,
    outputs: s.outputs,
    tokens: s.tokens ?? 0,
    latencyMs: s.latencyMs ?? 0,
  }));

  return {
    sessionId: `test-${testCase.name.replace(/\s+/g, '-').toLowerCase()}`,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationMs: steps.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0),
    steps,
    totalTokens: steps.reduce((sum, s) => sum + (s.tokens ?? 0), 0),
  };
}

// ── Single test runner ────────────────────────────────────────────────────────

async function runTestCase(
  testCase: TestCase,
  specFileDir: string,
  options: RunOptions
): Promise<TestCaseResult> {
  const startMs = Date.now();

  // Skip by tag
  if (options.tag && !testCase.tags?.includes(options.tag)) {
    return {
      name: testCase.name,
      status: 'skip',
      durationMs: 0,
      assertions: [{ name: 'tag-filter', status: 'skip', message: `Skipped: no tag '${options.tag}'` }],
    };
  }

  let session: TraceSession;
  try {
    if (testCase.fixture) {
      session = loadFixture(testCase.fixture, specFileDir);
    } else if (testCase.steps && testCase.steps.length > 0) {
      session = buildSessionFromSteps(testCase);
    } else {
      throw new Error('Test case requires either "fixture" or "steps"');
    }
  } catch (err) {
    return {
      name: testCase.name,
      status: 'error',
      durationMs: Date.now() - startMs,
      assertions: [],
      error: (err as Error).message,
    };
  }

  // Apply timeout
  const timeoutMs = testCase.timeoutMs ?? 30_000;
  const assertions = await Promise.race([
    Promise.resolve(evaluate(session, testCase.assert)),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Test timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]).catch((err: Error): ReturnType<typeof evaluate> => {
    return [{ name: 'timeout', status: 'fail', message: err.message }];
  });

  const failed = assertions.filter((a) => a.status === 'fail');

  return {
    name: testCase.name,
    status: failed.length > 0 ? 'fail' : 'pass',
    durationMs: Date.now() - startMs,
    assertions,
  };
}

// ── Suite runner ──────────────────────────────────────────────────────────────

export async function runSpec(
  specPath: string,
  options: RunOptions = {}
): Promise<TestSuiteResult> {
  const spec = loadSpec(specPath);
  const specFileDir = path.dirname(path.resolve(specPath));
  const startTime = new Date().toISOString();
  const suiteStart = Date.now();

  const testResults: TestCaseResult[] = [];
  let passed = 0, failed = 0, errors = 0, skipped = 0;

  for (const testCase of spec.tests) {
    const result = await runTestCase(testCase, specFileDir, options);
    testResults.push(result);

    if (result.status === 'pass') passed++;
    else if (result.status === 'fail') failed++;
    else if (result.status === 'error') errors++;
    else skipped++;

    if (options.bail && (result.status === 'fail' || result.status === 'error')) break;
  }

  return {
    suiteName: spec.name,
    specFile: path.resolve(specPath),
    startTime,
    durationMs: Date.now() - suiteStart,
    passed,
    failed,
    errors,
    skipped,
    tests: testResults,
  };
}

// ── Record: snapshot a saved trace as a test fixture ─────────────────────────

export function recordFixture(sessionId: string): string {
  const src = path.join(TRACES_DIR, `${sessionId}.json`);
  if (!fs.existsSync(src)) {
    throw new Error(
      `Trace session '${sessionId}' not found.\n` +
      `  Run: cerebrex trace start --session ${sessionId}  to record one first.`
    );
  }

  fs.mkdirSync(TESTS_DIR, { recursive: true });
  const dest = path.join(TESTS_DIR, `${sessionId}.fixture.json`);
  fs.copyFileSync(src, dest);
  return dest;
}

// ── List all spec files ───────────────────────────────────────────────────────

export interface SpecInfo {
  file: string;
  name: string;
  testCount: number;
  modifiedAt: string;
}

export function listSpecs(searchDir?: string): SpecInfo[] {
  const dirs = [searchDir ?? process.cwd(), TESTS_DIR].filter(Boolean) as string[];
  const found: SpecInfo[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(
        (f) => (f.endsWith('.test.yaml') || f.endsWith('.test.yml') || f.endsWith('.test.json')) && !seen.has(f)
      );
      for (const file of files) {
        const fullPath = path.join(dir, file);
        seen.add(file);
        try {
          const spec = loadSpec(fullPath);
          const stat = fs.statSync(fullPath);
          found.push({
            file: fullPath,
            name: spec.name,
            testCount: spec.tests.length,
            modifiedAt: stat.mtime.toISOString(),
          });
        } catch {
          // unparseable spec — skip
        }
      }
    } catch {
      // unreadable dir — skip
    }
  }

  return found.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
