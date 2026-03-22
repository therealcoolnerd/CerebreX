/**
 * CerebreX TRACE — Terminal Trace Viewer
 * Renders a saved trace session as a readable timeline in the terminal.
 */

import type { TraceSession, TraceStep } from '@cerebrex/types';
import chalk from 'chalk';
import fs from 'fs';

const STEP_ICONS: Record<string, string> = {
  tool_call:     '⚙️ ',
  tool_result:   '✅ ',
  llm_request:   '🧠 ',
  llm_response:  '💬 ',
  error:         '❌ ',
};

const STEP_COLORS: Record<string, (s: string) => string> = {
  tool_call:    chalk.cyan,
  tool_result:  chalk.green,
  llm_request:  chalk.blue,
  llm_response: chalk.white,
  error:        chalk.red,
};

export class TraceViewer {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async render(): Promise<void> {
    const session: TraceSession = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));

    console.log(chalk.cyan('\n' + '═'.repeat(64)));
    console.log(chalk.bold(`  🔍 TRACE — Session: ${chalk.cyan(session.sessionId)}`));
    console.log(chalk.dim(`  Started:  ${session.startTime}`));
    if (session.endTime) {
      console.log(chalk.dim(`  Ended:    ${session.endTime}`));
      console.log(chalk.dim(`  Duration: ${session.durationMs}ms`));
    }
    console.log(chalk.dim(`  Steps:    ${session.steps.length}`));
    console.log(chalk.dim(`  Tokens:   ${session.totalTokens}`));
    console.log(chalk.cyan('═'.repeat(64)) + '\n');

    session.steps.forEach((step, i) => {
      this.renderStep(step, i + 1, session.steps.length);
    });

    if (session.steps.length === 0) {
      console.log(chalk.dim('  No steps recorded in this session.\n'));
    }

    console.log(chalk.cyan('═'.repeat(64)) + '\n');
  }

  private renderStep(step: TraceStep, index: number, total: number): void {
    const icon = STEP_ICONS[step.type] || '▸  ';
    const colorFn = STEP_COLORS[step.type] || chalk.white;
    const connector = index < total ? '│' : '└';

    console.log(`  ${connector} ${chalk.dim(String(index).padStart(2, '0'))} ${icon} ${colorFn(chalk.bold(step.type.replace('_', ' ').toUpperCase()))}`);
    console.log(`  │     ${chalk.dim(step.timestamp)}`);

    if (step.toolName) {
      console.log(`  │     ${chalk.dim('tool:')} ${chalk.cyan(step.toolName)}`);
    }
    if (step.latencyMs !== undefined) {
      console.log(`  │     ${chalk.dim('latency:')} ${step.latencyMs}ms`);
    }
    if (step.tokens) {
      console.log(`  │     ${chalk.dim('tokens:')} ${step.tokens}`);
    }
    if (step.inputs && Object.keys(step.inputs).length > 0) {
      const inputPreview = JSON.stringify(step.inputs).slice(0, 120);
      console.log(`  │     ${chalk.dim('inputs:')} ${chalk.gray(inputPreview)}${inputPreview.length >= 120 ? '…' : ''}`);
    }
    if (step.error) {
      console.log(`  │     ${chalk.red('error:')} ${step.error}`);
    }
    console.log(`  │`);
  }
}
