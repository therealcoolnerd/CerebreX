# CerebreX Changelog

All notable changes to this project are documented here.

This project follows [Semantic Versioning](https://semver.org/) and [Conventional Commits](https://www.conventionalcommits.org/).

---

## [0.9.4] — 2026-04-11

### Security Hardening + KAIROS Execution Engine

Full security audit pass. Every finding from the v0.9.3 independent audit is resolved.

#### Critical — SSRF Protection
- **`fetch-mcp`** — `http_get`, `http_post`, `http_request` now run every URL through `ssrfCheck()` before any network I/O. Blocks: private IPv4 ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10), all reserved/documentation ranges, IPv6 private ranges (::1, fc/fd/fe80), localhost and common internal DNS suffixes (`.local`, `.internal`, `.corp`), and known cloud metadata hosts (`metadata.google.internal`, `169.254.169.254`)
- **KAIROS queue consumer** — `fetch` task type now runs the same `ssrfCheck()` before executing server-side HTTP requests; any blocked URL fails the task cleanly with a descriptive error

#### Critical — ULTRAPLAN Reliability
- **`ctx.waitUntil`** — ULTRAPLAN planning promise is now correctly passed to `ctx.waitUntil()` so it completes even on slow Opus calls after the HTTP response is sent (was a detached void promise that could be killed mid-planning)
- **Safe JSON parse on approve** — `JSON.parse(plan.plan)` now wrapped in try/catch with `/\{[\s\S]*\}/` extraction to handle Claude prose-before-JSON; returns HTTP 422 with a clear message instead of a 500 stack trace
- **`createdBy` validation** — max 64 chars, alphanumeric/space/`_-@.` only; previously accepted arbitrary-length strings

#### Medium — File Permission Hardening
- **`hive.json`** — now written with `mode: 0o600` + `icacls` on Windows; this file contains the JWT HMAC signing secret
- **`state.json`** — now written with `mode: 0o600` + `icacls` on Windows
- **Task rotation** — completed/failed tasks older than 24 hours are pruned from `state.json` on every write, preventing unbounded growth

#### Medium — Data Exposure
- **MEMEX transcript search** — `/transcripts/search` now returns a 200-char `preview` field by default instead of the full `content`; add `?full=true` to opt in to full content (prevents accidental credential/PII exposure in search responses)

