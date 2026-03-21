#!/usr/bin/env bash
# Usage: ./scripts/codex-login.sh
#
# Runs the OpenAI Codex OAuth device-flow inside the Docker container,
# then restarts the container to auto-sync and propagate tokens to all agents.
#
# The device-flow will display a URL and code — open the URL in your browser
# and enter the code to complete authentication.
set -euo pipefail

CONTAINER="${OPENCLAW_CONTAINER:-openclaw-product-team}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

echo "Starting OpenAI Codex OAuth login inside $CONTAINER..."
echo "(A URL and code will appear — open the URL in your browser)"
echo ""

docker exec -it "$CONTAINER" npx @openai/codex auth login --device-auth

echo ""
echo "Restarting container to sync tokens..."
docker compose -f "$COMPOSE_FILE" restart

echo ""
echo "Done! Tokens synced and propagated to all agents."
echo "Verify with: docker exec $CONTAINER pnpm exec openclaw models status"
