<div align="center">

# CerebreX

### The Open-Source Agent Infrastructure OS

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![CI](https://github.com/therealcoolnerd/CerebreX/actions/workflows/ci.yml/badge.svg)](https://github.com/therealcoolnerd/CerebreX/actions/workflows/ci.yml)
[![GitHub Stars](https://img.shields.io/github/stars/therealcoolnerd/CerebreX?style=social)](https://github.com/therealcoolnerd/CerebreX)
[![Issues](https://img.shields.io/github/issues/therealcoolnerd/CerebreX)](https://github.com/therealcoolnerd/CerebreX/issues)

**Build. Test. Remember. Coordinate. Publish.**
The complete infrastructure layer for AI agents — in one CLI.

[🚀 Quickstart](#-quickstart) · [🗂 Structure](#-monorepo-structure) · [🛣 Roadmap](#-roadmap) · [🐛 Issues](https://github.com/therealcoolnerd/CerebreX/issues)

</div>

---

> **Status: v0.2.0 — Active Development**
> The CLI is fully functional and builds cleanly. npm package publishing is in progress. Contributions welcome.

---

## What is CerebreX?

CerebreX is an open-source **Agent Infrastructure OS** that gives developers the tools to build reliable, observable, and secure AI agents.

Five modules. One CLI.

| Module | Command | Status | What It Does |
|--------|---------|--------|-------------|
| 🔨 **FORGE** | `cerebrex build` | ✅ Working | Generate production MCP servers from any OpenAPI spec |
| 🔍 **TRACE** | `cerebrex trace` | ✅ Working | Record and replay agent execution step-by-step |
| 🧠 **MEMEX** | `cerebrex memex` | ✅ Working | Persistent memory with SHA-256 integrity + TTL |
| 🔑 **AUTH** | `cerebrex auth` | ✅ Working | Secure token storage for registry authentication |
| 📦 **REGISTRY** | `cerebrex publish` | 🔧 CLI ready, backend coming | Publish and install MCP servers |
| 🐝 **HIVE** | `cerebrex hive` | 📋 Planned v0.3 | Multi-agent coordination with JWT auth |

---

## ⚡ Quickstart

> **npm package coming soon.** For now, build from source:

```bash
# Clone the repo
git clone https://github.com/therealcoolnerd/CerebreX.git
cd CerebreX

# Install dependencies (requires Bun)
bun install

# Build packages in order
cd packages/types && bun run build && cd ../..
cd packages/core && bun run build && cd ../..
cd packages/registry-client && bun run build && cd ../..

# Build the CLI
cd apps/cli && bun run build

# Run it
node dist/index.js --help
```

**Install Bun:** https://bun.sh

---

## 🔨 FORGE — MCP Server Generation

Generate a production-ready MCP server from any OpenAPI spec:

```bash
# From a URL
node apps/cli/dist/index.js build --spec https://petstore3.swagger.io/api/v3/openapi.json --output ./my-server

# From a local file
node apps/cli/dist/index.js build --spec ./openapi.yaml --output ./my-server
```

Output is a Cloudflare Workers project with:
- Zod input validation on every tool
- MCP-compliant stdio/SSE/Streamable HTTP transports
- Ready for `wrangler deploy`

---

## 🔍 TRACE — Agent Execution Recording

```bash
# Start a trace session (runs in foreground, blocks)
node apps/cli/dist/index.js trace start --session my-agent --port 7432

# From your agent, push steps:
# POST http://localhost:7432/step
# Body: { "type": "tool_call", "toolName": "listPets", "inputs": {"limit": 10}, "latencyMs": 42, "tokens": 150 }

# Stop and save (from another terminal)
node apps/cli/dist/index.js trace stop --session my-agent

# View the recorded trace
node apps/cli/dist/index.js trace view --session my-agent
```

Traces are saved to `~/.cerebrex/traces/`.

---

## 🧠 MEMEX — Persistent Agent Memory

```bash
# Store a value
node apps/cli/dist/index.js memex set "user-pref" "dark mode" --namespace ui

# Retrieve it
node apps/cli/dist/index.js memex get "user-pref" --namespace ui

# List all memory
node apps/cli/dist/index.js memex list

# With TTL (auto-expires after 3600 seconds)
node apps/cli/dist/index.js memex set "session-ctx" "..." --ttl 3600
```

All writes are SHA-256 checksummed. Reads verify integrity before returning.
Storage: `~/.cerebrex/memex/<namespace>.json` — local, no cloud required.

---

## 🗂 Monorepo Structure

```
CerebreX/
├── apps/
│   └── cli/              # cerebrex CLI — the main package
│       ├── src/
│       │   ├── commands/     # build, trace, memex, auth, other-commands
│       │   └── core/         # forge/, trace/, memex/ engines
│       └── dist/             # built output (git-ignored, built by CI)
├── packages/
│   ├── core/             # @cerebrex/core — shared utilities
│   ├── types/            # @cerebrex/types — shared TypeScript types
│   └── registry-client/  # @cerebrex/registry — registry API client
├── .github/
│   └── workflows/
│       ├── ci.yml        # build + typecheck on push/PR
│       └── publish.yml   # npm publish on GitHub release
└── turbo.json
```

---

## 🔒 Security

Built security-first, aligned with the [OWASP Top 10 for Agentic Applications (2025)](https://genai.owasp.org).

- **Memory Integrity** — All MEMEX writes are SHA-256 checksummed. Reads verify before returning.
- **Zero Hardcoded Secrets** — `cerebrex validate` scans for hardcoded credentials and blocks deploy.
- **Input Validation** — Zod schemas validate every tool input in generated MCP servers.
- **Secure Credentials** — Auth tokens stored at `~/.cerebrex/.credentials` (mode 0600).

Found a vulnerability? Please read our [Security Policy](./SECURITY.md) and report it privately.

---

## 🤝 Contributing

Contributions are welcome. CerebreX is a solo-built open-source project — PRs, issues, and feedback all help.

```bash
# Fork and clone
git clone https://github.com/therealcoolnerd/CerebreX.git
cd CerebreX

# Install (requires Bun v1.0+)
bun install

# Build
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
- [ ] npm package live — `npm install -g cerebrex` *(v0.2 — in progress)*
- [ ] Registry backend — `registry.cerebrex.dev` *(v0.3)*
- [ ] HIVE — Multi-agent JWT coordination, Durable Objects *(v0.3)*
- [ ] Web dashboard — Visual trace explorer *(v0.3)*
- [ ] Enterprise tier + on-prem *(v1.0)*

---

## 📄 License

CerebreX is open source under the [Apache 2.0 License](./LICENSE).

---

<div align="center">

Built by [therealcoolnerd](https://github.com/therealcoolnerd) · Gulf Coast, Mississippi

*"The developer who builds the standard wins the ecosystem."*

</div>
