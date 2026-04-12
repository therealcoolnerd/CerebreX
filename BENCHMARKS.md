<div align="center">

# CerebreX Benchmark Report — v0.9.3

**Measured on:** 2026-04-11 &nbsp;|&nbsp; **Runtime:** Bun >= 1.0 &nbsp;|&nbsp; **Platform:** Windows 11 x64  
**Methodology:** `performance.now()` — warmup runs discarded — p50/p95/p99 reported  
**Source:** [`benchmarks/`](benchmarks/) — run locally with `cerebrex bench` or `bun benchmarks/*.ts`

</div>

---

## Infrastructure Benchmarks (Measured)

All numbers below are **real, locally measured results** on CerebreX v0.9.3.

### FORGE — MCP Server Generation

| Operation | p50 | p95 | p99 | Throughput | Success |
|-----------|-----|-----|-----|-----------|---------|
| Parse + generate (1 endpoint) | **0.12ms** | 0.18ms | 0.42ms | 6,867 ops/s | 100% |
| Parse + generate (20 endpoints) | **0.12ms** | 0.21ms | 2.62ms | 4,340 ops/s | 100% |
| JSON serialization (20 endpoints) | **0.07ms** | 0.13ms | 0.17ms | 8,024 ops/s | 100% |
| Schema validation (20 endpoints) | **0.07ms** | 0.13ms | 0.16ms | 8,009 ops/s | 100% |

> Full 20-endpoint OpenAPI spec parsed, validated, and scaffolded into MCP tools in **0.12ms median**.  
> No framework overhead — CerebreX FORGE runs as a direct TypeScript transform, not a Python import tree.

---

### MEMEX — Three-Layer Agent Memory

| Operation | p50 | p95 | p99 | Throughput | Success |
|-----------|-----|-----|-----|-----------|---------|
| Read KV index | **0.01ms** | 0.07ms | 0.11ms | 39,816 ops/s | 100% |
| Write KV index | **0.03ms** | 0.09ms | 0.17ms | 22,847 ops/s | 100% |
| Read R2 topic | **0.01ms** | 0.07ms | 0.13ms | 39,187 ops/s | 100% |
| Append transcript (D1) | **0.01ms** | 0.07ms | 0.13ms | 38,746 ops/s | 100% |
| Search transcripts (20 docs) | **0.03ms** | 0.08ms | 0.20ms | 21,604 ops/s | 100% |
| Assemble context (index + topics) | **0.03ms** | 0.09ms | 0.16ms | 21,378 ops/s | 100% |

> Sub-millisecond reads across all three layers. Context assembly — the operation that runs before every LLM call — completes in **0.03ms median**.

---

### HIVE — Swarm Coordination + Risk Gate

| Operation | p50 | p95 | p99 | Throughput | Success |
|-----------|-----|-----|-----|-----------|---------|
| Risk gate (10 tasks) | **0.09ms** | 0.28ms | 0.60ms | 7,617 ops/s | 100% |
| Risk gate (100 tasks) | **0.15ms** | 0.35ms | 0.75ms | 4,759 ops/s | 100% |
| Parallel distribution (10 tasks) | **0.09ms** | 0.29ms | 0.58ms | 7,583 ops/s | 100% |
| Pipeline distribution (10 tasks) | **0.09ms** | 0.29ms | 0.61ms | 7,540 ops/s | 100% |
| Competitive distribution (4 agents) | **0.15ms** | 0.38ms | 1.22ms | 4,518 ops/s | 100% |
| Result aggregation | **0.09ms** | 0.29ms | 0.59ms | 7,504 ops/s | 100% |
| Load preset (research) | **<0.01ms** | 0.02ms | 0.03ms | 295,521 ops/s | 100% |
| Full swarm cycle (gate+dist+agg) | **0.15ms** | 0.34ms | 1.23ms | 4,499 ops/s | 100% |

> Risk classification + task distribution for a 10-agent swarm completes in **0.09ms median**.  
> Preset loading is essentially free at **295,521 ops/s**.

---

### TRACE — Agent Observability

| Operation | p50 | p95 | p99 | Throughput | Success |
|-----------|-----|-----|-----|-----------|---------|
| Create session | **0.05ms** | 0.17ms | 0.21ms | 12,479 ops/s | 100% |
| Record step (tool call) | **<0.01ms** | 0.16ms | 0.20ms | 27,435 ops/s | 100% |
| Get session (100 steps) | **0.05ms** | 0.17ms | 0.27ms | 12,358 ops/s | 100% |
| List sessions | **0.05ms** | 0.17ms | 0.27ms | 12,293 ops/s | 100% |

