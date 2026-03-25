# CerebreX Changelog

All notable changes to this project are documented here.

This project follows [Semantic Versioning](https://semver.org/) and [Conventional Commits](https://www.conventionalcommits.org/).

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
