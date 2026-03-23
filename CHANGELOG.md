# CerebreX Changelog

All notable changes to this project are documented here.

This project follows [Semantic Versioning](https://semver.org/) and [Conventional Commits](https://www.conventionalcommits.org/).

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
