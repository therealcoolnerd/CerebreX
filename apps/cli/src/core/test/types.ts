/**
 * CerebreX TEST — Type Definitions
 * Schema for test specs, assertion results, and run reports.
 */

// ── Test Spec (what you write in .yaml) ──────────────────────────────────────

export interface TestSpec {
  /** Display name for the test suite */
  name: string;
  /** Optional description */
  description?: string;
  /** Version of the spec format */
  version?: string;
  /** Individual test cases */
  tests: TestCase[];
}

export interface TestCase {
  /** Unique name for this test */
  name: string;
  /** Optional human description */
  description?: string;
  /**
   * Fixture: path to a recorded .json trace file, or inline steps.
   * cerebrex test record <session> writes this file automatically.
   */
  fixture?: string;
  /** Inline steps to replay (alternative to fixture) */
  steps?: ReplayStep[];
  /** Assertions to evaluate after replay */
  assert: AssertionSet;
  /** Max ms allowed for the full replay before timeout */
  timeoutMs?: number;
  /** Tags for filtering: cerebrex test run --tag smoke */
  tags?: string[];
}

export interface ReplayStep {
  type: 'tool_call' | 'tool_result' | 'llm_request' | 'llm_response' | 'error';
  toolName?: string;
  inputs?: Record<string, unknown>;
  outputs?: unknown;
  tokens?: number;
  latencyMs?: number;
}

// ── Assertions ────────────────────────────────────────────────────────────────

export interface AssertionSet {
  /** Total number of steps expected */
  stepCount?: number | RangeAssertion;
  /** Total tokens consumed */
  tokenCount?: number | RangeAssertion;
  /** Checks on individual steps by index or type */
  steps?: StepAssertion[];
  /** Session-level latency bounds */
  durationMs?: RangeAssertion;
  /** Checks that specific tool names appear (in any order unless ordered:true) */
  toolsCalled?: ToolsCalledAssertion;
  /** Checks that no error steps appear */
  noErrors?: boolean;
  /** Custom output checks on the final step */
  output?: OutputAssertion;
}

export interface RangeAssertion {
  min?: number;
  max?: number;
  exact?: number;
}

export interface StepAssertion {
  /** Step index (0-based) or "last" */
  at: number | 'last';
  type?: string;
  toolName?: string;
  /** Check a specific output field using dot-notation path */
  outputPath?: string;
  /** Expected value at outputPath (deep-equal) */
  outputValue?: unknown;
  /** Latency bound for this step */
  latencyMs?: RangeAssertion;
}

export interface ToolsCalledAssertion {
  tools: string[];
  /** If true, tools must appear in the given order */
  ordered?: boolean;
  /** If true, ONLY these tools may appear (no unexpected tool calls) */
  exact?: boolean;
}

export interface OutputAssertion {
  /** JSON dot-path into the last step's outputs */
  path: string;
  /** Must equal this value (deep strict equal) */
  equals?: unknown;
  /** Must contain this string (if output is a string) */
  contains?: string;
  /** Must match this regex */
  matches?: string;
}

// ── Assertion Results ─────────────────────────────────────────────────────────

export type AssertionStatus = 'pass' | 'fail' | 'skip';

export interface AssertionResult {
  name: string;
  status: AssertionStatus;
  message?: string;
  expected?: unknown;
  actual?: unknown;
}

// ── Test Run Results ──────────────────────────────────────────────────────────

export interface TestCaseResult {
  name: string;
  status: 'pass' | 'fail' | 'error' | 'skip';
  durationMs: number;
  assertions: AssertionResult[];
  error?: string;
}

export interface TestSuiteResult {
  suiteName: string;
  specFile: string;
  startTime: string;
  durationMs: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  tests: TestCaseResult[];
}

// ── Reporter Options ──────────────────────────────────────────────────────────

export interface RunOptions {
  /** Output JSON instead of terminal formatting */
  json?: boolean;
  /** Only run tests with this tag */
  tag?: string;
  /** Stop after first failure */
  bail?: boolean;
  /** Verbose assertion output */
  verbose?: boolean;
  /** CI mode: JSON to stdout, no colors */
  ci?: boolean;
}
