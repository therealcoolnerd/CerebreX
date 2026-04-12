<div align="center">

# CerebreX

### The Open-Source Agent Infrastructure OS

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![CI](https://github.com/arealcoolco/CerebreX/actions/workflows/ci.yml/badge.svg)](https://github.com/arealcoolco/CerebreX/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/cerebrex.svg)](https://www.npmjs.com/package/cerebrex)
[![Benchmarks](https://img.shields.io/badge/benchmarks-v0.9.2-brightgreen)](./BENCHMARKS.md)
[![GitHub Stars](https://img.shields.io/github/stars/arealcoolco/CerebreX?style=social)](https://github.com/arealcoolco/CerebreX)
[![Issues](https://img.shields.io/github/issues/arealcoolco/CerebreX)](https://github.com/arealcoolco/CerebreX/issues)

**Build. Test. Remember. Coordinate. Publish.**  
The complete infrastructure layer for AI agents — in one CLI.

[Quickstart](#-quickstart) · [Why CerebreX](#-why-cerebrex-vs-langchain-crewai-autogen) · [Benchmarks](./BENCHMARKS.md) · [Modules](#what-is-cerebrex) · [Python SDK](#-python-sdk) · [Roadmap](#-roadmap)

</div>

---

> **Status: v0.9.4 — Security hardening (SSRF protection, security headers, file permissions, KAIROS execution engine)**
> `npm install -g cerebrex` · `docker pull ghcr.io/arealcoolco/cerebrex` · or download a self-contained binary from [GitHub Releases](https://github.com/arealcoolco/CerebreX/releases)
>
> **Live:** Registry UI → `https://registry.therealcool.site`
> **Live:** Trace Explorer → `https://registry.therealcool.site/ui/trace`
> **Live:** Website + Whitepaper → `https://therealcool.site`

---

## What is CerebreX?

CerebreX is an open-source **Agent Infrastructure OS** — the complete toolchain developers need to build reliable, observable, and secure AI agents.

Eight modules. One CLI. One registry. One coordination layer.

| Module | Command | Status | What It Does |
|--------|---------|--------|-------------|
| 🔨 **FORGE** | `cerebrex build` | ✅ Working | Generate production MCP servers from any OpenAPI spec |
| 🔍 **TRACE** | `cerebrex trace` | ✅ Working | Record agent execution + visual web dashboard |
| 🧠 **MEMEX** | `cerebrex memex` | ✅ Working | Local + three-layer cloud memory (KV + R2 + D1) with SHA-256 integrity |
| 🔑 **AUTH** | `cerebrex auth` | ✅ Working | Secure token storage + risk classification gate on every agent action |
| 📦 **REGISTRY** | `cerebrex publish` | ✅ Working | Publish and install MCP servers (live registry + web UI) |
| 🐝 **HIVE** | `cerebrex hive` | ✅ Working | Multi-agent coordination — JWT auth, swarm strategies, risk-gated workers |
| ⏰ **KAIROS** | *(cloud worker)* | ✅ Working | Autonomous agent daemon — Durable Objects, 5-min tick loop, append-only log |
| 📋 **ULTRAPLAN** | *(cloud API)* | ✅ Working | Opus deep-thinking plan → human approval → parallel task execution |

---

## Why CerebreX vs LangChain, CrewAI, AutoGen

> Full benchmark methodology, raw numbers, and detailed comparisons: [**BENCHMARKS.md**](./BENCHMARKS.md)

### Measured Performance (v0.9.2)

```
FORGE  parse + scaffold 20-endpoint OpenAPI spec   →   0.12ms  median
MEMEX  read agent memory index                     →   0.01ms  median
MEMEX  assemble 3-layer context                    →   0.03ms  median
HIVE   classify + route 10-task swarm              →   0.09ms  median
TRACE  record tool-call step                       →  <0.01ms  median  (27,435 ops/s)
All benchmarks                                     →  100% success rate
```

### Features No Other Framework Has

| What You Need | CerebreX | LangChain | CrewAI | AutoGen |
|---------------|:--------:|:---------:|:------:|:-------:|
| Generate MCP servers from any OpenAPI spec | **FORGE** | ❌ | ❌ | ❌ |
| Three-layer cloud memory (KV + R2 + D1) | **MEMEX** | ⚠️ Paid | ❌ | ❌ |
| Nightly AI memory consolidation | **autoDream** | ❌ | ❌ | ❌ |
| Autonomous background daemon | **KAIROS** | ❌ | ❌ | ❌ |
| Risk gate on every agent action | **HIVE** | ❌ | ❌ | ❌ |
| Opus plan + human approval before execution | **ULTRAPLAN** | ❌ | ❌ | ❌ |
| Built-in MCP package registry | **REGISTRY** | ❌ | ❌ | ❌ |
| Built-in observability (free, local) | **TRACE** | ⚠️ Paid | ❌ | ❌ |
| Single CLI for all of the above | `cerebrex` | ❌ | ❌ | ❌ |

### Startup Time

| | CerebreX | LangChain | CrewAI | AutoGen |
|-|:--------:|:---------:|:------:|:-------:|
| CLI / module cold start | **~80ms** | ~2,100ms | ~3,400ms | ~1,800ms |

> CerebreX starts **26x faster** than LangChain and **42x faster** than CrewAI.  
> Bun runtime + single bundled file vs Python's large import tree.

### What the Others Don't Have

**LangChain** is a composition library — it connects existing tools but ships zero infrastructure. Memory requires external Redis/Postgres. Observability requires paying for LangSmith. There's no risk gating, no background daemons, and no MCP generation.

**CrewAI** orchestrates agents in crews but its memory is SQLite-only and in-process. There's no cloud persistence, no risk classification, and no autonomous daemon. Each agent does what it's told — nothing more.

**AutoGen** excels at multi-agent conversation but everything runs in-process. No cloud memory, no background loop, no registry, no observability beyond print statements.

**CerebreX** is purpose-built agent infrastructure: the CLI, the cloud workers, the memory layer, the coordination engine, the observatory, and the package registry — all designed together, all open source, all running on Cloudflare's free tier.

---

## ⚡ Quickstart

```bash
npm install -g cerebrex
cerebrex --help
```

Or via Docker (no Node.js or npm required):

```bash
docker pull ghcr.io/arealcoolco/cerebrex
docker run --rm ghcr.io/arealcoolco/cerebrex --version

# Mount a local directory to access spec files, configs, etc.
docker run --rm -v "$HOME/.cerebrex:/root/.cerebrex" ghcr.io/arealcoolco/cerebrex test run
```

Or build from source (requires [Bun](https://bun.sh)):

```bash
git clone https://github.com/arealcoolco/CerebreX.git
cd CerebreX/cerebrex
bun install
cd packages/types && bun run build && cd ../..
cd packages/core && bun run build && cd ../..
cd packages/registry-client && bun run build && cd ../..
cd apps/cli && bun run build
node dist/index.js --help
```

---

## 🔨 FORGE — MCP Server Generation

Generate a production-ready MCP server from any OpenAPI spec:

```bash
# From a URL
cerebrex build --spec https://petstore3.swagger.io/api/v3/openapi.json --output ./my-server

# From a local file
cerebrex build --spec ./openapi.yaml --output ./my-server
```

Output is a Cloudflare Workers project with:
- Zod input validation on every tool
- MCP-compliant stdio/SSE/Streamable HTTP transports
- Ready for `wrangler deploy`

---

## 🔍 TRACE — Agent Execution Recording

```bash
# Start recording (runs in foreground, default port 7432)
cerebrex trace start --session my-agent --port 7432

# From your agent, push steps:
# POST http://localhost:7432/step
# Body: { "type": "tool_call", "toolName": "listPets", "inputs": {}, "latencyMs": 42 }

# Stop and save
cerebrex trace stop --session my-agent

# View in terminal
cerebrex trace view --session my-agent

# View in visual web dashboard (opens browser)
cerebrex trace view --session my-agent --web

# Or use the hosted Trace Explorer (no CLI required)
# https://registry.therealcool.site/ui/trace

# List all saved sessions
cerebrex trace list
```

Traces are saved to `~/.cerebrex/traces/`.

---

## 🧠 MEMEX — Persistent Agent Memory

```bash
# Store a value
cerebrex memex set "user-pref" "dark mode" --namespace ui

# Retrieve it
cerebrex memex get "user-pref" --namespace ui

# List all memory
cerebrex memex list

# With TTL (auto-expires after 3600 seconds)
cerebrex memex set "session-ctx" "..." --ttl 3600

# Delete a key
cerebrex memex delete "user-pref" --namespace ui

# List all namespaces
cerebrex memex namespaces
```

All writes are SHA-256 checksummed. Reads verify integrity before returning.
Storage: `~/.cerebrex/memex/<namespace>.json` — local, no cloud required.

---

## 🔑 AUTH — Secure Credentials

```bash
cerebrex auth login     # store token at ~/.cerebrex/.credentials (mode 0600)
cerebrex auth status    # check current auth state
cerebrex auth logout    # remove stored token
```

`CEREBREX_TOKEN` env var always takes precedence over stored credentials.

---

## 📦 REGISTRY — Publish & Install MCP Servers

Registry API: `https://registry.therealcool.site`
Registry UI: `https://registry.therealcool.site` (browser)

```bash
cerebrex auth login                              # authenticate first
cerebrex validate ./my-server                   # validate before publishing
cerebrex validate ./my-server --strict          # + OWASP checks
cerebrex publish --dir ./my-server              # publish to registry
cerebrex install my-mcp-server                  # install from registry
```

---

## 🐝 HIVE — Multi-Agent Coordination

```bash
# 1 — Initialize and start the coordinator
cerebrex hive init --name my-hive
cerebrex hive start                     # runs on port 7433

# 2 — Register agents and get JWTs
cerebrex hive register --id researcher --name "Researcher" --capabilities search,fetch
cerebrex hive register --id writer     --name "Writer"     --capabilities write,summarize

# 3 — Start workers (each in its own terminal — they poll and execute automatically)
cerebrex hive worker --id researcher --token <JWT>
cerebrex hive worker --id writer     --token <JWT> --handler ./writer-handler.mjs

# Risk-gated workers — HIGH-risk tasks are blocked by default
cerebrex hive worker --id researcher --token <JWT>                  # blocks fetch, deploy, send
cerebrex hive worker --id researcher --token <JWT> --allow-high-risk # permits all task types
cerebrex hive worker --id researcher --token <JWT> --block-medium-risk # LOW only

# 4 — Send tasks — workers pick them up and execute
cerebrex hive send --agent researcher --type fetch    --payload '{"url":"https://api.example.com/data"}' --token <JWT>
cerebrex hive send --agent writer     --type memex-get --payload '{"key":"research-results"}' --token <JWT>

# 5 — Watch it live
cerebrex hive status
```

**Built-in task types** (no `--handler` file required):

| Type | Payload | Risk | What it does |
|------|---------|------|-------------|
| `noop` | anything | LOW | Completes immediately |
| `echo` | anything | LOW | Returns payload as result |
| `memex-get` | `{ key, namespace? }` | LOW | Reads from local MEMEX |
| `memex-set` | `{ key, value, namespace?, ttl? }` | MEDIUM | Writes to local MEMEX |
| `fetch` | `{ url, method?, headers?, body? }` | MEDIUM | Makes an HTTP request |

**Custom handlers** — drop in a JS module when you need more:

```js
// researcher-handler.mjs
export async function execute(task) {
  if (task.type === 'search') {
    const res = await fetch(`https://api.example.com/search?q=${task.payload.query}`);
    return { results: await res.json() };
  }
  throw new Error(`Unknown task type: ${task.type}`);
}
```

```bash
cerebrex hive worker --id researcher --token <JWT> --handler ./researcher-handler.mjs
```

**Swarm strategies** — launch multi-agent presets in one command:

```bash
# List all strategies and presets
cerebrex hive strategies

# Run a named preset
cerebrex hive swarm research-and-recommend "What is the best vector database in 2026?"
cerebrex hive swarm code-review-pipeline   "Review the auth module for security issues"
cerebrex hive swarm best-solution          "How should we implement rate limiting?"
cerebrex hive swarm product-spec           "Design a real-time collaboration feature"
cerebrex hive swarm content-pipeline       "Write a technical blog post about MCP"
cerebrex hive swarm contract-audit         "Audit this API contract for breaking changes"
```

| Strategy | How it works | Best for |
|----------|-------------|---------|
| `parallel` | All agents receive the same task via `Promise.all` | Independent subtasks |
| `pipeline` | Sequential refinement chain — each agent builds on the last | Research → Draft → Edit |
| `competitive` | Agents race; Opus picks the winner | Finding the optimal answer |

**With TRACE observability** — every task shows up in the visual dashboard:

```bash
cerebrex trace start --session my-run
cerebrex hive worker --id researcher --token <JWT> --trace-port 7432 --trace-session my-run
cerebrex trace view --session my-run --web
```

HIVE runs a local HTTP coordinator with JWT-signed agent authentication.
State is persisted to `~/.cerebrex/hive/state.json`.

---

## ⏰ KAIROS — Autonomous Agent Daemon

KAIROS is a cloud-native daemon built on Cloudflare Durable Objects. Each agent gets its own persistent process that wakes on a 5-minute tick, consults Claude to decide whether to act, and logs every decision to an append-only audit trail.

```bash
# Start a daemon for an agent (via the KAIROS REST API)
POST /v1/agents/my-agent/daemon/start

# Stop it
POST /v1/agents/my-agent/daemon/stop

# View the immutable tick history
GET /v1/agents/my-agent/daemon/log

# Queue a task for the daemon to pick up
POST /v1/agents/my-agent/tasks
{ "type": "fetch", "payload": { "url": "https://api.example.com/data" } }
```

**How it works:**

1. The `KairosDaemon` Durable Object wakes every 5 minutes (configurable via `TICK_INTERVAL_MS`)
2. It calls Claude with context: agent ID, tick number, pending task count
3. Claude decides whether to act (queue a proactive task) or stay quiet
4. The decision, reasoning, and result are written to an append-only D1 log — agents cannot delete their own history
5. If the Claude API is slow or errors repeatedly, the daemon backs off exponentially (1 min → 30 min cap) before resetting on the next success

---

## 📋 ULTRAPLAN — Deep-Thinking Planning

Submit a high-level goal; Claude Opus produces a comprehensive execution plan; you review and approve it; all tasks queue simultaneously.

```bash
# Submit a goal
POST /v1/ultraplan
{ "goal": "Build a competitive analysis of the top 5 vector databases for our use case" }
# → { planId: "abc123", status: "planning", message: "Opus is thinking..." }

# Poll until ready (usually 30-60 seconds)
GET /v1/ultraplan/abc123
# → { status: "pending", plan: { summary, rationale, tasks, risks, success_criteria } }

# Approve — all tasks queue simultaneously
POST /v1/ultraplan/abc123/approve

# Or reject
POST /v1/ultraplan/abc123/reject
```

The plan JSON contains:
- `summary` — one-line description
- `rationale` — why this approach
- `tasks[]` — array of `{ type, description, payload, priority }` ready to queue
- `risks[]` — things that could go wrong
- `success_criteria[]` — how to know the goal was achieved

Goals are capped at 50,000 bytes to prevent runaway Opus calls.

---

## 🌐 Web UI

The CerebreX registry includes a browser-based UI served directly from the Worker — no install required.

| URL | What It Does |
|-----|-------------|
| `/` | Registry browser — search packages, view details, copy install commands |
| `/ui/trace` | Hosted Trace Explorer — drag-and-drop JSON trace files, full visual timeline |

---

## 📊 Benchmarks

Full results with competitive analysis: [**BENCHMARKS.md**](./BENCHMARKS.md)

```bash
# Run all local benchmarks (no network needed)
cerebrex bench

# Run a specific suite
cerebrex bench --suite forge    # MCP server generation
cerebrex bench --suite memex    # three-layer memory
cerebrex bench --suite hive     # swarm coordination + risk gate
cerebrex bench --suite trace    # observability recording
cerebrex bench --suite registry # package search

# Or run directly with Bun
bun benchmarks/forge-bench.ts
bun benchmarks/memex-bench.ts
```

Benchmarks use `performance.now()`, report **p50/p95/p99 latency** and **throughput (ops/s)**, and run with warmup iterations discarded. CI runs the full suite weekly (Sundays 02:00 UTC). All results in [`benchmarks/results/`](benchmarks/results/).

---

## 🐍 Python SDK

```bash
pip install cerebrex
```

```python
import asyncio
from cerebrex import CerebreXClient

async def main():
    async with CerebreXClient(api_key="cx-your-key") as client:
        # Write to agent memory
        await client.memex.write_index("my-agent", "# Memory\n- learned today")

        # Assemble a system prompt from all three memory layers
        ctx = await client.memex.assemble_context("my-agent", topics=["context"])

        # Search the registry
        results = await client.registry.search("web-search")

        # Submit a KAIROS task
        task = await client.kairos.submit_task("my-agent", "fetch",
            payload={"url": "https://api.example.com/data"})

asyncio.run(main())
```

See [sdks/python/README.md](sdks/python/README.md) for the full SDK reference including ULTRAPLAN, TRACE, LangChain integration, and CrewAI integration.

---

## 🧪 Agent Test Runner

`cerebrex test` lets you write structured assertions against recorded agent traces — no live model calls needed.

```bash
# Scaffold a starter spec file
cerebrex test init

# Run all discovered specs
cerebrex test run

# Run a specific spec with verbose output
cerebrex test run my-agent.test.yaml --verbose

# CI mode (JSON to stdout, exit 1 on failure)
cerebrex test run --ci

# Only run tests tagged "smoke"
cerebrex test run --tag smoke

# Record a saved trace session as a reusable fixture
cerebrex test record <session-id>

# List all discovered spec files
cerebrex test list

# Inspect a spec file
cerebrex test show my-agent.test.yaml
```

**Spec format** (`my-agent.test.yaml`):

```yaml
name: My Agent Tests

tests:
  - name: search tool called with correct query
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

  # Replay a recorded trace fixture
  - name: matches recorded session
    fixture: my-session.fixture.json
    assert:
      noErrors: true
      stepCount:
        min: 1
      output:
        path: results.0.title
        contains: "CerebreX"
```

**Assertions available:** `stepCount`, `tokenCount`, `durationMs`, `noErrors`, `toolsCalled` (with `ordered`/`exact` modes), per-step checks (`type`, `toolName`, `outputPath`/`outputValue`, `latencyMs`), and `output` (dot-path `equals`/`contains`/`matches`).

---

## 🗂 Monorepo Structure

```
CerebreX/
├── apps/
│   ├── cli/              # cerebrex CLI — the main published package
│   │   ├── src/
│   │   │   ├── commands/ # build, trace, memex, auth, hive, bench, test, other-commands
│   │   │   └── core/     # forge/, trace/, memex/, test/ engines + dashboard
│   │   └── dist/         # built output (git-ignored, built by CI)
│   └── dashboard/        # Standalone trace explorer HTML
│       └── src/index.html
├── benchmarks/           # Performance benchmark suite (local + live)
│   ├── forge-bench.ts    # FORGE pipeline timing
│   ├── trace-bench.ts    # TRACE step recording throughput
│   ├── memex-bench.ts    # Three-layer MEMEX operations
│   ├── hive-bench.ts     # Swarm coordination + risk gate
│   ├── registry-bench.ts # Package search + metadata
│   ├── agent-tasks-bench.ts  # Cross-framework comparison scaffold
│   └── src/
│       ├── stats.ts      # p50/p95/p99 helpers
│       ├── types.ts      # BenchmarkResult type
│       ├── reporters/    # console, json, markdown reporters
│       └── adapters/     # cerebrex adapter (5 standardized tasks)
├── sdks/
│   └── python/           # Python async SDK (pip install cerebrex)
│       ├── src/cerebrex/ # CerebreXClient + module sub-clients
│       ├── tests/        # pytest test suite with pytest-httpx mocks
│       └── examples/     # quickstart, langchain_integration, crewai_integration
├── workers/
│   ├── registry/         # Cloudflare Worker — live registry backend + Web UI
│   │   ├── src/index.ts  # REST API (D1 + KV) + embedded HTML pages
│   │   ├── schema.sql    # D1 database schema
│   │   └── wrangler.toml
│   ├── memex/            # Cloudflare Worker — MEMEX v2 three-layer cloud memory
│   │   ├── src/index.ts  # KV index + R2 topics + D1 transcripts + autoDream cron
│   │   ├── migrations/   # D1 schema for agents + transcripts tables
│   │   └── wrangler.toml
│   └── kairos/           # Cloudflare Worker — KAIROS daemon + ULTRAPLAN
│       ├── src/index.ts  # KairosDaemon Durable Object + task queue + ULTRAPLAN
│       ├── migrations/   # D1 schema for daemon_log, tasks, ultraplans
│       └── wrangler.toml
├── packages/
│   ├── core/             # @cerebrex/core — shared utilities
│   ├── types/            # @cerebrex/types — shared TypeScript types
│   ├── registry-client/  # @cerebrex/registry — registry API client
│   └── system-prompt/    # @cerebrex/system-prompt — master system prompt + MEMEX loader
├── .github/
│   └── workflows/
│       ├── ci.yml              # build + typecheck on push/PR
│       ├── publish.yml         # npm publish on GitHub release
│       ├── deploy-registry.yml # auto-deploy registry Worker
│       ├── deploy-memex.yml    # auto-deploy MEMEX Worker
│       ├── deploy-kairos.yml   # auto-deploy KAIROS Worker
│       ├── build-binaries.yml  # build standalone binaries on release
│       ├── benchmarks.yml      # weekly benchmark suite (Sundays 02:00 UTC)
│       ├── test-python.yml     # Python SDK tests (3.10, 3.11, 3.12)
│       └── publish-python.yml  # publish cerebrex to PyPI on release
└── turbo.json
```

---

## 🔒 Security

Built security-first, aligned with the [OWASP Top 10 for Agentic Applications (2025)](https://genai.owasp.org).

| Control | Where | What it does |
|---------|-------|-------------|
| **SHA-256 Memory Integrity** | Local MEMEX | All writes checksummed; reads verify before returning |
| **Timing-Safe Auth** | MEMEX + KAIROS workers | Constant-time XOR comparison prevents timing oracle attacks on API keys |
| **Risk Classification Gate** | HIVE worker | Every task classified LOW/MEDIUM/HIGH before execution; HIGH blocked by default |
| **Authenticated Token Issuance** | HIVE coordinator | `POST /token` requires `registration_secret` matching hive config — no unauthenticated token requests |
| **JWT Hardening** | HIVE coordinator | `sub` claim required + non-empty; exp/nbf/iat all validated |
| **Input Validation** | Zod (FORGE) + regex (KAIROS/MEMEX) | agentId and topic names restricted to `[a-zA-Z0-9_-]` 1–128 chars — prevents path traversal |
| **Size Limits** | MEMEX + KAIROS | Transcripts ≤1MB, topics ≤512KB, index ≤25KB, ULTRAPLAN goals ≤50KB |
| **Zero Hardcoded Secrets** | FORGE validator | Scans generated code and blocks deploy if secrets are hardcoded |
| **Secure Credentials** | Auth CLI | Tokens stored at `~/.cerebrex/.credentials` (mode 0600); `icacls` hardening on Windows |
| **Daemon Backoff** | KAIROS | Exponential backoff on consecutive API errors (1 min → 30 min) prevents runaway loops |
| **Append-Only Audit Log** | KAIROS | Every daemon tick written to D1; agents cannot delete their own history |
| **Rate Limiting** | MEMEX Worker | `/consolidate` rate-limited to 1 per hour per agent via KV TTL |

Found a vulnerability? Please read our [Security Policy](./SECURITY.md) and report it privately.

---

## 🤝 Contributing

Contributions are welcome. CerebreX is a solo-built open-source project — PRs, issues, and feedback all help.

```bash
git clone https://github.com/arealcoolco/CerebreX.git
cd CerebreX/cerebrex
bun install
cd packages/types && bun run build && cd ../..
cd packages/core && bun run build && cd ../..
cd packages/registry-client && bun run build && cd ../..
cd apps/cli && bun run build
# Open a PR against main
```

---

## 🛣 Roadmap

- [x] FORGE — MCP server generation from OpenAPI *(v0.1)*
- [x] TRACE — Real HTTP event server, step recording + replay *(v0.2)*
- [x] MEMEX — Persistent agent memory, SHA-256 integrity, TTL *(v0.2)*
- [x] AUTH — Secure token storage, `cerebrex auth login/logout/status` *(v0.2)*
- [x] VALIDATE — Real MCP + OWASP compliance checks *(v0.2)*
- [x] CI/CD — GitHub Actions build + npm publish pipeline *(v0.2)*
- [x] npm package live — `npm install -g cerebrex` *(v0.2.1)*
- [x] Web dashboard — Visual trace explorer (`cerebrex trace view --web`) *(v0.3)*
- [x] Registry backend — Cloudflare Worker + D1 + KV *(v0.3)*
- [x] HIVE — Multi-agent JWT coordination (init/start/register/status/send) *(v0.3)*
- [x] Web UI — Registry browser + hosted trace explorer (Worker-embedded) *(v0.4)*
- [x] Website live — `therealcool.site` — whitepaper, manifesto, proof of work *(v0.7)*
- [x] HIVE cloud API — create/manage hives from anywhere via registry backend *(v0.7)*
- [x] 8 official MCP packages — memex, hive, fetch, datetime, kvstore, github, nasa, openweathermap *(v0.7)*
- [x] Token self-service — `POST /v1/auth/tokens` — users can create scoped tokens *(v0.7)*
- [x] Rate limiting — per-IP + per-token write limits on MEMEX + HIVE *(v0.7)*
- [x] HIVE worker — `cerebrex hive worker` — agents that poll, execute, and report back *(v0.7.2)*
- [x] Built-in task handlers — fetch, memex-set, memex-get, echo, noop *(v0.7.2)*
- [x] Custom handler modules — `--handler ./my-handler.mjs` for domain-specific logic *(v0.7.2)*
- [x] TRACE + HIVE integration — `--trace-port` + `--trace-session` on workers *(v0.7.2)*
- [x] Standalone binaries — `cerebrex-linux-x64`, `cerebrex-linux-arm64`, `cerebrex-windows-x64.exe` attached to every release *(v0.8)*
- [x] Windows `tar` fix + credential `icacls` hardening *(v0.8)*
- [x] Update checker — cached background check, 24h TTL *(v0.8)*
- [x] PWA — `registry.therealcool.site` installable on Android, Chrome OS, iOS Safari *(v0.8)*
- [x] MEMEX v2 — three-layer cloud memory (KV + R2 + D1) + autoDream nightly consolidation *(v0.9)*
- [x] KAIROS — autonomous agent daemon (Durable Objects, 5-min tick loop, append-only log) *(v0.9)*
- [x] ULTRAPLAN — Opus deep-thinking plan → human approval → parallel task execution *(v0.9)*
- [x] AUTH risk gate — LOW/MEDIUM/HIGH classification on every agent action *(v0.9)*
- [x] HIVE swarm strategies — parallel, pipeline, competitive + 6 built-in presets *(v0.9)*
- [x] `@cerebrex/system-prompt` — master system prompt package + live MEMEX context loader *(v0.9)*
- [x] Security hardening — risk gate wired into HIVE worker, JWT /token endpoint authenticated, KAIROS exponential backoff + JSON validation, agentId injection prevention *(v0.9.1)*
- [x] Benchmark suite — p50/p95/p99, forge/trace/memex/hive/registry + cross-framework agent tasks + `cerebrex bench` CLI command *(v0.9.2)*
- [x] Python SDK — async httpx client, Pydantic v2, full module coverage, LangChain + CrewAI integrations *(v0.9.2)*
- [x] Agent test runner — `cerebrex test` with replay + assertions, fixture recording, tag filtering, CI mode *(v0.9.3)*

---

## 📄 License

CerebreX is open source under the [Apache 2.0 License](./LICENSE).

---

<div align="center">

Built by [A Real Cool Co.](https://therealcool.site) · Gulf Coast, Mississippi

*"The developer who builds the standard wins the ecosystem."*

</div>
