<div align="center">

<img src="https://arealcool.site/assets/cerebrex-banner.png" alt="CerebreX Banner" width="100%"/>

# CerebreX

### The Open-Source Agent Infrastructure OS

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/cerebrex.svg)](https://www.npmjs.com/package/cerebrex)
[![npm downloads](https://img.shields.io/npm/dw/cerebrex.svg)](https://www.npmjs.com/package/cerebrex)
[![CI](https://github.com/therealcoolnerd/CerebreX/actions/workflows/ci.yml/badge.svg)](https://github.com/therealcoolnerd/CerebreX/actions/workflows/ci.yml)
[![Discord](https://img.shields.io/discord/cerebrex?label=Discord&logo=discord)](https://discord.gg/cerebrex)
[![Twitter Follow](https://img.shields.io/twitter/follow/therealcoolnerd?style=social)](https://twitter.com/therealcoolnerd)

**Build. Test. Remember. Coordinate. Publish.**  
The complete infrastructure layer for AI agents — in one CLI.

[📖 Docs](https://docs.cerebrex.dev) · [🚀 Quickstart](#-quickstart) · [💬 Discord](https://discord.gg/cerebrex) · [🐛 Issues](https://github.com/therealcoolnerd/CerebreX/issues)

</div>

---

## What is CerebreX?

CerebreX is an open-source, Cloudflare-native **Agent Infrastructure OS** that gives every developer the tools they need to build reliable, observable, and secure AI agents.

Five modules. One CLI. Zero infrastructure headaches.

| Module | Command | What It Does |
|--------|---------|-------------|
| 🔨 **FORGE** | `cerebrex build` | Generate production MCP servers from any OpenAPI spec |
| 🔍 **TRACE** | `cerebrex trace` | Test and debug agent execution step-by-step |
| 🧠 **MEMEX** | `cerebrex memex` | Drop-in persistent memory for any AI agent |
| 🐝 **HIVE** | `cerebrex hive` | Coordinate multi-agent systems with authentication |
| 📦 **REGISTRY** | `cerebrex publish` | Publish and discover MCP servers and agent tools |

---

## ⚡ Quickstart

```bash
# Install the CLI
npm install -g cerebrex

# Generate an MCP server from any OpenAPI spec
cerebrex build --spec https://petstore3.swagger.io/api/v3/openapi.json

# Deploy to Cloudflare Workers
cerebrex deploy

# Start recording an agent trace
cerebrex trace start --session my-first-agent

# View the trace
cerebrex trace view --session my-first-agent
```

> **Time to first deployed MCP server: under 5 minutes.**

---

## 🗂 Monorepo Structure

```
cerebrex/
├── apps/
│   ├── cli/              # @cerebrex/cli — the main cerebrex CLI
│   └── docs/             # Documentation site (Astro)
├── packages/
│   ├── core/             # @cerebrex/core — shared utilities + engine
│   ├── types/            # @cerebrex/types — shared TypeScript types
│   └── registry-client/  # @cerebrex/registry — registry API client
├── .github/
│   ├── workflows/        # CI/CD pipelines
│   └── ISSUE_TEMPLATE/   # Bug reports, feature requests
└── turbo.json            # Turborepo configuration
```

---

## 📦 Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`cerebrex`](./apps/cli) | [![npm](https://img.shields.io/npm/v/cerebrex)](https://npmjs.com/package/cerebrex) | Main CLI — install this |
| [`@cerebrex/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@cerebrex/core)](https://npmjs.com/package/@cerebrex/core) | Core engine library |
| [`@cerebrex/types`](./packages/types) | [![npm](https://img.shields.io/npm/v/@cerebrex/types)](https://npmjs.com/package/@cerebrex/types) | Shared TypeScript types |
| [`@cerebrex/registry`](./packages/registry-client) | [![npm](https://img.shields.io/npm/v/@cerebrex/registry)](https://npmjs.com/package/@cerebrex/registry) | Registry client SDK |

---

## 🔒 Security

CerebreX is built security-first, aligned with the [OWASP Top 10 for Agentic Applications (2025)](https://genai.owasp.org).

- **Memory Integrity** — All MEMEX writes are SHA-256 checksummed. Reads verify integrity before returning.
- **Zero Hardcoded Secrets** — FORGE validator scans generated code and blocks any hardcoded credentials.
- **Mutual Auth in HIVE** — All agent-to-agent messages require signed short-lived JWTs.
- **Input Validation** — Zod schemas validate every tool input. No raw user data reaches API calls.
- **Audit Logs** — All MEMEX operations, HIVE messages, and Registry publishes log to Cloudflare D1.

Found a vulnerability? Please read our [Security Policy](./SECURITY.md) and report it privately.

---

## 🤝 Contributing

We welcome contributions from everyone. CerebreX is built for the global developer community.

Please read our [Contributing Guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md) before opening a PR.

**Quick contribution guide:**
1. Fork the repo
2. `git clone` your fork
3. `bun install` — installs all workspace dependencies
4. `bun run build` — builds all packages
5. `bun run test` — runs the full test suite
6. Open a PR against `main`

---

## 🛣 Roadmap

- [x] FORGE — MCP server generation *(v0.1)*
- [x] TRACE — Real HTTP event server, step recording *(v0.2)*
- [x] REGISTRY — Publish + install + auth *(v0.2)*
- [x] MEMEX — Persistent agent memory with integrity checksums *(v0.2)*
- [x] VALIDATE — Real MCP + OWASP compliance checks *(v0.2)*
- [ ] Registry backend — `registry.cerebrex.dev` *(v0.3)*
- [ ] Cloud dashboard — Visual trace explorer *(v0.3)*
- [ ] HIVE — Multi-agent coordination *(v0.3)*
- [ ] Enterprise tier + on-prem *(v1.0)*

See the full [roadmap in our docs](https://docs.cerebrex.dev/roadmap).

---

## 📄 License

CerebreX is open source under the [Apache 2.0 License](./LICENSE).

The CerebreX cloud platform (cerebrex.dev) is governed by a separate [Commercial License](./COMMERCIAL.md).

---

<div align="center">

Built with 🔥 by [A Real Cool Co.](https://arealcool.site) · Gulf Coast, Mississippi

*"The developer who builds the standard wins the ecosystem."*

</div>
