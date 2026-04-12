# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /workspace

# Copy workspace manifest + lockfile + root tsconfig first (layer cache)
COPY package.json bun.lockb* tsconfig.json ./
COPY packages/types/       packages/types/
COPY packages/core/        packages/core/
COPY packages/registry-client/ packages/registry-client/
COPY apps/cli/             apps/cli/

# Install all dependencies (workspace-aware)
RUN bun install --frozen-lockfile

# Build workspace packages in dependency order
RUN cd packages/types          && bun run build
RUN cd packages/core           && bun run build
RUN cd packages/registry-client && bun run build

# Compile a self-contained Linux x64 binary (no Node/Bun needed at runtime)
RUN cd apps/cli && bun run build:linux-x64

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM alpine:3.19

# ca-certificates: needed for HTTPS calls to Cloudflare workers / npm registry
RUN apk add --no-cache ca-certificates

COPY --from=builder /workspace/apps/cli/dist/cerebrex-linux-x64 /usr/local/bin/cerebrex
RUN chmod +x /usr/local/bin/cerebrex

# Sanity check during build
RUN cerebrex --version

ENTRYPOINT ["cerebrex"]
CMD ["--help"]
