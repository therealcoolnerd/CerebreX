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
| `0.x` (current main) | ✅ Active |
| Older versions | ❌ Please upgrade |

---

## Security Design Principles

CerebreX is built with security as a first-class concern, aligned with the [OWASP Top 10 for Agentic Applications (2025)](https://genai.owasp.org).

### What We Protect Against

| Threat | Mitigation |
|--------|-----------|
| Prompt Injection | Input sanitization middleware + TRACE injection detection |
| Memory Poisoning | SHA-256 checksums on all MEMEX writes; mutation anomaly detection |
| Hardcoded Secrets | FORGE validator scans generated code and blocks hardcoded credentials |
| Tool Misuse | Least-privilege Zod schemas; HIVE permission gates |
| Supply Chain Attacks | SBOM generation on Registry publish; npm audit on all deps |
| Inter-Agent Trust Exploits | Mutual JWT authentication in HIVE |
| Data Leakage | Namespace isolation; sanitized error messages |
| Excessive Autonomy | Human-in-the-loop gates for destructive operations |

### What We Will Never Do

- Store your Cloudflare API tokens or secrets in our cloud
- Log tool inputs/outputs containing user data in plaintext
- Ship a generated server with hardcoded credentials
- Allow cross-namespace memory access without explicit grants

---

## Responsible Disclosure

We follow responsible disclosure. If you report a valid vulnerability:

- We will credit you in our release notes (if you want credit)
- We will not take legal action against security researchers acting in good faith
- We ask that you give us time to patch before public disclosure

---

*Security policy last updated: March 2026*
