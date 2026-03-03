# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# OpenClaw Autonomous Product Team — Gateway Container
# ─────────────────────────────────────────────────────────────
# Port 28789 (avoids collision with host OpenClaw on 18789)
# ─────────────────────────────────────────────────────────────

FROM node:22-slim AS builder

# System dependencies: git, gh CLI, build tools for better-sqlite3, curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      curl \
      build-essential \
      python3 \
      ca-certificates \
      gnupg \
      gettext-base \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       | gpg --dearmor -o /etc/apt/keyrings/github-cli.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/github-cli.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@10.18.1 --activate

WORKDIR /app

# ── Copy all source ──
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY extensions/ extensions/
COPY packages/ packages/
COPY tools/ tools/
COPY skills/ skills/
COPY scripts/ scripts/
COPY .agent/agents/ .agent/agents/
COPY openclaw.docker.json openclaw.json

# ── Install dependencies (hoisted for cross-platform compatibility) ──
RUN echo "node-linker=hoisted" > .npmrc
RUN pnpm install --frozen-lockfile

# Rebuild native modules for the container's architecture
RUN pnpm rebuild better-sqlite3

# Build all TypeScript packages
RUN pnpm build

# ── Workspace volumes ──
RUN mkdir -p /app/data /workspaces

VOLUME ["/app/data", "/workspaces"]

# ── Runtime ──
ENV NODE_ENV=production
# OPENCLAW_CONFIG_PATH is used by the SDK's loadConfig() / resolveConfigPath().
# The entrypoint runs envsubst to expand ${...} placeholders from the template
# config at /app/openclaw.json into the expanded config at the state dir.
# We set it to the expanded location so the SDK always reads resolved values.
ENV OPENCLAW_CONFIG_PATH=/root/.openclaw/openclaw.json
ENV OPENCLAW_STATE_DIR=/root/.openclaw
EXPOSE 28789

# Health check: verify gateway responds (use root path, no auth needed)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf http://localhost:28789/ || exit 1

# Start gateway in foreground mode (no systemd in containers)
RUN sed -i 's/\r$//' /app/scripts/docker-entrypoint.sh && chmod +x /app/scripts/docker-entrypoint.sh
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
