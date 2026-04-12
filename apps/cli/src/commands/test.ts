/**
 * CerebreX TEST — CLI Command
 * Agent test runner with trace replay and structured assertions.
 *
 * Subcommands:
 *   cerebrex test run [spec...]       — run one or more spec files
 *   cerebrex test record <session>    — snapshot a trace as a reusable fixture
 *   cerebrex test list                — list discovered spec files
 *   cerebrex test show <spec>         — show all test cases in a spec file
 *   cerebrex test init                — scaffold a starter spec file
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runSpec, recordFixture, listSpecs, loadSpec } from '../core/test/engine.js';
import { printSuiteResult, printJsonResult, printMultiSuiteSummary, exitCode } from '../core/test/reporter.js';
import type { RunOptions } from '../core/test/types.js';

const TESTS_DIR = path.join(os.homedir(), '.cerebrex', 'tests');

export const testCommand = new Command('test')
  .description('Agent test runner — replay traces and assert expected behaviour');

// ── cerebrex test run [spec...] ───────────────────────────────────────────────

testCommand
  .command('run [specs...]')
  .description('Run one or more test spec files (.test.yaml / .test.json)')
  .option('--tag <tag>', 'Only run tests with this tag')
  .option('--bail', 'Stop after the first failure')
  .option('--verbose', 'Show all assertion results, not just failures')
  .option('--json', 'Output results as JSON (implies --ci)')
  .option('--ci', 'CI mode: JSON to stdout, exit 1 on any failure')
  .action(async (specs: string[], options) => {
    const runOptions: RunOptions = {
      tag: options.tag as string | undefined,
      bail: Boolean(options.bail),
      verbose: Boolean(options.verbose),
      json: Boolean(options.json) || Boolean(options.ci),
      ci: Boolean(options.ci),
    };

    // Discover spec files
    let specFiles: string[] = specs;

    if (specFiles.length === 0) {
      // Auto-discover in cwd and TESTS_DIR
      const discovered = listSpecs();
      if (discovered.length === 0) {
        console.error(chalk.red('\n  No test specs found.\n'));
        console.error(chalk.dim('  Create one: cerebrex test init'));
        console.error(chalk.dim('  Or specify a file: cerebrex test run my-agent.test.yaml\n'));
        process.exit(1);
      }
      specFiles = discovered.map((s) => s.file);
    }

    if (!runOptions.json) {
      console.log(chalk.cyan(`\n  ⬡ CerebreX TEST\n`));
      console.log(chalk.dim(`  Running ${specFiles.length} spec file${specFiles.length > 1 ? 's' : ''}\n`));
    }

    const results = [];

    for (const specFile of specFiles) {
      try {
        const result = await runSpec(specFile, runOptions);
        results.push(result);

        if (runOptions.json) {
          printJsonResult(result);
        } else {
          printSuiteResult(result, runOptions.verbose);
        }

        if (runOptions.bail && (result.failed > 0 || result.errors > 0)) break;
      } catch (err) {
        if (runOptions.json) {
          console.log(JSON.stringify({ error: (err as Error).message, specFile }));
        } else {
          console.error(chalk.red(`\n  Error loading spec: ${specFile}`));
          console.error(chalk.dim(`  ${(err as Error).message}\n`));
        }
        process.exit(1);
      }
    }

    if (!runOptions.json && results.length > 1) {
      printMultiSuiteSummary(results);
    }

    process.exit(exitCode(results));
  });

// ── cerebrex test record <session> ────────────────────────────────────────────

testCommand
  .command('record <session>')
  .description('Snapshot a saved trace session as a reusable test fixture')
  .action((session: string) => {
    try {
      const dest = recordFixture(session);
      console.log(chalk.green(`\n  ✅ Fixture recorded`));
      console.log(chalk.dim(`     session: ${session}`));
      console.log(chalk.dim(`     saved:   ${dest}`));
      console.log('');
      console.log(chalk.cyan('  Reference it in a spec:'));
      console.log(chalk.white(`    fixture: ${session}.fixture.json`));
      console.log('');
    } catch (err) {
      console.error(chalk.red(`\n  ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

// ── cerebrex test list ────────────────────────────────────────────────────────

testCommand
  .command('list')
  .description('List all discovered test spec files')
  .option('-d, --dir <path>', 'Directory to search (defaults to cwd + ~/.cerebrex/tests)')
  .action((options) => {
    const specs = listSpecs(options.dir as string | undefined);

    if (specs.length === 0) {
      console.log(chalk.dim('\n  No test specs found.\n'));
      console.log(chalk.dim('  Create one: cerebrex test init\n'));
      return;
    }

    console.log(chalk.cyan(`\n  ⬡ Test Specs (${specs.length})\n`));
    for (const s of specs) {
      const relPath = path.relative(process.cwd(), s.file);
      const display = relPath.startsWith('..') ? s.file : relPath;
      console.log(
        `  ${chalk.bold(s.name.padEnd(35))} ` +
        chalk.dim(`${s.testCount} test${s.testCount !== 1 ? 's' : ''}  `) +
        chalk.dim(display)
      );
    }
    console.log('');
  });

// ── cerebrex test show <spec> ─────────────────────────────────────────────────

testCommand
  .command('show <spec>')
  .description('Show all test cases defined in a spec file')
  .action((specArg: string) => {
    try {
      const spec = loadSpec(specArg);
      console.log(chalk.cyan(`\n  ⬡ ${spec.name}`));
      if (spec.description) console.log(chalk.dim(`    ${spec.description}`));
      console.log('');

      for (let i = 0; i < spec.tests.length; i++) {
        const t = spec.tests[i];
        const fixture = t.fixture ? chalk.dim(` ← ${t.fixture}`) : t.steps ? chalk.dim(' ← inline steps') : '';
        const tags = t.tags ? chalk.dim(` [${t.tags.join(', ')}]`) : '';
        console.log(`  ${chalk.dim(`${i + 1}.`)} ${chalk.bold(t.name)}${fixture}${tags}`);
        if (t.description) console.log(chalk.dim(`      ${t.description}`));

        const a = t.assert;
        const parts: string[] = [];
        if (a.stepCount !== undefined) parts.push('steps');
        if (a.tokenCount !== undefined) parts.push('tokens');
        if (a.durationMs !== undefined) parts.push('duration');
        if (a.noErrors) parts.push('noErrors');
        if (a.toolsCalled) parts.push('toolsCalled');
        if (a.steps) parts.push(`${a.steps.length} step assertions`);
        if (a.output) parts.push('output');
        if (parts.length) console.log(chalk.dim(`      asserts: ${parts.join(', ')}`));
        console.log('');
      }
    } catch (err) {
      console.error(chalk.red(`\n  ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

// ── cerebrex test init ────────────────────────────────────────────────────────

testCommand
  .command('init')
  .description('Scaffold a starter test spec file in the current directory')
  .option('-n, --name <name>', 'Spec file name', 'agent.test.yaml')
  .action((options) => {
    const outFile = path.resolve(options.name as string);

    if (fs.existsSync(outFile)) {
      console.error(chalk.red(`\n  File already exists: ${outFile}\n`));
      process.exit(1);
    }

    const TEMPLATE = `# CerebreX Test Spec
# Run with: cerebrex test run ${options.name}
name: My Agent Tests
description: Assertions for my CerebreX agent

tests:
  # Example 1: assert on an inline replay
  - name: tool is called with correct input
    description: Verifies the search tool receives the right query
    steps:
      - type: tool_call
        toolName: web_search
        inputs:
          query: "CerebreX agent OS"
        latencyMs: 120
      - type: tool_result
        toolName: web_search
        outputs:
          results:
            - title: "CerebreX — Agent Infrastructure OS"
        tokens: 45
    assert:
      noErrors: true
      stepCount: 2
      toolsCalled:
        tools: [web_search]
      steps:
        - at: 0
          toolName: web_search

  # Example 2: replay from a recorded trace fixture
  # Record one with: cerebrex test record my-session
  # - name: matches recorded session
  #   fixture: my-session.fixture.json
  #   assert:
  #     noErrors: true
  #     stepCount:
  #       min: 1
  #     output:
  #       path: results.0.title
  #       contains: "CerebreX"
`;

    fs.writeFileSync(outFile, TEMPLATE, 'utf-8');
    console.log(chalk.green(`\n  ✅ Created: ${outFile}`));
    console.log('');
    console.log(chalk.cyan('  Next steps:'));
    console.log(chalk.dim(`    Edit the spec:     ${outFile}`));
    console.log(chalk.dim(`    Run it:            cerebrex test run ${options.name}`));
    console.log(chalk.dim(`    Record a fixture:  cerebrex test record <session-id>`));
    console.log('');
  });
