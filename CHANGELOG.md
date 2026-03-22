# CerebreX Changelog

All notable changes to this project are documented here.

This project follows [Semantic Versioning](https://semver.org/) and [Conventional Commits](https://www.conventionalcommits.org/).

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