#### Low — Security Response Headers
- **All workers** — every HTML and JSON response now includes: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 1; mode=block`
- **HTML responses** — `Content-Security-Policy` with strict `frame-ancestors 'none'`, scoped `script-src`/`style-src`/`font-src`, `Permissions-Policy` on site worker
- **Admin CORS** — `/v1/admin/*` routes in registry now return `Access-Control-Allow-Origin: https://registry.therealcool.site` instead of wildcard `*`

#### Low — Correctness Fixes
- **Risk gate** — `kairos-action` and `claude-execute` added to the risk classification table at `medium`; previously both defaulted to `high` (unknown action), which caused KAIROS workers to block their own daemon tasks
- **Telemetry config** — removed `telemetry: boolean` from `CerebreXConfig` and defaults; the field was set to `true` but the implementation was commented out — misleading to users

#### KAIROS — Real Execution Engine
- **Structured daemon tasks** — daemon tick prompt updated to return `{ act, reasoning, task_type, task_payload }` instead of free-text `action` string; `task_type` must be one of the built-in handlers so it actually executes
- **`memex-set` task type** — writes a key+content entry to the agent's MEMEX KV index
- **`memex-get` task type** — reads a key (or full index) from the agent's MEMEX KV index
- **`claude-execute` task type** — runs Claude Sonnet on a task description with optional context; optionally stores the result back to MEMEX via `storeKey`
- **`kairos-action` re-dispatch** — if a `kairos-action` task carries a `task_type` + `task_payload`, the consumer re-queues it as the concrete type for proper execution
- **ULTRAPLAN task types** — planning prompt now specifies only supported types (`fetch`, `memex-set`, `memex-get`, `claude-execute`, `echo`, `noop`) so generated plans actually execute

---

## [0.9.3] — 2026-04-11

### Agent Test Runner + Docker Image

#### Docker — `ghcr.io/arealcoolco/cerebrex`
- **Multi-stage Dockerfile** — `oven/bun:1-alpine` builder compiles a self-contained Linux x64 binary; final image is bare `alpine:3.19` + `ca-certificates` (~35MB)
- **GitHub Actions workflow** (`docker.yml`) — publishes to GitHub Container Registry on every release; auto-tags `latest`, `0.9`, and `0.9.3`
- **Usage:** `docker pull ghcr.io/arealcoolco/cerebrex` — no Node.js, no npm, no Bun required at runtime
- **Volume mount:** `-v "$HOME/.cerebrex:/root/.cerebrex"` for persisting traces, test specs, and auth tokens

### Agent Test Runner — `cerebrex test`

Structured trace replay and assertion engine for agent behaviour. Write test specs in YAML or JSON, replay against recorded or inline traces, assert on step counts, token usage, latency, tool calls, and output values — all without hitting a live model.

#### CLI — New Command: `cerebrex test`
- **`cerebrex test run [specs...]`** — auto-discovers `.test.yaml`/`.test.yml`/`.test.json` files in cwd and `~/.cerebrex/tests/`; runs all or specific files
  - `--tag <tag>` — only run test cases with the matching tag
  - `--bail` — stop after the first failure
  - `--verbose` — show all assertion results, not just failures
  - `--json` / `--ci` — JSON to stdout + `exit 1` on any failure (CI integration)
- **`cerebrex test record <session-id>`** — snapshot a saved TRACE session from `~/.cerebrex/traces/` as a reusable fixture in `~/.cerebrex/tests/`
- **`cerebrex test list [-d dir]`** — list all discovered spec files with test counts and modification times
- **`cerebrex test show <spec>`** — display all test cases in a spec file with their assertion types
- **`cerebrex test init [-n name]`** — scaffold a starter `.test.yaml` file with an inline replay example and a commented fixture example

#### Core Test Engine (`apps/cli/src/core/test/`)
- **`engine.ts`** — `loadSpec()` (YAML/JSON), `loadFixture()` (4-path resolution: spec-relative, traces dir, absolute), `buildSessionFromSteps()` (inline replay → `TraceSession`), `runTestCase()` (tag filtering + timeout via `Promise.race`), `runSpec()` (full suite runner), `recordFixture()`, `listSpecs()`
- **`assertions.ts`** — `evaluate()` dispatches all assertion types: `stepCount`/`tokenCount`/`durationMs` (exact number or `{min,max,exact}` ranges), `noErrors` (finds error-type steps), `toolsCalled` (unordered, ordered subsequence, or exact-only modes), `steps[]` (per-step assertions by index or `"last"`), `output` (dot-notation path with `equals`/`contains`/`matches`)
- **`reporter.ts`** — colored terminal output (✓/✗/⚠/–), JSON reporter, multi-suite summary, exit code helper
- **`types.ts`** — `TestSpec`, `TestCase`, `ReplayStep`, `AssertionSet`, `RangeAssertion`, `StepAssertion`, `ToolsCalledAssertion`, `OutputAssertion`, `AssertionResult`, `TestCaseResult`, `TestSuiteResult`, `RunOptions`

---

## [0.9.1] — 2026-04-04

### Security Hardening — Risk Gate Integration + JWT Auth + KAIROS Hardening

Full audit-driven security patch. Every finding from the v0.9.0 deep security audit is resolved.

#### HIVE Worker — Risk Gate Now Active
- **Risk gate wired in** — `gateAction()` from `risk-gate.ts` is now called before every task execution in `cerebrex hive worker`. Tasks classified as HIGH risk are blocked by default; blocked tasks are marked `failed` on the coordinator so the queue doesn't stall
- **Visible policy at startup** — worker prints its risk policy (LOW/MEDIUM/HIGH) when it starts, so operators know what's permitted
- **`--allow-high-risk` flag** — opt-in to permit HIGH-risk task types (deploy, send, daemon-start, etc.)
- **`--block-medium-risk` flag** — opt-in to restrict MEDIUM-risk types (fetch, memex-set, write)
- **Risk level shown per task** — each task log line now shows `[low]`/`[medium]`/`[high]` before the payload preview

#### HIVE Coordinator — JWT /token Endpoint Authenticated
- **`POST /token` now requires `registration_secret`** — must match the local `hive.json` secret (constant-time comparison). Unauthenticated token issuance for arbitrary agent IDs is no longer possible
- **`cerebrex hive register` updated** — automatically reads the local hive config and sends `registration_secret`; no change to user workflow
- **`sub` claim validated** — `verifyToken()` now rejects tokens with a missing, empty, or non-string `sub` claim

#### KAIROS Worker — Daemon Hardening
- **JSON parse validation** — Claude's tick response is now structurally validated before use; `act` must be exactly `true` (not truthy), `reasoning`/`action` must be strings, length-capped to 1000/500 chars respectively
- **Exponential backoff on errors** — consecutive API failures ramp the alarm interval from 1 minute up to 30 minutes (cap), preventing rapid retry loops when Claude API is slow or unavailable; resets to zero on a successful tick
- **agentId injection prevention** — daemon and task route handlers now call `validAgentId()` on every extracted agentId (alphanumeric + `_-`, 1–128 chars), returning 400 before any DB or DO call
- **ULTRAPLAN goal size limit** — goals exceeding 50,000 bytes (≈12K tokens) are rejected with HTTP 413 before the Opus call is made

---

## [0.9.0] — 2026-04-04

### Claude Architecture Patterns — MEMEX v2, KAIROS Daemon, HIVE Swarms, Risk Gate

Applies architectural patterns from the Claude Code system to CerebreX's infrastructure:
three-layer agent memory, autonomous background daemons, fork-join swarm coordination,
and a risk classification gate on every agent action.

#### MEMEX v2 — Three-Layer Cloud Memory (`workers/memex/`) (New Worker)
- **Three-tier architecture:** KV pointer index (always hot, ≤200 lines) + R2 topic files (on-demand) + D1 transcripts (search-only, append-only)
- **`GET/POST /v1/agents/:id/memory/index`** — KV pointer index read/write
- **`GET/POST/DELETE /v1/agents/:id/memory/topics/:topic`** — per-topic R2 knowledge files
- **`POST /v1/agents/:id/memory/transcripts`** — append session history to D1
- **`GET /v1/agents/:id/memory/transcripts/search?q=`** — full-text search across session history
- **`POST /v1/agents/:id/memory/context`** — assemble all three layers into a single system prompt injection
- **`POST /v1/agents/:id/memory/consolidate`** — manual autoDream trigger
- **autoDream cron (03:00 UTC daily)** — four-phase memory consolidation: orient → gather (last 50 transcripts) → consolidate (Claude synthesizes, removes contradictions) → prune (200 line / 25KB hard limits)
- **CI deploy:** `deploy-memex.yml` — auto-deploys on push to `workers/memex/**`

#### KAIROS — Autonomous Agent Daemon + ULTRAPLAN (`workers/kairos/`) (New Worker)
- **`KairosDaemon` Durable Object** — 5-minute alarm-based tick loop; Claude decides each tick whether to act or stay quiet (15-second budget enforced)
- **Append-only daemon log** — every tick recorded to D1; agents cannot delete their own history
- **`POST /v1/agents/:id/daemon/start|stop`** — start/stop the daemon for any agent
- **`GET /v1/agents/:id/daemon/log`** — full immutable tick history
- **`POST /v1/agents/:id/tasks`** — queue proactive tasks to the D1 task table
- **ULTRAPLAN:** `POST /v1/ultraplan { goal }` → Opus produces a comprehensive plan (summary, tasks, risks, success criteria) → `POST /v1/ultraplan/:id/approve` queues all tasks simultaneously
- **Built-in task handlers:** noop, echo, fetch, kairos-action
- **CI deploy:** `deploy-kairos.yml` — auto-deploys on push to `workers/kairos/**`

#### AUTH — Risk Classification Gate (New)
- **`apps/cli/src/core/auth/risk-gate.ts`** — standalone utility, no external deps
- LOW risk: read, search, memex-get, status, list → always allowed
- MEDIUM risk: fetch, write, memex-set, configure → allowed by default, logged
- HIGH risk: delete, deploy, publish, send, daemon operations → blocked unless `--allow-high-risk`
- Evaluation order: Deny → Ask → Allow
- Denial reason surfaced to caller so the model can adjust its plan

#### HIVE — Swarm Strategies + Presets (New Commands)
- **`cerebrex hive swarm <preset> "<task>"`** — launch a named multi-agent swarm
- **`cerebrex hive strategies`** — list all strategies and presets with descriptions
- **Three execution strategies:**
  - `parallel` — all agents receive same task via Promise.all (best for independent subtasks)
  - `pipeline` — sequential refinement chain (best for research → draft → edit)
  - `competitive` — agents race, coordinator picks winner (best for finding optimal answer)
- **6 built-in presets:** `research-and-recommend`, `code-review-pipeline`, `best-solution`, `product-spec`, `content-pipeline`, `contract-audit`

#### `@cerebrex/system-prompt` Package (New)
- **`CEREBREX_SYSTEM_PROMPT`** — 100+ line master system prompt covering all 6 modules + KAIROS + three-layer memory + risk gate + tech stack + operating rules
- **`buildSystemPrompt(opts)`** — assembles static prompt + live MEMEX context injection
- **`cerebrexMessage(opts)`** — convenience wrapper returning `messages.create` params for the Anthropic SDK

---

## [0.8.0] — 2026-03-25

### Standalone Binaries + PWA — Windows, Linux, Android, Chrome OS

#### Standalone Binaries (New)
- **Self-contained executables** — no Node.js or Bun required on the target machine
- **`cerebrex-linux-x64`** — Linux x64 (Ubuntu, Debian, Chrome OS Linux container)
- **`cerebrex-linux-arm64`** — Linux ARM64 (Raspberry Pi, ARM servers)
- **`cerebrex-windows-x64.exe`** — Windows x64 (Windows 10/11)
- Built via `bun build --compile` on every GitHub release; attached as release assets automatically
- npm install (`npm install -g cerebrex`) still works for power users

#### CI — Binary Build Workflow (New)
- **`build-binaries.yml`** — new GitHub Actions workflow; triggers on every published release
- Builds all 3 targets in parallel on `ubuntu-latest`
- Uploads binaries directly to the GitHub release as downloadable assets

#### Windows — Security Fix
- **Credential file hardening** — `cerebrex auth login` now calls `icacls` on Windows after writing `~/.cerebrex/.credentials` to restrict access to the current user only. Previously, `0o600` Unix permissions were silently ignored on NTFS.

#### Windows — `tar` Fix
- **No more system `tar` dependency** — `cerebrex publish` and `cerebrex install` now use the `tar` npm package instead of spawning `execa('tar', ...)`. Fixes silent failures on Windows builds where `tar` is not guaranteed to be in PATH.

#### PWA — Android + Chrome OS (New)
- **`/manifest.json`** — registry Worker now serves a Web App Manifest with name, theme color, display mode, and icon hints
- **`/sw.js`** — minimal service worker enabling offline fallback and PWA installability
- **PWA meta tags** — `<link rel="manifest">`, `theme-color`, `apple-mobile-web-app-capable`, and related meta tags added to the registry UI
- **Service worker registration** — SW registered automatically on page load
- **Install to Home Screen** — `registry.therealcool.site` is now installable on Android Chrome, Chrome OS, and iOS Safari as a standalone app

#### CLI — Update Checker (New)
- **Cached update notifications** — CLI checks `registry.npmjs.org` for newer versions in the background; result cached to `~/.cerebrex/update-check.json` (24h TTL) to avoid slowing startup
- Shows a one-line notice at startup if a newer version is available: `Update available: v0.X.Y → run: npm install -g cerebrex`

---

## [0.7.2] — 2026-03-24

### HIVE Worker — Tasks Now Actually Execute

#### HIVE — Worker Command (New)
- **`cerebrex hive worker`** — new subcommand; starts a long-running agent process that polls the coordinator, claims queued tasks, executes them, and reports results back. Keeps running until interrupted.
- **`--id <agentId>`** — agent ID (must match a registered agent)
- **`--token <jwt>`** — JWT from `cerebrex hive register`
- **`--handler <file>`** — optional path to a `.mjs` module exporting `async function execute(task)` for custom task types
- **`--poll-interval <ms>`** — how often to poll for tasks (default 2000ms)
- **`--concurrency <n>`** — max tasks to run in parallel (default 1)
- **`--trace-port <port>` + `--trace-session <id>`** — emit each task execution as a TRACE step for full observability

#### HIVE — Built-in Task Handlers (New)
Workers handle these task types with no `--handler` file required:
- **`noop`** — completes immediately
- **`echo`** — returns payload as result
- **`fetch`** — makes an HTTP request (`{ url, method?, headers?, body? }`)
- **`memex-set`** — writes to local MEMEX (`{ key, value, namespace?, ttl? }`)
- **`memex-get`** — reads from local MEMEX (`{ key, namespace? }`)

#### HIVE — Coordinator Patches
- **`GET /tasks?status=<status>`** — added `status` query filter; workers use `?status=queued` to efficiently poll only actionable tasks
- **Agent `busy` state** — when a worker claims a task (`PATCH { status: 'running' }`), the owning agent is automatically marked `busy`; reverts to `idle` on completion/failure

#### TRACE + HIVE Integration
- Workers optionally emit a TRACE step for every task execution (start time, result, latency, errors) — the whole multi-agent run appears as a unified visual timeline in the dashboard

#### Docs
- **README.md** — rewrote HIVE section with complete worker flow, built-in task types table, custom handler example, TRACE integration example; roadmap updated with 4 new v0.7.2 checkmarks
- **INSTRUCTIONS.md** — expanded HIVE section with worker pattern, all built-in task types, full HIVE + TRACE observability walkthrough

---

## [0.7.1] — 2026-03-24

### Reliability & Doc Accuracy Patch

#### CLI — Auth
- **`cerebrex auth login` now verifies tokens** — calls `GET /v1/users/me` before saving credentials; fails fast with a clear error if the registry rejects the token. Prevents silent bad-token storage.

#### CLI — Version
- **VERSION constant synced** — `src/index.ts` banner was hardcoded at `0.6.2`; now correctly reads `0.7.0`.

#### FORGE — Generator
- **Generated code updated to FORGE v0.7.0** — header comment, User-Agent string, and README links in generated servers now reflect the correct version and URL (`therealcool.site`).
- **Dependency pins updated** — generated `package.json` now pins `@modelcontextprotocol/sdk ^1.27.1`, `agents ^0.7.9`, `zod ^4.3.6`, `wrangler ^4.0.0` (was `^1.0.0`, `^0.0.1`, `^3.22.0`, `^3.0.0`).

#### CI
- **Typecheck failures now block CI** — removed `continue-on-error: true` from the Typecheck CLI step. Type errors are build failures.

#### Registry Web UI
- **FORGE section fixed** — generated command was `cerebrex forge <name> --template <tmpl>` (command does not exist); now correctly generates `cerebrex build --spec <url> --output <dir>`.
- **FORGE form updated** — inputs now ask for OpenAPI spec URL and output directory instead of server name and template picker.
- **FORGE feature bullets updated** — now describe what the command actually does (OpenAPI parsing, Zod generation, transport options).

#### Docs
- **INSTRUCTIONS.md** — corrected command list (`forge` → `build`), fixed `auth login` description (asks for token, not username/email/password), fixed `@arealcoolco/memex-mcp` tool names (`memory_store`, `memory_recall`, `memory_forget`, `memory_list`).
- **CONTRIBUTING.md** — fixed stale domain (`arealcool.site` → `therealcool.site`), removed reference to `docs.cerebrex.dev`, corrected project structure tree to match actual repo layout, fixed local dev commands.

---

## [0.7.0] — 2026-03-24

### All 6 Modules Live — Data Sovereignty Release

#### HIVE — Cloud API + MCP Package
- **HIVE cloud API** — `GET/POST /v1/hive`, `GET/PATCH/DELETE /v1/hive/:id` — create and manage agent coordination configs from anywhere
- **D1 schema-v5.sql** — `hives` table with owner-scoped isolation, status lifecycle, UNIQUE(owner, name)
- **HIVE UI** — full browser interface in the registry dashboard: create, edit, delete, install instructions
- **`@arealcoolco/hive-mcp@1.0.0`** — MCP package with 5 tools: `hive_list`, `hive_create`, `hive_get`, `hive_update`, `hive_delete`
- **HIVE rate limit** — 30 writes/min per token

#### New Official MCP Packages (all featured in registry)
- **`@arealcoolco/fetch-mcp@1.0.0`** — `http_get`, `http_post`, `http_request` — AI agents can make HTTP requests
- **`@arealcoolco/datetime-mcp@1.0.0`** — `datetime_now`, `datetime_convert`, `datetime_diff`, `datetime_format` — timezone-aware time tools
- **`@arealcoolco/kvstore-mcp@1.0.0`** — `kv_set`, `kv_get`, `kv_delete`, `kv_list`, `kv_clear` — ephemeral session key-value store with TTL

#### Security Hardening
- **Real token authentication** — SHA-256 hashed tokens, never stored plaintext
- **Rate limits** — MEMEX writes: 120/min, HIVE writes: 30/min (KV-backed per-token)
- **Input validation** — HIVE name/status whitelisted; all user inputs sanitized
- **Token self-service** — `POST /v1/auth/tokens` — authenticated users can create scoped tokens; non-admins cannot escalate
- **JWT integrity** — HMAC-SHA256 signatures on HIVE tokens

#### Website + Whitepaper
- **therealcool.site is live** — full CerebreX whitepaper with manifesto, all 6 modules, quickstart
- All module badges updated to **live** (MEMEX and HIVE were showing "building"/"coming soon")
- Added **Proof of Work** section with real live metrics
- Added **Use Cases** section with 5 concrete scenarios
- Added **Data Sovereignty + Why Open Source** manifesto — why the infrastructure layer must be open
- `String.replace()` → `String.replaceAll()` fix — all 3 `__WHITEPAPER_URL__` occurrences now replaced

#### CLI — v0.7.0
- Version bumped to `0.7.0`

---

## [0.6.2] — 2026-03-23

### Registry — Users, Roles & Official Packages

- **`users` table** (schema-v3.sql) — `username`, `bio`, `website`, `avatar_url`, `role` (user/admin/banned), `created_at`; seeded from existing token owners
- **Role-based access control** — `isAdmin()` checks `REGISTRY_ADMIN_TOKEN` env var or D1 `users.role = 'admin'`
- **Profile API** — `GET /v1/users/me`, `PATCH /v1/users/me`, `GET /v1/users/:username`
- **Admin API** — `GET /v1/admin/users`, `PATCH /v1/admin/users/:username` (role/ban), `POST /v1/admin/packages/:name/feature`
- **Featured packages** — `featured` column on `packages` table; featured packages sorted first in list with ★ Official badge
- **Profile page** — `/u/:username` — public profile with bio, website, package list, join date
- **Account dashboard** — `/account` — token-gated; edit profile, view owned packages and token expiry
- **Admin panel** — `/admin` — user management (role changes, ban/unban) and package feature/unfeature controls
- **Auto-create user on signup/register** — `ensureUserExists()` creates user record on first token issuance
- **`arealcoolco` set as admin** — D1 `UPDATE users SET role='admin' WHERE username='arealcoolco'`

### Official MCP Packages Published

- **`@arealcoolco/nasa-mcp@1.0.0`** — APOD, Mars Rover Photos, Near-Earth Objects, Earth Imagery, Image Library (uses `NASA_API_KEY`, free DEMO_KEY works)
- **`@arealcoolco/openweathermap-mcp@1.0.0`** — Current weather, 5-day forecast, air quality, geocoding (requires `OWM_API_KEY`)
- **`@arealcoolco/github-mcp@1.0.0`** — Repos, issues, PRs, commits, users, search (requires `GITHUB_TOKEN`)
- All three packages featured (★ Official) in the registry

### CLI — v0.6.2

- `cerebrex configure <package>` — new command; adds an installed MCP package to Claude Desktop's `claude_desktop_config.json`; supports `--env KEY=VALUE`, `--dry-run`, auto-detects required env vars from README
- Version bumped to `0.6.2`

---

## [0.6.1] — 2026-03-23

### Registry Worker — Security & Feature Hardening

- **Semver latest resolution** — `latest` tag now resolves to the highest semver version, not insertion order
- **Package name ownership** — first publisher of a name owns it permanently; subsequent publishers blocked
- **Scope ownership** — first publisher of `@org/*` locks that scope; others cannot publish under it
- **Token expiry** — all new tokens issued with 1-year TTL (`expires_at` in D1)
- **Username enumeration fix** — signup now returns generic "Username not available" on conflict
- **Per-token publish rate limit** — 5 publishes/min per token (KV-backed, separate from IP rate limit)
- **Multipart tarball upload** — `POST /v1/packages` accepts `multipart/form-data` (JSON backward compat retained)
- **README field** — packages can include a `readme` string, stored in D1
- **Download counts** — `download_count` incremented on every tarball fetch (fire-and-forget)
- **Token revocation** — `DELETE /v1/auth/token` invalidates token server-side
- **Package deprecation** — `POST /v1/packages/:name/:version/deprecate` with `{"deprecated": true/false}`
- **Author filter** — `GET /v1/packages?author=<username>` filters by author
- **Download sort** — list endpoint returns packages sorted by `download_count DESC`
- **D1 schema migration** (schema-v2.sql) — adds `readme`, `download_count`, `deprecated`, `expires_at`, and indexes

### CLI — v0.6.1

- `cerebrex publish` — switched to multipart/form-data upload, added `--readme <file>` option and help examples
- `cerebrex deprecate <pkg> <version> [--undo]` — new command to deprecate/un-deprecate a version
- `cerebrex auth revoke` — calls `DELETE /v1/auth/token` on server before removing local credentials
- Version bumped to `0.6.1`

---

## [0.4.0] — 2026-03-22

### Web UI — Registry Browser (New)
- `GET /` on the registry Worker → full Registry Browser UI — search packages, view details, one-click copy install command, package metadata
- `GET /ui/trace` → Hosted Trace Explorer — drag-and-drop JSON trace files, full visual step timeline with latency/token stats
- Both UIs are self-contained HTML served from the registry Worker — no external assets, no additional infrastructure
- Cross-linked navigation between registry browser and trace explorer
- Responsive design, CerebreX dark theme, works on mobile

### CLI
- Version bumped to `0.4.0` to align with registry Worker release
- All 6 modules stable: FORGE, TRACE, MEMEX, AUTH, REGISTRY, HIVE

### Docs
- README fully updated: Web UI section added, "Website: Coming Soon" notice, roadmap updated
- CHANGELOG covers all releases from v0.1.0 through v0.4.0

---

## [0.3.2] — 2026-03-22

### Fix
- Added all missing runtime dependencies to `apps/cli/package.json` — `commander`, `chalk`, `ora`, `zod`, `@modelcontextprotocol/sdk`, `agents`, `inquirer`, `execa`, `yaml`, and `@cerebrex/*` workspace packages
- CI `Build CLI` step now passes; GitHub Actions pipeline is green

---

## [0.3.1] — 2026-03-22

### Fix
- `cerebrex validate <path>` now correctly uses the provided positional argument instead of always defaulting to `./cerebrex-output` (root cause: stale tsc-compiled `.js` artifacts in `src/` were shadowing `.ts` sources during bun bundling)
- Deleted all intermediate `.js`/`.d.ts` files from `src/` to prevent recurrence
- Added `"type": "module"` to CLI `package.json` — eliminates Node.js ESM reparsing warning
- Registry API paths corrected: `registry-client` now uses `/v1/` routes matching deployed Worker
- `publish()` method updated to send JSON + base64 tarball (Worker expects JSON, not FormData)
- Wired live registry URL throughout: `https://registry.therealcool.site`

---

## [0.3.0] — 2026-03-22

### HIVE — Multi-Agent Coordination (New)
- `cerebrex hive init` — initialize HIVE coordinator config with JWT secret
- `cerebrex hive start` — local HTTP coordinator on port 7433 with JWT-signed agent auth
- `cerebrex hive register` — register an agent, receive a 24h JWT token
- `cerebrex hive status` — live view of connected agents and task queue
- `cerebrex hive send` — dispatch tasks to registered agents with JWT auth
- HMAC-SHA256 JWT implementation (no external dependency)
- State persisted to `~/.cerebrex/hive/state.json`

### Registry Backend (New)
- Cloudflare Worker deployed at `https://registry.therealcool.site`
- D1 database `cerebrex-registry` for package metadata (name, version, description, tags)
- KV namespace `cerebrex-registry-tarballs` for tarball storage (up to 25MB per package)
- REST API: `POST /v1/packages`, `GET /v1/packages`, `GET /v1/packages/:name/:version`, `GET /v1/packages/:name/:version/download`, `DELETE /v1/packages/:name/:version`
- Bearer token auth for publish/unpublish operations
- Package name and semver validation

### Web Dashboard — Trace Explorer (New)
- `cerebrex trace view --session <id> --web` — opens trace in visual browser dashboard
- Self-contained HTML dashboard embedded in the CLI bundle (no external assets)
- Timeline view with expandable step details (inputs/outputs/errors)
- Per-step latency, token counts, error highlighting with color coding
- Multi-session sidebar, drag-and-drop JSON file loading
- Opens in system default browser with trace data pre-injected

### CI/CD
- Added `deploy-registry.yml` GitHub Actions workflow for automatic Worker deployment
- Registry auto-deploys on push to `workers/registry/` with `CLOUDFLARE_API_TOKEN` secret

---

## [0.2.1] — 2026-03-22

### Fix
- Changed shebang from `#!/usr/bin/env bun` to `#!/usr/bin/env node` for npm binary compatibility
- Removed all `workspace:*` dependencies from CLI `package.json` (bun bundles them anyway)
- Added `"files": ["dist/"]` to CLI `package.json` — only ships the bundle
- Removed `prepublishOnly` script to avoid double-build during `npm publish`
- `npm install -g cerebrex` now works correctly

---

## [0.2.0] — 2026-03-21

### MEMEX — Persistent Agent Memory (New)
- `cerebrex memex set <key> <value>` — store values with optional namespace, type, and TTL
- `cerebrex memex get <key>` — retrieve values with `--json` flag for raw output
- `cerebrex memex list` — list all entries, grouped by namespace; filter by `--namespace` or `--type`
- `cerebrex memex delete <key>` — remove a single entry
- `cerebrex memex clear` — wipe namespace or all entries (with confirmation prompt)
- `cerebrex memex namespaces` — list all active namespaces
- SHA-256 integrity checksums on every write; reads verify before returning
- TTL expiry enforced at read time — entries auto-evict when expired
- Local JSON storage at `~/.cerebrex/memex/<namespace>.json` — no cloud required
- Memory types: `episodic`, `semantic`, `working`

### REGISTRY — Authentication (New)
- `cerebrex auth login` — store token at `~/.cerebrex/.credentials` (mode 0600)
- `cerebrex auth logout` — revoke stored credentials
- `cerebrex auth status` — show active token source and preview
- `CEREBREX_TOKEN` env var always takes precedence over stored credentials
- `cerebrex publish` and `cerebrex install` now use real auth tokens; graceful "registry not yet available" message while backend is in development

### TRACE — Real HTTP Event Server (Rewrite)
- `cerebrex trace start` now launches a real `node:http` server on `127.0.0.1`
- Agents push `TraceStep` JSON to `POST /step`; server records to disk
- `cerebrex trace stop` calls `POST /stop` on the running server; falls back to saved JSON
- `cerebrex trace list` shows `[running]` badge for sessions with active PID files
- `GET /health` for liveness checks
- Graceful shutdown on `SIGINT`/`SIGTERM`

### VALIDATE — Real Checks (Rewrite)
- `cerebrex validate` now runs 7 real checks: file exists, MCP compliance, Zod schemas present, no hardcoded secrets, error handler sanitization, `wrangler.toml` present, TypeScript compilation
- `--strict` flag adds 3 OWASP checks: injection guard, auth validation, rate-limiting
- Replaced all fake `setTimeout` stubs with actual file inspection

### Build
- Version bumped to `0.2.0`
- Added missing dependencies: `execa ^9.0.0`, `yaml ^2.4.0`
- Fixed `build.ts` property access bugs (`spec.title`, `spec.endpoints.length`)
- All TypeScript packages now have individual `tsconfig.json` with correct `outDir`/`rootDir`

---

## [0.1.0] — 2026-03-01

### 🎉 Initial Release

**FORGE**
- Generate production-ready MCP servers from OpenAPI 3.x / Swagger 2.x specs
- One-command deploy to Cloudflare Workers via `cerebrex deploy`
- Zod input validation generated for all tool parameters
- Supports stdio, SSE, and Streamable HTTP transports
- MCP validator catches protocol violations before deploy

**TRACE**
- Record agent execution traces: `cerebrex trace start/stop/view`
- Timestamped step-by-step terminal renderer
- Local JSON storage in `~/.cerebrex/traces/`

**REGISTRY (Alpha)**
- `cerebrex publish` — publish MCP servers to the CerebreX Registry
- `cerebrex install <package>` — install community servers

### Built by A Real Cool Co.
*Gulf Coast, Mississippi — March 2026*
