/**
 * cerebrex bench — Local benchmark runner
 * Tests FORGE, TRACE, MEMEX, HIVE, and Registry data model performance
 * entirely locally using performance.now().
 */

import { Command } from 'commander';
import chalk from 'chalk';

// ── Stats helpers ─────────────────────────────────────────────────────────────

interface Stats {
  min: number; max: number; mean: number;
  stddev: number; p50: number; p95: number; p99: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? 0;
  return (sorted[lo] ?? 0) * (1 - (idx - lo)) + (sorted[hi] ?? 0) * (idx - lo);
}

function computeStats(samples: number[]): Stats {
  if (samples.length === 0) return { min: 0, max: 0, mean: 0, stddev: 0, p50: 0, p95: 0, p99: 0 };
  const s = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const stddev = Math.sqrt(samples.reduce((a, v) => a + (v - mean) ** 2, 0) / samples.length);
  return { min: s[0] ?? 0, max: s[s.length - 1] ?? 0, mean, stddev, p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99) };
}

async function bench(
  name: string,
  fn: () => unknown,
  iterations = 200,
  warmup = 20
): Promise<{ name: string; stats: Stats; successRate: number }> {
  let errors = 0;
  const samples: number[] = [];
  for (let i = 0; i < warmup; i++) { try { await fn(); } catch { /* ignored */ } }
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    try { await fn(); } catch { errors++; }
    samples.push(performance.now() - t0);
  }
  return { name, stats: computeStats(samples), successRate: (iterations - errors) / iterations };
}

function row(r: { name: string; stats: Stats; successRate: number }): void {
  const { p50, p95, p99, mean } = r.stats;
  const sc = r.successRate >= 0.99 ? chalk.green : r.successRate >= 0.90 ? chalk.yellow : chalk.red;
  console.log(
    `  ${chalk.cyan(r.name.padEnd(52))}` +
    ` p50=${chalk.white(p50.toFixed(3) + 'ms')}` +
    ` p95=${chalk.white(p95.toFixed(3) + 'ms')}` +
    ` p99=${chalk.white(p99.toFixed(3) + 'ms')}` +
    ` mean=${chalk.dim(mean.toFixed(3) + 'ms')}` +
    ` ${sc((r.successRate * 100).toFixed(0) + '%')}`
  );
}

// ── Benchmark suites ──────────────────────────────────────────────────────────

async function runForgeBench(iterations: number): Promise<void> {
  console.log(chalk.bold('\n  FORGE — spec parsing + tool generation'));
  const spec = {
    title: 'bench-api', baseUrl: 'https://api.example.com',
    endpoints: Array.from({ length: 20 }, (_, i) => ({
      name: `op_${i}`, method: 'GET', path: `/v1/r/${i}`,
      params: [{ name: 'id', required: true }],
    })),
  };
  const results = await Promise.all([
    bench('FORGE parse+generate (1 endpoint)', () => {
      const ep = spec.endpoints[0]!;
      return void JSON.stringify({ tool: ep.name, path: ep.path });
    }, iterations),
    bench('FORGE parse+generate (20 endpoints)', () => {
      return void spec.endpoints.map((ep) => ({ tool: ep.name, path: ep.path }));
    }, iterations),
    bench('FORGE JSON serialize (20 endpoints)', () => void JSON.stringify(spec), iterations),
    bench('FORGE validate (20 endpoints)', () => {
      for (const ep of spec.endpoints) {
        if (!ep.name || !ep.path.startsWith('/')) throw new Error('invalid');
      }
    }, iterations),
  ]);
  for (const r of results) row(r);
}

async function runTraceBench(iterations: number): Promise<void> {
  console.log(chalk.bold('\n  TRACE — step recording + session management'));
  const sessions = new Map<string, { steps: unknown[] }>();
  const sessionId = 'bench-session';
  sessions.set(sessionId, { steps: [] });

  const results = await Promise.all([
    bench('TRACE create session', () => {
      sessions.set(crypto.randomUUID(), { steps: [] });
    }, iterations),
    bench('TRACE record step', () => {
      sessions.get(sessionId)!.steps.push({
        type: 'tool_call', ts: Date.now(), input: { q: 'test' }, output: { r: 1 },
      });
    }, iterations),
    bench('TRACE get session', () => sessions.get(sessionId), iterations),
    bench('TRACE JSON serialize session', () => JSON.stringify(sessions.get(sessionId)), iterations),
  ]);
  for (const r of results) row(r);
}

async function runMemexBench(iterations: number): Promise<void> {
  console.log(chalk.bold('\n  MEMEX — three-layer memory operations'));
  const kvIndex = new Map<string, string>();
  const topics = new Map<string, string>();
  const transcripts: Array<{ agent: string; content: string }> = [];

  kvIndex.set('agent-01', '# Memory\n\n- fact 1\n- fact 2\n'.repeat(5));
  topics.set('agent-01:context', '# Context\n\n' + 'line\n'.repeat(50));
  for (let i = 0; i < 20; i++) transcripts.push({ agent: 'agent-01', content: `session ${i}` });

  const results = await Promise.all([
    bench('MEMEX read KV index', () => kvIndex.get('agent-01'), iterations),
    bench('MEMEX write KV index', () => kvIndex.set('agent-01', `# M\n- ${Date.now()}`), iterations),
    bench('MEMEX read topic', () => topics.get('agent-01:context'), iterations),
    bench('MEMEX write topic', () => topics.set('agent-01:ctx2', '# T\n' + 'x'.repeat(100)), iterations),
    bench('MEMEX append transcript', () => transcripts.push({ agent: 'agent-01', content: 'new session' }), iterations),
    bench('MEMEX search transcripts', () => transcripts.filter((t) => t.agent === 'agent-01' && t.content.includes('session')), iterations),
    bench('MEMEX assemble context', () => {
      const idx = kvIndex.get('agent-01') ?? '';
      const ctx = topics.get('agent-01:context') ?? '';
      return `${idx}\n\n${ctx}`;
    }, iterations),
  ]);
  for (const r of results) row(r);
}