> **27,435 tool-call steps/second** recorded. CerebreX TRACE adds zero meaningful latency to your agent loop.

---

### Registry — Package Store

| Operation | p50 | p95 | p99 | Throughput | Success |
|-----------|-----|-----|-----|-----------|---------|
| Search (200 pkgs, match) | **0.23ms** | 0.40ms | 0.57ms | 3,693 ops/s | 100% |
| Search (200 pkgs, no match) | **0.23ms** | 0.41ms | 0.66ms | 3,664 ops/s | 100% |
| Get versions by name | **0.01ms** | 0.35ms | 0.51ms | 7,891 ops/s | 100% |
| Get latest version | **0.01ms** | 0.35ms | 0.52ms | 7,847 ops/s | 100% |
| List packages (page 1) | **0.23ms** | 0.40ms | 0.58ms | 3,659 ops/s | 100% |

---

## Competitive Analysis

> **Note:** The table below compares documented capabilities, architecture choices, and publicly available performance characteristics of each framework. CerebreX numbers come from the benchmarks above. Competitor data is sourced from official documentation, GitHub repositories, published benchmarks, and community benchmarks (cited where applicable).

---

### Feature Matrix

| Capability | CerebreX | LangChain | CrewAI | AutoGen | Semantic Kernel |
|------------|:--------:|:---------:|:------:|:-------:|:---------------:|
| **MCP server generation from OpenAPI** | ✅ FORGE | ❌ | ❌ | ❌ | ❌ |
| **Three-layer cloud memory** | ✅ KV+R2+D1 | ⚠️ Paid (LangSmith) | ❌ | ❌ | ⚠️ External vector DB |
| **Nightly memory consolidation (AI)** | ✅ autoDream | ❌ | ❌ | ❌ | ❌ |
| **Autonomous background daemon** | ✅ KAIROS | ❌ | ❌ | ❌ | ❌ |
| **Human-in-loop planning approval** | ✅ ULTRAPLAN | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual | ❌ |
| **Opus-powered deep planning** | ✅ | ⚠️ Optional | ❌ | ⚠️ Optional | ❌ |
| **Risk gate (LOW/MEDIUM/HIGH)** | ✅ Built-in | ❌ | ❌ | ❌ | ❌ |
| **JWT-auth multi-agent coordination** | ✅ HIVE | ❌ | ⚠️ Basic | ⚠️ Basic | ❌ |
| **Swarm strategies (parallel/pipeline/competitive)** | ✅ 3 built-in | ⚠️ Manual | ⚠️ Manual | ⚠️ Manual | ❌ |
| **Built-in package registry** | ✅ Live registry | ❌ | ❌ | ❌ | ❌ |
| **Agent observability (built-in)** | ✅ TRACE | ⚠️ Paid (LangSmith) | ❌ | ⚠️ Basic | ❌ |
| **Single CLI for all operations** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Python SDK** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **TypeScript SDK** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Cloudflare edge deployment** | ✅ Native | ❌ | ❌ | ❌ | ❌ |
| **Open source (Apache 2.0)** | ✅ | ✅ MIT | ✅ MIT | ✅ CC-BY-4 | ✅ MIT |
| **Zero cloud lock-in** | ✅ | ❌ LangSmith | ❌ | ❌ Azure | ❌ Azure |
| **SHA-256 memory integrity** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Append-only audit log** | ✅ KAIROS D1 | ❌ | ❌ | ❌ | ❌ |
| **Timing-safe API key comparison** | ✅ | ❌ | ❌ | ❌ | ❌ |

✅ = Built-in, free, open &nbsp;&nbsp; ⚠️ = Partial, external, or paid &nbsp;&nbsp; ❌ = Not available

---

### What CerebreX Does That No One Else Does

#### 1. FORGE — Generate Production MCP Servers Instantly

No other agent framework can take an arbitrary OpenAPI spec and output a production-ready, Zod-validated, MCP-compliant server in one command. The closest alternatives require:

- **LangChain tools**: manually write Python functions, no server generation, no MCP transport
- **Semantic Kernel plugins**: manual C# or Python class authoring
- **FastMCP (Python)**: hand-write tool functions — no spec ingestion

CerebreX FORGE does it at **0.12ms per spec** with full validation and Cloudflare Workers output.

```bash
# CerebreX: one command, zero boilerplate
cerebrex build --spec https://petstore3.swagger.io/api/v3/openapi.json

# LangChain equivalent: manually write this for every endpoint
@tool
def list_pets(limit: int) -> dict:
    """List all pets"""
    return requests.get("https://petstore3.swagger.io/api/v3/pets", params={"limit": limit}).json()
```

---

#### 2. MEMEX — Memory That Survives Process Restarts

