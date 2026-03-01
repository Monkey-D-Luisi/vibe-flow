# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# OpenClaw Autonomous Product Team — Gateway Container
# ─────────────────────────────────────────────────────────────
# Port 28789 (avoids collision with host OpenClaw on 18789)
# ─────────────────────────────────────────────────────────────

FROM node:22-slim AS base

# System dependencies: git, gh CLI, build tools for better-sqlite3, curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      curl \
      build-essential \
      python3 \
      ca-certificates \
      gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       | gpg --dearmor -o /etc/apt/keyrings/github-cli.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/github-cli.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# ── Dependency layer (cached unless lock/workspace changes) ──
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY extensions/product-team/package.json extensions/product-team/
COPY extensions/quality-gate/package.json extensions/quality-gate/
COPY packages/schemas/package.json packages/schemas/
COPY packages/quality-contracts/package.json packages/quality-contracts/

RUN pnpm install --frozen-lockfile

# Rebuild native modules for the container's architecture
RUN pnpm rebuild better-sqlite3

# ── Application layer ──
COPY extensions/ extensions/
COPY packages/ packages/
COPY skills/ skills/
COPY scripts/ scripts/
COPY openclaw.docker.json openclaw.json
COPY tsconfig*.json ./

# Build all TypeScript packages
RUN pnpm build

# ── Workspace volumes ──
RUN mkdir -p /app/data /workspaces

VOLUME ["/app/data", "/workspaces"]

# ── Runtime ──
ENV NODE_ENV=production
ENV OPENCLAW_CONFIG=/app/openclaw.json
EXPOSE 28789

# Health check: verify gateway responds
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:28789/health || exit 1

# Start via local node_modules binary
ENTRYPOINT ["npx", "openclaw"]
