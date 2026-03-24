<div align="center">

# CerebreX

### The Open-Source Agent Infrastructure OS

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![CI](https://github.com/arealcoolco/CerebreX/actions/workflows/ci.yml/badge.svg)](https://github.com/arealcoolco/CerebreX/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/cerebrex.svg)](https://www.npmjs.com/package/cerebrex)
[![GitHub Stars](https://img.shields.io/github/stars/arealcoolco/CerebreX?style=social)](https://github.com/arealcoolco/CerebreX)
[![Issues](https://img.shields.io/github/issues/arealcoolco/CerebreX)](https://github.com/arealcoolco/CerebreX/issues)

**Build. Test. Remember. Coordinate. Publish.**
The complete infrastructure layer for AI agents — in one CLI.

[🚀 Quickstart](#-quickstart) · [🗂 Structure](#-monorepo-structure) · [🛣 Roadmap](#-roadmap) · [🐛 Issues](https://github.com/arealcoolco/CerebreX/issues)

</div>

---

> **Status: v0.7.0 — All 6 modules live, 8 official MCP packages, HIVE cloud API, data sovereignty manifesto**
> `npm install -g cerebrex` — FORGE, TRACE, MEMEX, AUTH, REGISTRY, and HIVE are all working.
>
> **Live:** Registry UI → `https://registry.therealcool.site`
> **Live:** Trace Explorer → `https://registry.therealcool.site/ui/trace`
> **Live:** Website + Whitepaper → `https://therealcool.site`

---

## What is CerebreX?

CerebreX is an open-source **Agent Infrastructure OS** — the complete toolchain developers need to build reliable, observable, and secure AI agents.

Six modules. One CLI. One registry. One coordination layer.

| Module | Command | Status | What It Does |
|--------|---------|--------|-------------|
| 🔨 **FORGE** | `cerebrex build` | ✅ Working | Generate production MCP servers from any OpenAPI spec |
| 🔍 **TRACE** | `cerebrex trace` | ✅ Working | Record agent execution + visual web dashboard |
| 🧠 **MEMEX** | `cerebrex memex` | ✅ Working | Persistent memory with SHA-256 integrity + TTL |
| 🔑 **AUTH** | `cerebrex auth` | ✅ Working | Secure token storage for registry authentication |
| 📦 **REGISTRY** | `cerebrex publish` | ✅ Working | Publish and install MCP servers (live registry + web UI) |
| 🐝 **HIVE** | `cerebrex hive` | ✅ Working | Multi-agent coordination with JWT auth |

---

## ⚡ Quickstart

```bash
npm install -g cerebrex
cerebrex --help
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
# Initialize a HIVE coordinator
cerebrex hive init --name my-hive

# Start the coordinator (runs on port 7433)
cerebrex hive start

# In another terminal — register an agent and get a JWT
cerebrex hive register --id agent-1 --name "Summarizer" --capabilities summarize,classify

# Check who's connected
cerebrex hive status

# Send a task to an agent (use the JWT printed by register)
cerebrex hive send --agent agent-1 --type summarize --payload '{"text":"..."}' --token <JWT>
```

HIVE runs a local HTTP coordinator with JWT-signed agent authentication.
Agents register, receive tasks, and report results back via the REST API.
State is persisted to `~/.cerebrex/hive/state.json`.

---

## 🌐 Web UI

The CerebreX registry includes a browser-based UI served directly from the Worker — no install required.

| URL | What It Does |
|-----|-------------|
| `/` | Registry browser — search packages, view details, copy install commands |
| `/ui/trace` | Hosted Trace Explorer — drag-and-drop JSON trace files, full visual timeline |

---

## 🗂 Monorepo Structure

```
CerebreX/
├── apps/
│   ├── cli/              # cerebrex CLI — the main published package
│   │   ├── src/
│   │   │   ├── commands/ # build, trace, memex, auth, hive, other-commands
│   │   │   └── core/     # forge/, trace/, memex/ engines + dashboard
│   │   └── dist/         # built output (git-ignored, built by CI)
│   └── dashboard/        # Standalone trace explorer HTML
│       └── src/index.html
├── workers/
│   └── registry/         # Cloudflare Worker — live registry backend + Web UI
│       ├── src/index.ts  # REST API (D1 + KV) + embedded HTML pages
│       ├── schema.sql    # D1 database schema
│       └── wrangler.toml
├── packages/
│   ├── core/             # @cerebrex/core — shared utilities
│   ├── types/            # @cerebrex/types — shared TypeScript types
│   └── registry-client/  # @cerebrex/registry — registry API client
├── .github/
│   └── workflows/
│       ├── ci.yml              # build + typecheck on push/PR
│       ├── publish.yml         # npm publish on GitHub release
│       └── deploy-registry.yml # auto-deploy registry Worker
└── turbo.json
```

---

## 🔒 Security

Built security-first, aligned with the [OWASP Top 10 for Agentic Applications (2025)](https://genai.owasp.org).

- **Memory Integrity** — All MEMEX writes are SHA-256 checksummed. Reads verify before returning.
- **Zero Hardcoded Secrets** — `cerebrex validate` scans for hardcoded credentials and blocks deploy.
- **Input Validation** — Zod schemas validate every tool input in generated MCP servers.
- **Secure Credentials** — Auth tokens stored at `~/.cerebrex/.credentials` (mode 0600).
- **JWT Agent Auth** — HIVE uses HMAC-SHA256 signed JWTs for all agent communications.

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
- [ ] Custom domain — `registry.cerebrex.dev` *(next)*
- [ ] Agent test runner — `cerebrex test` with replay + assertions *(v0.8)*
- [ ] Enterprise tier + on-prem *(v1.0)*

---

## 📄 License

CerebreX is open source under the [Apache 2.0 License](./LICENSE).

---

<div align="center">

Built by [A Real Cool Co.](https://therealcool.site) · Gulf Coast, Mississippi

*"The developer who builds the standard wins the ecosystem."*

</div>
