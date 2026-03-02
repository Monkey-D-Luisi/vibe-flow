#!/bin/bash
set -e

# Ensure OpenClaw config and auth directories exist
mkdir -p /root/.openclaw/agents/main/agent /root/.openclaw/credentials

# Copy our project config and expand environment variables
envsubst < /app/openclaw.json > /root/.openclaw/openclaw.json

# Rebuild better-sqlite3 native module if not present
if [ ! -f /app/node_modules/better-sqlite3/build/Release/better_sqlite3.node ]; then
  echo "[entrypoint] Rebuilding better-sqlite3 native module..."
  cd /app && npm rebuild better-sqlite3 2>&1
  cd /app
fi

# Configure git credential helper to use GITHUB_TOKEN for HTTPS clones
if [ -n "$GITHUB_TOKEN" ]; then
  git config --global credential.helper '!f() { echo "username=x-access-token"; echo "password=${GITHUB_TOKEN}"; }; f'
  git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
fi

# Check for auth credentials and warn if missing
AUTH_FILE="/root/.openclaw/agents/main/agent/auth-profiles.json"
if [ ! -f "$AUTH_FILE" ]; then
  echo ""
  echo "================================================================"
  echo " WARNING: No auth-profiles.json found"
  echo " Agent model calls will fail without provider tokens."
  echo ""
  echo " Copy credentials from your local OpenClaw installation:"
  echo ""
  echo "   docker cp ~/.openclaw/agents/main/agent/auth-profiles.json openclaw-product-team:/root/.openclaw/agents/main/agent/"
  echo "   docker cp ~/.openclaw/agents/main/agent/auth.json openclaw-product-team:/root/.openclaw/agents/main/agent/"
  echo "   docker cp ~/.openclaw/credentials/github-copilot.token.json openclaw-product-team:/root/.openclaw/credentials/"
  echo "   docker compose restart"
  echo ""
  echo " See docs/docker-setup.md for full instructions."
  echo "================================================================"
  echo ""
fi

# Start gateway in foreground
exec pnpm exec openclaw gateway run --port 28789 --verbose