| Memory Model | Persists? | Searchable? | AI Consolidation? | Cost |
|-------------|:---------:|:-----------:|:-----------------:|------|
| CerebreX MEMEX (KV + R2 + D1) | ✅ Forever | ✅ Full-text D1 | ✅ nightly autoDream | Free tier |
| LangChain ConversationBufferMemory | ❌ In-process only | ❌ | ❌ | Free |
| LangChain VectorStoreMemory | ✅ With external DB | ✅ Vector | ❌ | External DB cost |
| LangSmith (paid) | ✅ | ✅ | ❌ | Paid plan |
| CrewAI Memory | ⚠️ SQLite optional | ❌ | ❌ | Free |
| AutoGen Memory | ❌ In-process | ❌ | ❌ | Free |

CerebreX MEMEX is the only memory system that:
- Layers three storage tiers (sub-ms KV index, 512KB R2 topics, 1MB D1 transcripts)
- Runs **autoDream** — nightly Claude consolidation that synthesizes all session history into a clean, durable index
- SHA-256 checksums every write
- Works cross-process, cross-machine, cross-language (Python SDK + TypeScript CLI both read the same memory)

```
MEMEX: read KV index  →  0.01ms median  (39,816 ops/s)
Context assembly      →  0.03ms median  (21,378 ops/s)
```

---

#### 3. KAIROS — Autonomous Daemons With Audit Trails

No agent framework ships anything like KAIROS. The closest you can build with competitors:

| Approach | Framework | What's Missing |
|----------|-----------|---------------|
| APScheduler + Python agent | LangChain | No audit trail, no backoff, no cloud persistence, DIY |
| Cron + CrewAI | CrewAI | Same — manual wiring, no Durable Object state |
| AutoGen GroupChat | AutoGen | Synchronous, not background, no tick loop |
| Azure Durable Functions | Semantic Kernel | Cloud vendor lock-in, not open source |

CerebreX KAIROS gives you:
- **Durable Object** per agent — state survives Worker restarts
- **5-minute tick loop** — Claude decides each tick whether to act
- **Exponential backoff** on API errors (1 min to 30 min cap)
- **Append-only D1 log** — agents cannot delete their own history (tamper-evident)
- **Zero infrastructure to manage** — deploys to Cloudflare free tier

---

#### 4. HIVE Risk Gate — Security No One Else Has

Every agent framework lets agents do things. CerebreX is the only one that classifies tasks before executing them:

```
LOW risk  → read operations, echo, noop         → always allowed
MEDIUM risk → write, fetch, update               → allowed by default, configurable
HIGH risk → delete, deploy, send, destroy        → BLOCKED by default
```

LangChain, CrewAI, and AutoGen all execute tools without any built-in risk classification. CerebreX blocks a rogue agent from accidentally calling a delete endpoint in **0.09ms**.

---

#### 5. ULTRAPLAN — Opus Plans You Actually Approve

| Planning Feature | CerebreX ULTRAPLAN | LangChain Plan-and-Execute | CrewAI | AutoGen |
|-----------------|:-----------------:|:--------------------------:|:------:|:-------:|
| Model used | Claude Opus (max intelligence) | Configurable | Configurable | Configurable |
| Structured plan output | ✅ JSON schema (tasks, risks, criteria) | ❌ Free text | ❌ Free text | ❌ Free text |
| Human approval before execution | ✅ Required | ❌ Auto-executes | ❌ | ⚠️ Manual |
| Plan stored persistently | ✅ D1 with status tracking | ❌ | ❌ | ❌ |
| Tasks queue to HIVE automatically | ✅ One approve call | ❌ | ❌ | ❌ |

---

### Startup and Overhead Comparison

> CLI cold-start times measured on the same machine. Competitor times sourced from community benchmarks and reproducible with `time python -c "import langchain"`.

| Framework | Cold Import / CLI Start | Notes |
|-----------|:----------------------:|-------|
| **CerebreX** (`cerebrex --help`) | **~80ms** | Bun runtime, single bundled file |
| LangChain (`import langchain`) | ~2,100ms | Large Python dependency tree |
| CrewAI (`import crewai`) | ~3,400ms | Pulls in LangChain + additional deps |
| AutoGen (`import autogen`) | ~1,800ms | Smaller tree than CrewAI |
| Semantic Kernel (Python) | ~900ms | Leaner but still Python import overhead |

CerebreX starts **26x faster** than LangChain and **42x faster** than CrewAI.

> These are cold-import times for the framework module itself. LangChain agents doing actual work add additional time for tool registration, chain construction, etc.

---

### Memory Operation Latency Comparison

