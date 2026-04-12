# CerebreX — Testing & Onboarding Guide

Everything you need to go from zero to running AI agents with memory, tooling, and coordination.

**Current version: v0.9.4-patch (2026-04-12)**

---

## Prerequisites

- [Node.js](https://nodejs.org) v20+
- [npm](https://npmjs.com) (comes with Node)
- A [Claude Desktop](https://claude.ai/download) install (for MCP package testing)
- Optional: [Bun](https://bun.sh) if building from source

---

## 1 — Install the CLI

```bash
npm install -g cerebrex
cerebrex --help
```

You should see all commands: `build`, `trace`, `memex`, `auth`, `hive`, `test`, `doctor`, `publish`, and more.

**Or download a standalone binary** (no Node.js required):
- `cerebrex-linux-x64` — Linux x64 (Ubuntu, Debian, Chrome OS)
- `cerebrex-linux-arm64` — Linux ARM64 (Raspberry Pi, ARM servers)
- `cerebrex-windows-x64.exe` — Windows 10/11

Download from [GitHub Releases](https://github.com/arealcoolco/CerebreX/releases).

---

## 2 — Create an Account on the Registry

The CerebreX registry is live at [registry.therealcool.site](https://registry.therealcool.site).

**Sign up for an account:**
```bash
cerebrex auth register
# choose a username — a token is issued and saved automatically
```

**Already have a token? Log in:**
```bash
cerebrex auth login
# paste your token when prompted — verified against the registry before saving
# stored at ~/.cerebrex/.credentials (mode 0600; icacls-hardened on Windows)
```

**Check your status:**
```bash
cerebrex auth status
```

---

## 3 — Browse and Install MCP Packages

```bash
# search the registry
cerebrex search github

# install official packages
cerebrex install @arealcoolco/github-mcp
cerebrex install @arealcoolco/nasa-mcp
cerebrex install @arealcoolco/fetch-mcp
cerebrex install @arealcoolco/datetime-mcp
cerebrex install @arealcoolco/kvstore-mcp
cerebrex install @arealcoolco/memex-mcp
cerebrex install @arealcoolco/hive-mcp
cerebrex install @arealcoolco/openweathermap-mcp
```

Packages are installed to `~/.cerebrex/packages/<name>/`.

---

## 4 — Configure MCP Packages for Claude Desktop

```bash
# add a package to Claude Desktop's config
cerebrex configure @arealcoolco/github-mcp --env GITHUB_TOKEN=ghp_...

# dry run — preview the config change without writing it
cerebrex configure @arealcoolco/nasa-mcp --env NASA_API_KEY=DEMO_KEY --dry-run
```

This writes to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).

Restart Claude Desktop after configuring.

---

## 5 — Test MEMEX (Persistent Memory)

### Local MEMEX (CLI)

```bash
# store a value
cerebrex memex set "name" "Alice" --namespace user
cerebrex memex set "stack" "TypeScript, Next.js, Postgres" --namespace project

# retrieve it
cerebrex memex get "name" --namespace user

# list all memories
cerebrex memex list

# set a value that expires in 60 seconds
cerebrex memex set "session-token" "abc123" --ttl 60

# delete a key
cerebrex memex delete "session-token"

# list namespaces
cerebrex memex namespaces
```

Memories are stored locally at `~/.cerebrex/memex/` with SHA-256 checksums.
Reads verify integrity before returning — tampered files are rejected.

### Cloud MEMEX v2 — Three-Layer Architecture

The MEMEX cloud worker (`workers/memex/`) uses three storage layers:

| Layer | Storage | Role |
|-------|---------|------|
| **Index** | Cloudflare KV | Pointer map, always hot, ≤200 lines / 25KB |
| **Topics** | Cloudflare R2 | Per-topic knowledge files, on-demand, ≤512KB each |
| **Transcripts** | Cloudflare D1 | Append-only session history, search-only, ≤1MB each |

```bash
# Read/write the KV pointer index
GET  /v1/agents/my-agent/memory/index
POST /v1/agents/my-agent/memory/index  { "content": "..." }

# Read/write per-topic R2 files
GET    /v1/agents/my-agent/memory/topics/research
POST   /v1/agents/my-agent/memory/topics/research  { "content": "..." }
DELETE /v1/agents/my-agent/memory/topics/research

# Append session history
POST /v1/agents/my-agent/memory/transcripts  { "content": "..." }

# Full-text search across all transcripts
GET /v1/agents/my-agent/memory/transcripts/search?q=vector+database

# Assemble all three layers into one system prompt injection
POST /v1/agents/my-agent/memory/context

# Trigger manual autoDream consolidation (rate-limited: 1/hour per agent)
POST /v1/agents/my-agent/memory/consolidate
```

**autoDream** runs nightly at 03:00 UTC:
1. **Orient** — reads the current index
2. **Gather** — pulls the last 50 transcripts from D1
3. **Consolidate** — Claude synthesizes, removes contradictions, updates topics
4. **Prune** — enforces 200-line / 25KB hard limits on the index

**Test cloud MEMEX via MCP:**
Once `@arealcoolco/memex-mcp` is configured in Claude Desktop, open Claude and say:
> "Store the memory: key='test', value='hello from cerebrex', agent='demo'"

Then:
> "Recall my memory with key 'test' for agent 'demo'"

---

## 6 — Test HIVE (Multi-Agent Coordination)

### Basic coordinator flow

```bash
# initialize a local coordinator
cerebrex hive init --name my-first-hive

# start it (runs on port 7433)
cerebrex hive start &

# register agents — each prints a JWT token
cerebrex hive register --id researcher --name "Researcher" --capabilities search,read
# → JWT: eyJ...   ← save this

cerebrex hive register --id writer --name "Writer" --capabilities write,edit
# → JWT: eyJ...   ← save this

# check status
cerebrex hive status

# stop the coordinator when done
cerebrex hive stop
```

> **Note:** `cerebrex hive register` reads your local `~/.cerebrex/hive/hive.json` to authenticate
> the token request. The coordinator's `/token` endpoint requires a `registration_secret` — the
> CLI sends it automatically. You cannot issue tokens without access to the hive config.

### Worker pattern — tasks that actually execute

Workers are long-running processes that poll for tasks, execute them, and report results back.

**Terminal 1 — start coordinator:**
```bash
cerebrex hive start
```

**Terminal 2 — start researcher worker (default: medium + low tasks only):**
```bash
cerebrex hive worker --id researcher --token <RESEARCHER_JWT>
# Worker is now polling every 2 seconds
# Risk policy: MEDIUM/LOW (high blocked)
```

**Terminal 3 — start writer worker allowing all risk levels:**
```bash
cerebrex hive worker --id writer --token <WRITER_JWT> \
  --allow-high-risk \
  --handler ./writer-handler.mjs
# Risk policy: HIGH/MEDIUM/LOW
```

**Terminal 4 — send tasks and watch them execute:**
```bash
# built-in task types (no handler needed)
cerebrex hive send --agent researcher --type fetch \
  --payload '{"url":"https://httpbin.org/json"}' \
  --token <RESEARCHER_JWT>

cerebrex hive send --agent researcher --type memex-set \
  --payload '{"key":"research-result","value":"AI is great","namespace":"demo"}' \
  --token <RESEARCHER_JWT>

cerebrex hive send --agent researcher --type memex-get \
  --payload '{"key":"research-result","namespace":"demo"}' \
  --token <RESEARCHER_JWT>

cerebrex hive send --agent researcher --type echo \
  --payload '{"hello":"world"}' \
  --token <RESEARCHER_JWT>

# custom task types (handled by --handler module)
cerebrex hive send --agent writer --type summarize \
  --payload '{"topic":"agent infrastructure"}' \
  --token <WRITER_JWT>

# watch results
cerebrex hive status
```

### Risk gate — what gets blocked and why

The HIVE worker classifies every task before running it:

| Type | Risk | Blocked by default? |
|------|------|-------------------|
| `noop`, `echo`, `memex-get`, `read`, `search` | LOW | No |
| `fetch`, `memex-set`, `write`, `configure` | MEDIUM | No |
| `delete`, `deploy`, `publish`, `send`, `daemon-start` | HIGH | **Yes** |
| Any unknown type | HIGH | **Yes** |

Blocked tasks are marked `failed` on the coordinator and logged with the denial reason.
To permit HIGH-risk tasks: `cerebrex hive worker --id <id> --token <jwt> --allow-high-risk`.
To block even MEDIUM tasks: add `--block-medium-risk`.

**Velocity limit (chained action protection):** Even if individual actions pass the per-action gate, HIVE workers track each agent's medium+ actions in a rolling 5-minute window. If an agent exceeds 3 medium-or-higher-risk actions in that window, the current task is blocked and a `velocity-escalation` TRACE event is emitted. This prevents a compromised agent from chaining multiple medium-risk actions to achieve a high-risk outcome.

Configure via environment variables:
- `CEREBREX_VELOCITY_LIMIT` — actions per window before escalation (default: `3`)
- `CEREBREX_VELOCITY_WINDOW_MS` — rolling window size in ms (default: `300000` = 5 minutes)

Admin agents with `"risk_override"` in their JWT `scopes` claim bypass the velocity check.

### Built-in task types

| Type | Required payload | Risk |
|------|-----------------|------|
| `noop` | anything | LOW |
| `echo` | anything | LOW |
| `memex-get` | `{ key, namespace? }` | LOW |
| `memex-set` | `{ key, value, namespace?, ttl? }` | MEDIUM |
| `fetch` | `{ url, method?, headers?, body? }` | MEDIUM |
| `claude-execute` | `{ description, store_key? }` | MEDIUM |
| `kairos-action` | `{ task_type, task_payload }` | MEDIUM |

> **Note:** `fetch` tasks are SSRF-protected — private IP ranges, loopback, link-local, and cloud metadata endpoints are blocked before the request is sent.

### Swarm strategies — multi-agent presets

```bash
# list all strategies and presets
cerebrex hive strategies

# run a preset against a goal
cerebrex hive swarm research-and-recommend "Best time-series database for IoT workloads?"
cerebrex hive swarm code-review-pipeline   "Review the auth module for security issues"
cerebrex hive swarm best-solution          "Should we use REST or GraphQL for this API?"
cerebrex hive swarm product-spec           "Design a push notification system"
cerebrex hive swarm content-pipeline       "Write a blog post about AI agent orchestration"
cerebrex hive swarm contract-audit         "Audit this API contract for breaking changes"
```

| Preset | Strategy | Agents |
|--------|----------|--------|
| `research-and-recommend` | pipeline | researcher → analyst → recommender |
| `code-review-pipeline` | pipeline | reviewer → security → summarizer |
| `best-solution` | competitive | 3 solvers race, Opus picks winner |
| `product-spec` | pipeline | product manager → engineer → designer |
| `content-pipeline` | pipeline | researcher → writer → editor |
| `contract-audit` | parallel | 3 auditors in parallel, results merged |

### Full HIVE + TRACE observability

```bash
# start trace first
cerebrex trace start --session hive-demo

# start workers with trace integration
cerebrex hive worker --id researcher --token <JWT> \
  --trace-port 7432 --trace-session hive-demo

# send tasks — each execution appears in the timeline
cerebrex hive send --agent researcher --type fetch \
  --payload '{"url":"https://httpbin.org/uuid"}' --token <JWT>

# view live in browser
cerebrex trace view --session hive-demo --web
```

**Test cloud HIVE via MCP:**
Once `@arealcoolco/hive-mcp` is configured with `CEREBREX_TOKEN=<your-token>`, say:
> "Create a new hive called 'test-hive'"

Then:
> "List all my hives"

---

## 7 — Test KAIROS (Autonomous Agent Daemon)

KAIROS is a cloud daemon built on Cloudflare Durable Objects. Each agent gets a persistent
background process that wakes every 5 minutes, consults Claude, and logs every decision.

```bash
# Start a daemon (requires KAIROS worker URL + API key)
curl -X POST https://your-kairos.workers.dev/v1/agents/my-agent/daemon/start \
  -H "x-api-key: $CEREBREX_API_KEY"

# Check daemon status
curl https://your-kairos.workers.dev/v1/agents/my-agent/daemon/status \
  -H "x-api-key: $CEREBREX_API_KEY"

# View the immutable tick log
curl "https://your-kairos.workers.dev/v1/agents/my-agent/daemon/log?limit=10" \
  -H "x-api-key: $CEREBREX_API_KEY"

# Queue a task manually
curl -X POST https://your-kairos.workers.dev/v1/agents/my-agent/tasks \
  -H "x-api-key: $CEREBREX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"fetch","payload":{"url":"https://httpbin.org/uuid"}}'

# Stop the daemon
curl -X POST https://your-kairos.workers.dev/v1/agents/my-agent/daemon/stop \
  -H "x-api-key: $CEREBREX_API_KEY"
```

**Security notes:**
- agentId must be alphanumeric + `_-`, 1–128 characters (enforced server-side)
- The daemon backs off exponentially if Claude API calls fail repeatedly (1 min → 30 min cap)
- Every tick is written to an append-only D1 log — no history can be deleted

---

## 8 — Test ULTRAPLAN (Opus Deep-Thinking Planning)

```bash
# Submit a goal — Opus starts planning immediately (async)
curl -X POST https://your-kairos.workers.dev/v1/ultraplan \
  -H "x-api-key: $CEREBREX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"goal":"Build a competitive analysis of the top 5 vector databases"}'
# → { "planId": "abc123", "status": "planning", "message": "Opus is thinking..." }

# Poll until status is "pending" (usually 30–60 seconds)
curl https://your-kairos.workers.dev/v1/ultraplan/abc123 \
  -H "x-api-key: $CEREBREX_API_KEY"
# → { status: "pending", plan: { summary, rationale, tasks, risks, success_criteria } }

# Review the plan, then approve — all tasks queue simultaneously
curl -X POST https://your-kairos.workers.dev/v1/ultraplan/abc123/approve \
  -H "x-api-key: $CEREBREX_API_KEY"

# Or reject it
curl -X POST https://your-kairos.workers.dev/v1/ultraplan/abc123/reject \
  -H "x-api-key: $CEREBREX_API_KEY"
```

Goals are capped at 50,000 bytes — the server returns HTTP 413 before calling Opus if exceeded.

---

## 9 — Test TRACE (Observability)

```bash
# start a trace session
cerebrex trace start --session test-session

# from another terminal, push a step
curl -s -X POST http://localhost:7432/step \
  -H "Content-Type: application/json" \
  -d '{"type":"tool_call","toolName":"search","inputs":{"q":"test"},"latencyMs":42}'

# stop and save
cerebrex trace stop --session test-session

# view in terminal
cerebrex trace view --session test-session

# view in browser (opens local dashboard)
cerebrex trace view --session test-session --web

# or drag and drop the JSON file at the hosted explorer:
# https://registry.therealcool.site/ui/trace
```

Traces are saved to `~/.cerebrex/traces/`.

**Reconstruct a task timeline:**
```bash
# Find all trace events for a specific task ID across all sessions
cerebrex trace task <task_id>

# Limit to a specific session
cerebrex trace task <task_id> --session my-session

# JSON output for CI or further processing
cerebrex trace task <task_id> --json
```

---

## 10 — Test the Agent Test Runner

`cerebrex test` lets you write YAML test cases that record a real agent run and then replay/assert it:

```bash
# scaffold a test suite in the current directory
cerebrex test init

# run all tests (verbose output)
cerebrex test run --verbose

# run only tests tagged "smoke"
cerebrex test run --tag smoke

# bail on first failure
cerebrex test run --bail

# output machine-readable JSON (for CI)
cerebrex test run --json

# record a new golden file from a live agent run
cerebrex test record --name my-test

# list all test cases
cerebrex test list

# inspect a specific test case
cerebrex test show my-test
```

**Example test file (`cerebrex-tests/smoke.yaml`):**
```yaml
name: echo smoke test
tag: smoke
steps:
  - type: hive-send
    agent: researcher
    task_type: echo
    payload: { hello: world }
assertions:
  - field: result.hello
    op: eq
    value: world
  - field: status
    op: eq
    value: completed
```

**Assertion operators:**

| Operator | Meaning |
|----------|---------|
| `eq` | Exact equality |
| `contains` | String or array contains value |
| `exists` | Field is present and non-null |
| `gt` / `lt` | Numeric comparison |
| `match` | Regex match |

---

## 11 — Run Environment Doctor

`cerebrex doctor` validates your local setup and checks connectivity to deployed workers:

```bash
# Quick local check (credentials, wrangler.toml, HIVE state, registry ping)
cerebrex doctor

# With live worker connectivity
cerebrex doctor \
  --kairos-url https://your-kairos.workers.dev \
  --memex-url  https://your-memex.workers.dev  \
  --api-key    $CEREBREX_API_KEY

# CI-friendly (exits 1 on any failure)
cerebrex doctor --json
```

**Checks performed:**
- `credentials` — `~/.cerebrex/.credentials` exists with a valid token
- `wrangler:<worker>` — no placeholder `REPLACE_WITH_YOUR_*` IDs in wrangler.toml files
- `hive:stuck-tasks` — tasks stuck in `running` for >30 minutes
- `hive:offline-agents` — registered agents currently offline
- `kairos:connectivity` — KAIROS `/health` reachable
- `memex:connectivity` — MEMEX `/health` reachable
- `registry:connectivity` — `registry.therealcool.site/health` reachable

---

## 12 — Test FORGE (MCP Server Generation)

```bash
# scaffold a new MCP server from an OpenAPI spec
cerebrex build --spec https://petstore3.swagger.io/api/v3/openapi.json --output ./my-petstore-mcp

# validate it before publishing
cerebrex validate ./my-petstore-mcp
cerebrex validate ./my-petstore-mcp --strict  # OWASP checks

ls ./my-petstore-mcp/
# src/index.ts — tool implementation with Zod validation
# package.json — pre-configured
# wrangler.toml — ready for Cloudflare Workers
```

---

## 13 — Publish to the Registry

```bash
# build your package
cd my-petstore-mcp
npm install
npm run build

# publish
cerebrex auth login  # if not already logged in
cerebrex publish --dir . --access public

# verify it appeared
cerebrex search petstore
```

---

## 14 — Test the Registry Web UI

Open [registry.therealcool.site](https://registry.therealcool.site) in a browser:

1. Browse the **featured packages** — click any to see metadata and install command
2. Use the **search bar** — try "github", "nasa", "fetch"
3. Sign up and visit **/account** — view your tokens, packages, profile
4. Drag a trace JSON file into the **Trace Explorer** at `/ui/trace`
5. **Install as a PWA** on Android or Chrome OS — tap "Add to Home Screen" in Chrome

---

## Packages Reference

| Package | Tools | Requires |
|---------|-------|---------|
| `@arealcoolco/memex-mcp` | `memory_store`, `memory_recall`, `memory_forget`, `memory_list` | `CEREBREX_TOKEN` |
| `@arealcoolco/hive-mcp` | `hive_list`, `hive_create`, `hive_get`, `hive_update`, `hive_delete` | `CEREBREX_TOKEN` |
| `@arealcoolco/fetch-mcp` | `http_get`, `http_post`, `http_request` | none |
| `@arealcoolco/datetime-mcp` | `datetime_now`, `datetime_convert`, `datetime_diff`, `datetime_format` | none |
| `@arealcoolco/kvstore-mcp` | `kv_set`, `kv_get`, `kv_delete`, `kv_list`, `kv_clear` | none |
| `@arealcoolco/github-mcp` | 10 tools — repos, issues, PRs, commits, search | `GITHUB_TOKEN` |
| `@arealcoolco/nasa-mcp` | APOD, Mars Rover, NEO, Earth Imagery, Image Library | `NASA_API_KEY` (DEMO_KEY works) |
| `@arealcoolco/openweathermap-mcp` | Current weather, forecast, air quality, geocoding | `OWM_API_KEY` |

---

## Environment Variables Reference

```bash
CEREBREX_TOKEN          # your registry auth token (overrides stored credentials)
CEREBREX_REGISTRY_URL   # override registry URL (default: https://registry.therealcool.site)
GITHUB_TOKEN            # required for github-mcp
NASA_API_KEY            # required for nasa-mcp (DEMO_KEY works for testing)
OWM_API_KEY             # required for openweathermap-mcp
```

**For cloud workers (set as Cloudflare secrets):**
```bash
CEREBREX_API_KEY        # authenticates all MEMEX + KAIROS API requests
ANTHROPIC_API_KEY       # required for autoDream consolidation and KAIROS tick decisions
TICK_INTERVAL_MS        # KAIROS: ms between daemon ticks (default: 300000 = 5 minutes)
TICK_BUDGET_MS          # KAIROS: Claude call timeout per tick (default: 15000 = 15 seconds)
```

---

## Troubleshooting

**`cerebrex: command not found`**
```bash
npm install -g cerebrex
```

**Auth token not working**
```bash
cerebrex auth status    # check current state
cerebrex auth logout    # clear stored credentials
cerebrex auth login     # re-authenticate
```

**`cerebrex hive register` fails with 401**
```bash
# Make sure you've run cerebrex hive init first — register reads the local hive.json
cerebrex hive init --name my-hive
cerebrex hive start
cerebrex hive register --id myagent --name "My Agent"
```

**HIVE worker blocks a task you expected to run**
```bash
# Check the task type's risk level with cerebrex hive strategies
# For HIGH-risk types (deploy, delete, send, daemon-start, etc.):
cerebrex hive worker --id <id> --token <jwt> --allow-high-risk
# For MEDIUM-risk types (fetch, memex-set, write, configure, claude-execute, kairos-action):
# These run by default; block them with --block-medium-risk
```

**Package not found after install**
```bash
ls ~/.cerebrex/packages/
```

**Claude Desktop not showing MCP tools**
- Restart Claude Desktop after running `cerebrex configure`
- Check `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
- Confirm the package binary exists at the path in the config

**KAIROS daemon not ticking**
```bash
# Check daemon status via the KAIROS REST API
curl https://your-kairos.workers.dev/v1/agents/my-agent/daemon/status \
  -H "x-api-key: $CEREBREX_API_KEY"

# If consecutiveErrors > 0, the daemon is in backoff mode
# It will resume automatically when the backoff interval elapses
```

---

## Links

- **Registry:** [registry.therealcool.site](https://registry.therealcool.site)
- **Whitepaper:** [therealcool.site](https://therealcool.site)
- **GitHub:** [github.com/arealcoolco/CerebreX](https://github.com/arealcoolco/CerebreX)
- **npm:** [npmjs.com/package/cerebrex](https://www.npmjs.com/package/cerebrex)
- **Issues:** [github.com/arealcoolco/CerebreX/issues](https://github.com/arealcoolco/CerebreX/issues)

---

*Built by A Real Cool Co. — Gulf Coast, Mississippi*
