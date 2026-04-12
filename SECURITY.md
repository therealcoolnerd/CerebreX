# Security Policy

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability in CerebreX, please report it responsibly:

### Private Disclosure

1. **Email:** security@arealcool.site
2. **Subject line:** `[SECURITY] CerebreX — <brief description>`
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

We will acknowledge your report within **48 hours** and aim to resolve confirmed vulnerabilities within **7 days** for critical issues and **30 days** for non-critical ones.

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| `0.9.x` (current) | ✅ Active — security patches applied same-day |
| `0.8.x` and older | ❌ Please upgrade to `0.9.x` |

---

## Security Design Principles

CerebreX is built with security as a first-class concern, aligned with the [OWASP Top 10 for Agentic Applications (2025)](https://genai.owasp.org).

### Threat Model and Mitigations

| Threat | Mitigation |
|--------|-----------|
| **Prompt Injection** | Input sanitization on all agent inputs; TRACE injection detection |
| **Memory Poisoning** | SHA-256 checksums on all local MEMEX writes; reads verify integrity before returning |
| **Memory Flooding** | Hard size limits: transcripts ≤1MB, topics ≤512KB, index ≤25KB, ULTRAPLAN goals ≤50KB |
| **Path Traversal / Key Injection** | agentId and topic names restricted to `^[a-zA-Z0-9_-]+$` (1–128 chars) on all MEMEX and KAIROS routes |
| **Timing Oracle Attacks on API Keys** | MEMEX and KAIROS workers use constant-time XOR comparison (`timingSafeEqual`) for all API key checks — never `===` |
| **Unauthenticated Token Issuance** | HIVE `POST /token` requires `registration_secret` matching the hive config (constant-time compare via `crypto.timingSafeEqual`) |
| **JWT Forgery / Replay** | HMAC-SHA256 signed JWTs; `sub` claim required and validated; `exp`, `nbf`, `iat` all enforced |
| **Hardcoded Secrets in Generated Code** | `cerebrex validate` and `cerebrex validate --strict` scan generated MCP servers and block publish if credentials are found |
| **Tool Misuse / Excessive Autonomy** | Risk classification gate on every HIVE worker task: LOW / MEDIUM / HIGH; HIGH-risk actions blocked by default; operator must pass `--allow-high-risk` |
| **Runaway Daemon Loops** | KAIROS exponential backoff: consecutive API errors ramp the alarm interval from 1 minute up to 30 minutes, resetting on the next successful tick |
| **Unsafe Claude Response Parsing** | KAIROS tick responses are structurally validated after `JSON.parse` — `act` must be exactly `true`, strings are type-checked and length-capped |
| **Supply Chain Attacks** | SBOM generation on Registry publish; `npm audit` on all dependencies |
| **Inter-Agent Trust Exploits** | Mutual JWT authentication in HIVE; agents can only act on their own `sub` claim |
| **Data Leakage** | Namespace isolation in MEMEX; sanitized error messages in all API responses |
| **Credential Exposure on Windows** | `cerebrex auth login` calls `icacls` after writing `~/.cerebrex/.credentials` to restrict access to the current user only |
| **Hive State File Exposure** | `cerebrex hive init` and every `saveState()` call write `hive.json` with `mode: 0o600` and run `icacls` on Windows to restrict to the current user |
| **CORS Abuse** | No wildcard CORS on authenticated endpoints in MEMEX or KAIROS workers; registry admin routes use a scoped origin instead of `*` |
| **Rate Limit Bypass** | MEMEX `/consolidate` rate-limited to 1 per hour per agent via KV TTL |
| **Agent History Tampering** | KAIROS daemon log is append-only in D1 — no DELETE or UPDATE is ever issued on `daemon_log` |
| **Chained Medium-Risk Action Bypass** | HIVE workers track per-agent action history in a rolling window (default 5 min). If an agent executes more than N medium-or-higher-risk actions in the window (default N=3, configurable via `CEREBREX_VELOCITY_LIMIT`), the task is blocked and marked failed with a `velocity-escalation` TRACE event. Admin agents holding the `risk_override` JWT scope bypass this check with a full audit trail. |
| **AlterPlan Task Graph Fragmentation** | `task_execution_state` D1 table in MEMEX tracks every task in an AlterPlan decomposition. KAIROS `reconcile()` runs at each tick, heals stale tasks, and cascades `rolled_back` status to dependents via `dependency_ids` — preventing silent graph fragmentation on daemon crash. |
| **SSRF (Server-Side Request Forgery)** | `fetch-mcp` and KAIROS queue consumer validate every caller-supplied URL through `ssrfCheck()` before any network I/O — blocks non-http/https schemes, private IPv4/IPv6 ranges, loopback, link-local, cloud metadata endpoints (169.254.169.254, metadata.google.internal), and *.local / *.internal hostnames |
| **Clickjacking / Content Injection** | All worker responses (site, registry, memex, kairos) include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a full `Content-Security-Policy` header |
| **Unstructured Daemon Output Execution** | KAIROS daemon tick now requires structured JSON `{act, reasoning, task_type, task_payload}` output — free-text action strings are rejected; `task_type` is validated against the supported enum before dispatch |
| **CF Worker Premature Termination** | KAIROS ULTRAPLAN planning promise is passed to `ctx.waitUntil()` so Cloudflare does not kill the Worker before the async operation completes |
| **Task State Disk Growth** | HIVE `saveState()` prunes completed/failed tasks older than 24 hours before every write — prevents unbounded growth of `hive.json` |

---

### Risk Classification Gate (v0.9+)

Every task processed by `cerebrex hive worker` is classified before execution:

| Risk Level | Examples | Default behavior |
|-----------|---------|-----------------|
| `low` | `noop`, `echo`, `memex-get`, `read`, `search` | Always permitted |
| `medium` | `fetch`, `memex-set`, `write`, `configure`, `kairos-action`, `claude-execute` | Permitted by default; block with `--block-medium-risk` |
| `high` | `delete`, `deploy`, `publish`, `send`, `daemon-start` | **Blocked by default**; permit with `--allow-high-risk` |

Unknown task types default to `high` risk. The classification happens before the execute handler runs — a blocked task is marked `failed` on the coordinator and logged with the denial reason.

---

### What We Will Never Do

- Store your Cloudflare API tokens or secrets in our cloud
- Log tool inputs/outputs containing user data in plaintext
- Ship a generated server with hardcoded credentials
- Allow cross-namespace memory access without explicit grants
- Use string equality (`===`) to compare API keys or secrets

---

## Responsible Disclosure

We follow responsible disclosure. If you report a valid vulnerability:

- We will credit you in our release notes (if you want credit)
- We will not take legal action against security researchers acting in good faith
- We ask that you give us time to patch before public disclosure

---

## Security Changelog

| Version | Date | Fix |
|---------|------|-----|
| v0.9.4-patch | 2026-04-12 | HIVE velocity limit (rolling-window chained-action detection); `aggregateRiskScore()` for full AlterPlan plan scoring before execution; `risk_override` JWT scope; MEMEX `task_execution_state` table + API; KAIROS `reconcile()` with dependency cascade; `cerebrex doctor` for environment health; Dockerfile tsconfig fix; telemetry.ts TS error resolved |
| v0.9.4 | 2026-04-11 | SSRF blocking in `fetch-mcp` and KAIROS; security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) on all workers; scoped admin CORS in registry (no more wildcard `*`); `hive.json` hardened with `0o600` + icacls; task state pruning (24h retention); KAIROS structured tick output with task_type validation; `ctx.waitUntil()` for ULTRAPLAN promise; `kairos-action` + `claude-execute` classified as `medium` risk (no longer `high`/unknown) |
| v0.9.3 | 2026-04-09 | Agent test runner (`cerebrex test`) with YAML-based assertions; Docker image published to GHCR; telemetry stub removed from config |
| v0.9.2 | 2026-04-07 | `cerebrex test` subcommands wired into CLI; VERSION constant in CLI index |
| v0.9.1 | 2026-04-04 | Risk gate wired into HIVE worker; `/token` endpoint authenticated; KAIROS backoff + JSON validation; agentId injection prevention; ULTRAPLAN size limit |
| v0.9.0 | 2026-04-04 | Risk classification gate added; timing-safe auth in MEMEX + KAIROS; MEMEX size limits + validSegment(); CORS wildcard removed |
| v0.8.0 | 2026-03-25 | Windows credential file hardened via `icacls`; `tar` zip-slip protection in publish/install |

---

*Security policy last updated: April 2026 (v0.9.4-patch)*