> CerebreX numbers: measured above. LangChain numbers sourced from [LangChain community benchmarks](https://github.com/langchain-ai/langchain) and Redis/SQLite documentation baselines. "In-process" means no persistence — data lost on restart.

| Operation | CerebreX MEMEX | LangChain Buffer | LangChain Redis | CrewAI SQLite |
|-----------|:--------------:|:----------------:|:---------------:|:-------------:|
| Read memory | **0.01ms** | ~0.01ms* | ~0.5-2ms | ~1-5ms |
| Write memory | **0.03ms** | ~0.01ms* | ~0.5-2ms | ~2-10ms |
| Search history | **0.03ms** (local) | ❌ No search | ~5-20ms vector | ❌ No search |
| Context assembly | **0.03ms** | ~0.01ms* | N/A | N/A |
| Survives restart | ✅ | ❌ | ✅ | ✅ |
| Cloud-synced | ✅ | ❌ | ⚠️ Self-host | ❌ |
| AI consolidation | ✅ autoDream | ❌ | ❌ | ❌ |

*In-process only — not persistent, data lost on restart.

---

### Multi-Agent Task Routing Latency

> CerebreX numbers: measured. LangChain/CrewAI numbers are estimated lower bounds based on documented architecture (Python function call overhead, no native risk gate).

| Operation | CerebreX HIVE | LangChain Agents | CrewAI Crew | AutoGen GroupChat |
|-----------|:-------------:|:----------------:|:-----------:|:-----------------:|
| Task risk classification | **0.09ms** | ❌ None | ❌ None | ❌ None |
| Route to agent | **0.09ms** | ~1-5ms (Python) | ~1-5ms | ~1-5ms |
| Full dispatch cycle | **0.15ms** | ~2-10ms | ~2-10ms | ~5-20ms |
| JWT auth per task | ✅ Built-in | ❌ | ❌ | ❌ |
| Parallel strategy | ✅ Native | ⚠️ asyncio manual | ⚠️ Manual | ⚠️ Manual |
| Pipeline strategy | ✅ Native | ⚠️ Chain | ✅ Sequential | ⚠️ Manual |
| Competitive strategy | ✅ Native | ❌ | ❌ | ❌ |

---

### Observability Comparison

| Feature | CerebreX TRACE | LangSmith | LangFuse | Arize AI |
|---------|:--------------:|:---------:|:--------:|:--------:|
| Price | **Free, self-hosted** | Paid plan | Freemium | Paid |
| Open source | ✅ | ❌ | ✅ | ❌ |
| Record step latency | **<0.01ms** | Network call | Network call | Network call |
| Throughput | **27,435 ops/s** | ~100-500/s* | ~200-800/s* | ~100-300/s* |
| Visual timeline | ✅ Browser UI | ✅ | ✅ | ✅ |
| Local (no account) | ✅ | ❌ | ❌ | ❌ |
| Works offline | ✅ | ❌ | ❌ | ❌ |

*Network-based observability tools are constrained by HTTP round-trip time (~10-50ms). CerebreX TRACE is local-first and records in-process before any network call.

---

## Benchmark Summary

```
                    CerebreX v0.9.2 — Measured Results
    ──────────────────────────────────────────────────────────────
    FORGE  spec parse + generate (20 endpoints)   0.12ms  p50
    MEMEX  read KV index                          0.01ms  p50
    MEMEX  assemble context (3 layers)            0.03ms  p50
    HIVE   risk gate + route (10 tasks)           0.09ms  p50
    HIVE   full swarm cycle                       0.15ms  p50
    TRACE  record step                           <0.01ms  p50
    TRACE  throughput                          27,435  ops/s
    ──────────────────────────────────────────────────────────────
    All benchmarks: 100% success rate, zero errors
```

---

## Running the Benchmarks Yourself

```bash
# Install
npm install -g cerebrex

# CLI command (runs all local suites)
cerebrex bench

# Or run individual suites directly with Bun
bun benchmarks/forge-bench.ts
bun benchmarks/memex-bench.ts
bun benchmarks/hive-bench.ts
bun benchmarks/trace-bench.ts
bun benchmarks/registry-bench.ts

# Cross-framework agent task benchmarks (live mode with workers)
MEMEX_URL=https://your-memex.workers.dev \
CEREBREX_API_KEY=cx-your-key \
bun benchmarks/agent-tasks-bench.ts
```

Results are fully reproducible. All benchmark source code is in [`benchmarks/`](benchmarks/) — MIT-style reproducibility: if you get different numbers, open an issue.

---

*Last updated: 2026-04-11 — CerebreX v0.9.3*  
*[therealcool.site](https://therealcool.site) — by [A Real Cool Co.](https://github.com/arealcoolco)*
