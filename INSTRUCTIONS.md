# CerebreX — Testing & Onboarding Guide

Everything you need to go from zero to running AI agents with memory, tooling, and coordination.

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

You should see all 6 commands: `forge`, `trace`, `memex`, `auth`, `hive`, `publish`.

---

## 2 — Create an Account on the Registry

The CerebreX registry is live at [registry.therealcool.site](https://registry.therealcool.site).

**Sign up:**
```bash
cerebrex auth login
# follow the prompts — enter a username, email, and password
# your token is stored at ~/.cerebrex/.credentials (mode 0600)
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

This writes to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

Restart Claude Desktop after configuring.

---

## 5 — Test MEMEX (Persistent Memory)

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
```

Memories are stored locally at `~/.cerebrex/memex/` with SHA-256 checksums.

**Test cloud MEMEX via MCP:**
Once `@arealcoolco/memex-mcp` is configured in Claude Desktop, open Claude and say:
> "Store the memory: key='test', value='hello from cerebrex', agent='demo'"

Then:
> "Recall my memory with key 'test' for agent 'demo'"

---

## 6 — Test HIVE (Multi-Agent Coordination)

```bash
# initialize a local coordinator
cerebrex hive init --name my-first-hive

# start it (runs on port 7433)
cerebrex hive start &

# register agents
cerebrex hive register --id researcher --name "Researcher" --capabilities search,read
cerebrex hive register --id writer --name "Writer" --capabilities write,edit

# check status
cerebrex hive status

# send a task (use the JWT printed by register)
cerebrex hive send --agent researcher --type search --payload '{"query":"AI infrastructure"}' --token <JWT>

# stop the coordinator
cerebrex hive stop
```

**Test cloud HIVE via MCP:**
Once `@arealcoolco/hive-mcp` is configured in Claude Desktop with `CEREBREX_TOKEN=<your-token>`, say:
> "Create a new hive called 'test-hive' with config {}"

Then:
> "List all my hives"

---

## 7 — Test TRACE (Observability)

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

---

## 8 — Test FORGE (MCP Server Generation)

```bash
# scaffold a new MCP server from an OpenAPI spec
cerebrex build --spec https://petstore3.swagger.io/api/v3/openapi.json --output ./my-petstore-mcp

# validate it before publishing
cerebrex validate ./my-petstore-mcp
cerebrex validate ./my-petstore-mcp --strict  # OWASP checks

ls ./my-petstore-mcp/
# src/index.ts — tool implementation
# package.json — pre-configured
# wrangler.toml — ready for Cloudflare Workers
```

---

## 9 — Publish to the Registry

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

## 10 — Test the Registry Web UI

Open [registry.therealcool.site](https://registry.therealcool.site) in a browser:

1. Browse the **featured packages** — click any to see metadata and install command
2. Use the **search bar** — try "github", "nasa", "fetch"
3. Sign up and visit **/account** — view your tokens, packages, profile
4. Drag a trace JSON file into the **Trace Explorer** at `/ui/trace`

---

## Packages Reference

| Package | Tools | Requires |
|---------|-------|---------|
| `@arealcoolco/memex-mcp` | `memex_store`, `memex_recall`, `memex_delete`, `memex_list` | `CEREBREX_TOKEN` |
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

---

## Troubleshooting

**`cerebrex: command not found`**
```bash
npm install -g cerebrex
# or if using nvm:
node $(which cerebrex)
```

**Auth token not working**
```bash
cerebrex auth status    # check current state
cerebrex auth logout    # clear stored credentials
cerebrex auth login     # re-authenticate
```

**Package not found after install**
```bash
# packages live at:
ls ~/.cerebrex/packages/
```

**Claude Desktop not showing MCP tools**
- Restart Claude Desktop after running `cerebrex configure`
- Check `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
- Confirm the package binary exists at the path in the config

---

## Links

- **Registry:** [registry.therealcool.site](https://registry.therealcool.site)
- **Whitepaper:** [therealcool.site](https://therealcool.site)
- **GitHub:** [github.com/arealcoolco/CerebreX](https://github.com/arealcoolco/CerebreX)
- **npm:** [npmjs.com/package/cerebrex](https://www.npmjs.com/package/cerebrex)
- **Issues:** [github.com/arealcoolco/CerebreX/issues](https://github.com/arealcoolco/CerebreX/issues)

---

*Built by A Real Cool Co. — Gulf Coast, Mississippi*
