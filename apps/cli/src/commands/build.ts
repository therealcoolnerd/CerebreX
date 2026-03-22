import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { ForgeEngine } from '../core/forge/generator.js';
import { parseSpec } from '../core/forge/parser.js';
import { validateSpec } from '../core/forge/validator.js';

export const buildCommand = new Command('build')
  .description('Generate a production MCP server from an OpenAPI spec')
  .option('-s, --spec <path>', 'Path or URL to OpenAPI 3.x / Swagger spec (required)')
  .option('-o, --output <dir>', 'Output directory', './cerebrex-output')
  .option('-n, --name <name>', 'MCP server name (defaults to spec title)')
  .option(
    '-t, --transport <type>',
    'Transport type: stdio | sse | streamable-http',
    'streamable-http'
  )
  .option('-a, --auth <scheme>', 'Auth scheme: none | apikey | bearer | oauth2', 'none')
  .action(async (options) => {
    console.log(chalk.cyan('\n🔨 FORGE — MCP Server Generator\n'));

    if (!options.spec) {
      console.error(chalk.red('Error: --spec is required.'));
      console.error(chalk.dim('Example: cerebrex build --spec ./api.json'));
      console.error(chalk.dim('Example: cerebrex build --spec https://api.example.com/openapi.json'));
      process.exit(1);
    }

    const outputDir = path.resolve(process.cwd(), options.output);

    // ── Step 1: Parse ────────────────────────────────────────────────────────
    const parseSpinner = ora('Parsing OpenAPI spec...').start();
    let spec;
    try {
      spec = await parseSpec(options.spec);
      parseSpinner.succeed(
        chalk.green(`Parsed spec: ${chalk.bold(spec.title)} (${spec.endpoints.length} endpoints)`)
      );
    } catch (err) {
      parseSpinner.fail(chalk.red('Failed to parse spec'));
      console.error(chalk.dim((err as Error).message));
      process.exit(1);
    }

    // ── Step 2: Validate ─────────────────────────────────────────────────────
    const validateSpinner = ora('Validating spec...').start();
    try {
      const issues = await validateSpec(spec);
      if (issues.length > 0) {
        validateSpinner.warn(chalk.yellow(`Spec has ${issues.length} warning(s)`));
        issues.forEach((issue) => console.warn(chalk.dim(`  ⚠ ${issue}`)));
      } else {
        validateSpinner.succeed(chalk.green('Spec validation passed'));
      }
    } catch (err) {
      validateSpinner.fail(chalk.red('Spec validation failed'));
      console.error(chalk.dim((err as Error).message));
      process.exit(1);
    }

    // ── Step 3: Generate ─────────────────────────────────────────────────────
    const generateSpinner = ora('Generating MCP server...').start();
    try {
      const engine = new ForgeEngine({
        spec,
        outputDir,
        serverName: options.name || spec.title,
        transport: options.transport,
        authScheme: options.auth,
      });

      const result = await engine.generate();
      generateSpinner.succeed(
        chalk.green(`Generated ${result.toolCount} MCP tools → ${chalk.bold(outputDir)}`)
      );

      // ── Summary ─────────────────────────────────────────────────────────
      console.log('\n' + chalk.cyan('─'.repeat(60)));
      console.log(chalk.bold('  ✅ MCP Server Generated Successfully\n'));
      console.log(`  ${chalk.dim('Name:')}      ${result.serverName}`);
      console.log(`  ${chalk.dim('Tools:')}     ${result.toolCount}`);
      console.log(`  ${chalk.dim('Transport:')} ${result.transport}`);
      console.log(`  ${chalk.dim('Output:')}    ${outputDir}`);
      console.log('\n' + chalk.cyan('  Next steps:'));
      console.log(chalk.dim('  1. Review the generated server:  cat cerebrex-output/src/server.ts'));
      console.log(chalk.dim('  2. Validate it:                  cerebrex validate'));
      console.log(chalk.dim('  3. Deploy it:                    cerebrex deploy'));
      console.log(chalk.cyan('─'.repeat(60)) + '\n');
    } catch (err) {
      generateSpinner.fail(chalk.red('Code generation failed'));
      console.error(chalk.dim((err as Error).message));
      process.exit(1);
    }
  });