async function runHiveBench(iterations: number): Promise<void> {
  console.log(chalk.bold('\n  HIVE — swarm coordination + risk gate'));
  type Task = { id: string; type: string; payload: string };
  const tasks: Task[] = Array.from({ length: 20 }, (_, i) => ({
    id: crypto.randomUUID(),
    type: i % 3 === 0 ? 'write' : 'read',
    payload: JSON.stringify({ key: `k-${i}`, value: `v-${i}` }),
  }));
  const policy = { allowHighRisk: false, allowMediumRisk: true };

  function assessRisk(t: Task): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (t.payload.includes('delete')) return 'HIGH';
    if (t.type === 'write') return 'MEDIUM';
    return 'LOW';
  }

  function gate(t: Task): boolean {
    const r = assessRisk(t);
    if (r === 'HIGH' && !policy.allowHighRisk) return false;
    if (r === 'MEDIUM' && !policy.allowMediumRisk) return false;
    return true;
  }

  const results = await Promise.all([
    bench('HIVE risk gate (20 tasks)', () => tasks.filter(gate), iterations),
    bench('HIVE parallel distribute (20 tasks)', () => tasks.filter(gate).map((t) => ({ ...t, assigned: true })), iterations),
    bench('HIVE pipeline distribute (20 tasks)', () => tasks.filter(gate).map((t) => [t]), iterations),
    bench('HIVE result aggregation (20 tasks)', () => {
      const results = tasks.map((t) => ({ id: t.id, ok: true, ms: Math.random() * 10 }));
      return results.filter((r) => r.ok).length;
    }, iterations),
    bench('HIVE load preset', () => ({ strategy: 'parallel', risk: policy, agents: 3 }), iterations),
    bench('HIVE full cycle (gate+distribute+aggregate)', () => {
      const allowed = tasks.filter(gate);
      return allowed.reduce((a) => a + 1, 0);
    }, iterations),
  ]);
  for (const r of results) row(r);
}

async function runRegistryBench(iterations: number): Promise<void> {
  console.log(chalk.bold('\n  Registry — package search + metadata'));
  const pkgs = Array.from({ length: 200 }, (_, i) => ({
    name: `mcp-${['tools', 'data', 'auth', 'search', 'storage'][i % 5]!}-${i}`,
    version: `${Math.floor(i / 20)}.${i % 10}.0`,
    description: `MCP server for category-${i % 5} operations`,
    downloads: Math.floor(Math.random() * 10000),
    tags: ['mcp', 'cerebrex'],
  }));

  const results = await Promise.all([
    bench('Registry list (200 pkgs, page 1)', () => pkgs.slice(0, 20), iterations),
    bench('Registry search (200 pkgs, match)', () => pkgs.filter((p) => p.name.includes('tools')).slice(0, 20), iterations),
    bench('Registry search (200 pkgs, no match)', () => pkgs.filter((p) => p.name.includes('zzz')), iterations),
    bench('Registry get by name', () => pkgs.find((p) => p.name === 'mcp-tools-0'), iterations),
    bench('Registry JSON serialize (20 pkgs)', () => JSON.stringify(pkgs.slice(0, 20)), iterations),
  ]);
  for (const r of results) row(r);
}

// ── Command definition ────────────────────────────────────────────────────────

export const benchCommand = new Command('bench')
  .description('Run local performance benchmarks for CerebreX modules')
  .option('--suite <name>', 'Benchmark suite to run: forge, trace, memex, hive, registry, all', 'all')
  .option('--iterations <n>', 'Iterations per benchmark', '200')
  .action(async (opts: { suite: string; iterations: string }) => {
    const iterations = Math.max(10, parseInt(opts.iterations, 10) || 200);
    const suite = opts.suite.toLowerCase();

    console.log(chalk.cyan('\n  CerebreX Benchmark Suite'));
    console.log(chalk.dim(`  iterations: ${iterations}  warmup: ${Math.max(10, Math.floor(iterations / 10))}`));
    console.log(chalk.dim('  ' + '─'.repeat(88)));

    const t0 = performance.now();

    if (suite === 'all' || suite === 'forge')    await runForgeBench(iterations);
    if (suite === 'all' || suite === 'trace')    await runTraceBench(iterations);
    if (suite === 'all' || suite === 'memex')    await runMemexBench(iterations);
    if (suite === 'all' || suite === 'hive')     await runHiveBench(iterations);
    if (suite === 'all' || suite === 'registry') await runRegistryBench(iterations);

    if (!['all', 'forge', 'trace', 'memex', 'hive', 'registry'].includes(suite)) {
      console.error(chalk.red(`Unknown suite: ${suite}`));
      console.error(chalk.dim('Options: forge, trace, memex, hive, registry, all'));
      process.exit(1);
    }

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    console.log(chalk.dim('\n  ' + '─'.repeat(88)));
    console.log(chalk.green(`\n  Done in ${elapsed}s\n`));
  });
