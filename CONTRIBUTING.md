# Contributing to CerebreX

First off — thank you. Seriously. CerebreX is built for developers by a developer, and every contribution moves the whole ecosystem forward.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Commit Message Convention](#commit-message-convention)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Security Issues](#security-issues)

---

## Code of Conduct

This project follows our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it. We do not tolerate harassment or disrespect of any kind. Period.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0 (primary runtime — faster than Node)
- [Node.js](https://nodejs.org) >= 20.0.0 (fallback compatibility)
- [Git](https://git-scm.com) >= 2.0
- A [Cloudflare account](https://cloudflare.com) (free tier is fine)

### Fork and Clone

```bash
# 1. Fork the repo on GitHub (click the Fork button top-right)

# 2. Clone YOUR fork
git clone https://github.com/YOUR_USERNAME/cerebrex.git
cd cerebrex

# 3. Add the upstream remote
git remote add upstream https://github.com/arealcoolco/cerebrex.git

# 4. Verify your remotes
git remote -v
```

---

## Development Setup

```bash
# Install all workspace dependencies (Turborepo handles the rest)
bun install

# Build all packages
bun run build

# Run the full test suite
bun run test

# Run tests in watch mode
bun run test:watch

# Lint all packages
bun run lint

# Type-check all packages
bun run typecheck

# Run the CLI locally (from the repo root)
bun run cli -- build --spec ./examples/petstore.json
```

### Working on a Specific Package

```bash
# Work on just the CLI
cd apps/cli
bun run dev

# Work on just the core engine
cd packages/core
bun run test:watch
```

---

## Project Structure

```
cerebrex/
├── apps/
│   ├── cli/              # The cerebrex CLI tool (this is what users install)
│   │   ├── src/
│   │   │   ├── commands/ # One file per CLI command
│   │   │   ├── core/     # FORGE and TRACE engines
│   │   │   └── utils/    # Shared CLI utilities
│   │   └── templates/    # Cloudflare Worker templates
│   └── docs/             # Documentation site
├── packages/
│   ├── core/             # Shared core utilities
│   ├── types/            # TypeScript type definitions
│   └── registry-client/  # Registry API client
└── .github/              # GitHub Actions, templates
```

### Where to Make Changes

| You want to... | Change this |
|---------------|-------------|
| Fix a `cerebrex build` bug | `apps/cli/src/core/forge/` |
| Fix a `cerebrex trace` bug | `apps/cli/src/core/trace/` |
| Add a new CLI command | `apps/cli/src/commands/` |
| Fix a type definition | `packages/types/src/` |
| Fix the registry client | `packages/registry-client/src/` |
| Update docs | `apps/docs/` |

---

## How to Contribute

### 1. Check Existing Issues First

Search [open issues](https://github.com/arealcoolco/cerebrex/issues) before starting work. If you find one that matches your idea, comment on it to claim it before building.

### 2. Create a Branch

```bash
# Sync your fork with upstream first
git fetch upstream
git checkout main
git merge upstream/main

# Create a descriptive branch
git checkout -b fix/forge-openapi-parsing-edge-case
# or
git checkout -b feat/trace-json-export
# or
git checkout -b docs/add-memex-quickstart
```

### Branch Naming

| Prefix | Use For |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `test/` | Tests only |
| `refactor/` | Code refactoring |
| `chore/` | Build, deps, CI changes |
| `security/` | Security fixes (open issue first!) |

### 3. Make Your Changes

- Write clean, well-typed TypeScript
- Add tests for any new functionality
- Update docs if you change behavior
- Run `bun run test` before committing — don't submit failing tests

### 4. Test Your Changes

```bash
# Run the full suite
bun run test

# Run only tests related to your changes
bun run test --filter=./apps/cli

# Test the CLI end-to-end locally
bun run cli -- build --spec ./examples/stripe-openapi.json
bun run cli -- validate
```

---

## Pull Request Process

1. **Ensure your branch is up to date** with `upstream/main` before opening a PR
2. **Fill out the PR template** completely — partial PRs slow review
3. **Link any related issues** using `Closes #123` in the PR description
4. **Keep PRs focused** — one PR per logical change. Don't bundle unrelated fixes.
5. **All CI checks must pass** — don't ask for reviews on failing CI
6. **Request a review** from a maintainer once ready
7. **Be responsive** — we try to review within 3 business days; please respond within 7

### PR Title Format

Follow the same convention as commit messages:

```
feat(forge): add OAuth 2.0 support for generated servers
fix(trace): resolve session ID collision on concurrent runs
docs(readme): update quickstart with Cloudflare setup steps
```

---

## Commit Message Convention

CerebreX uses [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation change |
| `test` | Test changes |
| `refactor` | Code refactor (no feature/fix) |
| `chore` | Build, deps, tooling |
| `security` | Security fix |
| `perf` | Performance improvement |

### Scopes

`forge`, `trace`, `memex`, `hive`, `registry`, `cli`, `core`, `types`, `docs`, `ci`

### Examples

```bash
feat(forge): generate OAuth 2.0 handlers for API key auth schemes
fix(trace): prevent duplicate step IDs when agents run in parallel
docs(contributing): add Windows setup instructions
chore(deps): upgrade @modelcontextprotocol/sdk to 1.2.0
security(memex): add SHA-256 checksum verification on memory reads
```

---

## Reporting Bugs

Use the [Bug Report template](./.github/ISSUE_TEMPLATE/bug_report.md).

Please include:
- CerebreX version (`cerebrex --version`)
- OS and version
- Node/Bun version
- The exact command you ran
- The full error output
- What you expected to happen

---

## Suggesting Features

Use the [Feature Request template](./.github/ISSUE_TEMPLATE/feature_request.md).

Before suggesting:
- Check the [roadmap](https://docs.cerebrex.dev/roadmap)
- Search existing feature request issues
- Describe the problem you're solving, not just the solution

---

## Security Issues

**Do not open a public GitHub issue for security vulnerabilities.**

Please read our [Security Policy](./SECURITY.md) and report via private disclosure.

---

## Recognition

All contributors are listed in our [CONTRIBUTORS.md](./CONTRIBUTORS.md) and recognized in our Discord. Significant contributors may be invited to join the core maintainer team.

---

*Built with love by [A Real Cool Co.](https://arealcool.site)*
