/**
 * CerebreX TEST — Reporter
 * Terminal output (with colors) and JSON output (for CI).
 */

import chalk from 'chalk';
import type { TestSuiteResult, TestCaseResult, AssertionResult } from './types.js';

// ── Symbols ───────────────────────────────────────────────────────────────────

const PASS = chalk.green('✓');
const FAIL = chalk.red('✗');
const ERROR = chalk.red('⚠');
const SKIP = chalk.dim('–');

// ── Terminal reporter ─────────────────────────────────────────────────────────

export function printSuiteResult(result: TestSuiteResult, verbose = false): void {
  console.log('');
  console.log(chalk.cyan(`  ⬡ TEST — ${result.suiteName}`));
  console.log(chalk.dim(`    ${result.specFile}`));
  console.log('');

  for (const test of result.tests) {
    printTestResult(test, verbose);
  }

  printSummary(result);
}

function printTestResult(test: TestCaseResult, verbose: boolean): void {
  const icon =
    test.status === 'pass' ? PASS :
    test.status === 'fail' ? FAIL :
    test.status === 'error' ? ERROR : SKIP;

  const dur = test.durationMs > 0 ? chalk.dim(` (${test.durationMs}ms)`) : '';

  console.log(`  ${icon} ${chalk.bold(test.name)}${dur}`);

  if (test.status === 'error' && test.error) {
    console.log(chalk.red(`      Error: ${test.error}`));
  }

  if (test.status === 'fail' || verbose) {
    for (const a of test.assertions) {
      if (a.status === 'fail') {
        console.log(chalk.red(`      ✗ ${a.name}: ${a.message ?? ''}`));
        if (a.expected !== undefined) {
          console.log(chalk.dim(`          expected: `) + chalk.yellow(JSON.stringify(a.expected)));
        }
        if (a.actual !== undefined) {
          console.log(chalk.dim(`          actual:   `) + chalk.red(JSON.stringify(a.actual)));
        }
      } else if (verbose && a.status === 'pass') {
        console.log(chalk.dim(`      ✓ ${a.name}`));
      } else if (a.status === 'skip') {
        console.log(chalk.dim(`      – ${a.name}: ${a.message ?? 'skipped'}`));
      }
    }
  }
}

function printSummary(result: TestSuiteResult): void {
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────'));

  const total = result.passed + result.failed + result.errors + result.skipped;
  const parts: string[] = [];

  if (result.passed > 0) parts.push(chalk.green(`${result.passed} passed`));
  if (result.failed > 0) parts.push(chalk.red(`${result.failed} failed`));
  if (result.errors > 0) parts.push(chalk.red(`${result.errors} error${result.errors > 1 ? 's' : ''}`));
  if (result.skipped > 0) parts.push(chalk.dim(`${result.skipped} skipped`));

  console.log(`  ${parts.join(chalk.dim(', '))} ${chalk.dim(`(${total} total, ${result.durationMs}ms)`)}`);

  if (result.failed > 0 || result.errors > 0) {
    console.log(chalk.red(`\n  FAIL\n`));
  } else {
    console.log(chalk.green(`\n  PASS\n`));
  }
}

// ── JSON reporter (CI mode) ───────────────────────────────────────────────────

export function printJsonResult(result: TestSuiteResult): void {
  console.log(JSON.stringify(result, null, 2));
}

// ── Compact inline summary (for multiple suites) ──────────────────────────────

export function printMultiSuiteSummary(results: TestSuiteResult[]): void {
  const total = { passed: 0, failed: 0, errors: 0, skipped: 0, durationMs: 0 };

  for (const r of results) {
    total.passed += r.passed;
    total.failed += r.failed;
    total.errors += r.errors;
    total.skipped += r.skipped;
    total.durationMs += r.durationMs;
  }

  console.log(chalk.dim('  ════════════════════════════════════'));
  console.log(chalk.bold(`  ${results.length} suite${results.length > 1 ? 's' : ''}`));

  if (total.passed > 0) console.log(chalk.green(`  ✓ ${total.passed} passed`));
  if (total.failed > 0) console.log(chalk.red(`  ✗ ${total.failed} failed`));
  if (total.errors > 0) console.log(chalk.red(`  ⚠ ${total.errors} errors`));
  if (total.skipped > 0) console.log(chalk.dim(`  – ${total.skipped} skipped`));
  console.log(chalk.dim(`  ${total.durationMs}ms total`));
  console.log('');
}

// ── Exit code helper ──────────────────────────────────────────────────────────

export function exitCode(results: TestSuiteResult[]): number {
  for (const r of results) {
    if (r.failed > 0 || r.errors > 0) return 1;
  }
  return 0;
}
