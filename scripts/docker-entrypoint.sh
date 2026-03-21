#!/bin/bash
set -e

# Ensure OpenClaw config and auth directories exist
mkdir -p /root/.openclaw/agents/main/agent /root/.openclaw/credentials

# ── Config expansion ──
# The source config at /app/openclaw.json contains shell variable placeholders
# (e.g. ${OPENCLAW_GATEWAY_TOKEN}, ${TELEGRAM_BOT_TOKEN}) that must be expanded
# before the SDK can use them. We expand into the SDK's default config location
# so both the gateway CLI and spawnSubagentDirect()/loadConfig() find the same
# fully-resolved config file.
EXPANDED_CONFIG="/root/.openclaw/openclaw.json"
envsubst < /app/openclaw.json > "$EXPANDED_CONFIG"

# Point OPENCLAW_CONFIG_PATH to the EXPANDED config (not the raw template).
# This is critical: the SDK reads this env var in resolveConfigPath(), and if
# it reads the unexpanded file the gateway.auth.token will be the literal
# string "${OPENCLAW_GATEWAY_TOKEN}" instead of the actual token value.
export OPENCLAW_CONFIG_PATH="$EXPANDED_CONFIG"
export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/root/.openclaw}"

echo "[entrypoint] OPENCLAW_CONFIG_PATH=$OPENCLAW_CONFIG_PATH"
echo "[entrypoint] OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR"

# ── Validate config expansion ──
# Detect unexpanded ${...} placeholders in critical fields. If envsubst failed
# to expand a variable (e.g. it was unset), the literal ${VAR} will remain.
if grep -qE '\$\{[A-Z_]+\}' "$EXPANDED_CONFIG" 2>/dev/null; then
  UNEXPANDED=$(grep -oE '\$\{[A-Z_]+\}' "$EXPANDED_CONFIG" | sort -u | tr '\n' ' ')
  echo "[entrypoint] WARNING: Config still contains unexpanded variables: $UNEXPANDED"
  echo "[entrypoint]          Check that these env vars are set in .env.docker"
fi

# Validate gateway token is present and not a placeholder
if [ -z "$OPENCLAW_GATEWAY_TOKEN" ]; then
  echo "[entrypoint] ERROR: OPENCLAW_GATEWAY_TOKEN is not set."
  echo "[entrypoint]        The gateway requires a token when bind=lan."
  echo "[entrypoint]        Set it in .env.docker and restart."
  exit 1
fi
if echo "$OPENCLAW_GATEWAY_TOKEN" | grep -qE '^ocgw_REPLACE_ME$|^\$\{'; then
  echo "[entrypoint] ERROR: OPENCLAW_GATEWAY_TOKEN has a placeholder value."
  echo "[entrypoint]        Replace it with a real token in .env.docker"
  exit 1
fi

# Verify the expanded config file is readable and contains agents
if [ -f "$EXPANDED_CONFIG" ]; then
  AGENT_COUNT=$(grep -o '"id"' "$EXPANDED_CONFIG" | wc -l || echo "0")
  echo "[entrypoint] Config found at $EXPANDED_CONFIG ($AGENT_COUNT agent entries)"
else
  echo "[entrypoint] FATAL: Expanded config not found at $EXPANDED_CONFIG"
  exit 1
fi

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

# Authenticate gh CLI with GITHUB_TOKEN
if [ -n "$GITHUB_TOKEN" ]; then
  if echo "$GITHUB_TOKEN" | gh auth login --with-token 2>/dev/null; then
    echo "[entrypoint] gh CLI authenticated"
  else
    echo "[entrypoint] gh CLI auth skipped (token type may not be compatible with gh)"
  fi
fi

# Create /workspaces/active symlink to default project workspace
# If a stale directory exists from a previous run, replace it with a symlink.
ACTIVE_WS="/workspaces/vibe-flow"
if [ -L /workspaces/active ]; then
  : # already a symlink — leave it
elif [ -d /workspaces/active ]; then
  rm -rf /workspaces/active
  ln -sf "$ACTIVE_WS" /workspaces/active
  echo "[entrypoint] Replaced stale /workspaces/active directory with symlink -> $ACTIVE_WS"
else
  mkdir -p /workspaces
  ln -sf "$ACTIVE_WS" /workspaces/active
  echo "[entrypoint] Created /workspaces/active -> $ACTIVE_WS"
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

# ── Auto-sync Codex CLI tokens to OpenClaw auth-profiles ──
# If the user ran `npx @openai/codex auth login --device-auth` inside
# the container, the Codex CLI writes tokens to /root/.codex/auth.json
# in a different format than OpenClaw expects.  This block converts and
# merges them so the user only needs to restart the container.
python3 - <<'PYEOF'
import json, os, base64, time

CODEX_AUTH   = "/root/.codex/auth.json"
OPENCLAW_AUTH = "/root/.openclaw/agents/main/agent/auth-profiles.json"
PROFILE_ID   = "openai-codex:default"

if not os.path.exists(CODEX_AUTH):
    # No Codex CLI auth file — nothing to sync
    pass
elif not os.path.exists(OPENCLAW_AUTH):
    print("[entrypoint] codex-sync: skipped — no auth-profiles.json yet")
else:
    try:
        codex = json.load(open(CODEX_AUTH))
        tokens = codex.get("tokens", {})
        access = tokens.get("access_token", "")
        refresh = tokens.get("refresh_token", "")
        account_id = tokens.get("account_id", "")

        if not access:
            pass  # No access token in Codex auth file
        else:
            # Decode JWT exp claim from access_token
            payload = access.split(".")[1]
            payload += "=" * (4 - len(payload) % 4)
            jwt_data = json.loads(base64.urlsafe_b64decode(payload))
            codex_expires_ms = jwt_data.get("exp", 0) * 1000

            # Read current OpenClaw profiles
            store = json.load(open(OPENCLAW_AUTH))
            current = store.get("profiles", {}).get(PROFILE_ID, {})
            current_expires = current.get("expires", 0)

            if codex_expires_ms > current_expires:
                store.setdefault("profiles", {})[PROFILE_ID] = {
                    "type": "oauth",
                    "provider": "openai-codex",
                    "access": access,
                    "refresh": refresh,
                    "expires": codex_expires_ms,
                    "accountId": account_id,
                }
                with open(OPENCLAW_AUTH, "w") as f:
                    json.dump(store, f, indent=2)
                exp_str = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(codex_expires_ms / 1000))
                print("[entrypoint] codex-sync: synced fresh Codex OAuth tokens to main agent (expires " + exp_str + ")")
            else:
                print("[entrypoint] codex-sync: Codex tokens are not newer — skipped")
    except Exception as e:
        print("[entrypoint] codex-sync: error — " + str(e))

PYEOF

# ── Validate OAuth tokens (detect expired/missing tokens before they cause
#    silent fallback to wrong models at runtime) ──
python3 - <<'PYEOF'
import json, os, sys, time

NOW_MS = int(time.time() * 1000)
WARN_WITHIN_MS = 3 * 24 * 60 * 60 * 1000  # warn 3 days before expiry

# Check all agent auth-profiles we care about
paths = [
    ("/root/.openclaw/agents/main/agent/auth-profiles.json", "main"),
    ("/root/.openclaw/agents/pm/agent/auth-profiles.json", "pm"),
]

issues = []
for path, agent in paths:
    if not os.path.exists(path):
        continue
    try:
        d = json.load(open(path))
        for name, prof in d.get("profiles", {}).items():
            ptype = prof.get("type", prof.get("mode", "token"))
            if ptype == "oauth":
                expires = prof.get("expires", 0)
                access  = prof.get("access", "")
                refresh = prof.get("refresh", "")
                if not access and not refresh:
                    issues.append(f"  [{agent}] {name}: OAuth credentials MISSING")
                elif expires and expires < NOW_MS:
                    issues.append(f"  [{agent}] {name}: OAuth token EXPIRED ({int((NOW_MS-expires)/86400000)}d ago)")
                elif expires and expires < (NOW_MS + WARN_WITHIN_MS):
                    days = int((expires - NOW_MS) / 86400000)
                    issues.append(f"  [{agent}] {name}: OAuth token expires in {days}d — renew soon")
    except Exception as e:
        issues.append(f"  [{agent}] Could not parse {path}: {e}")

if issues:
    print("")
    print("================================================================")
    print(" WARNING: Provider OAuth token issues detected:")
    print("")
    for msg in issues:
        print(msg)
    print("")
    print(" Fix: run Codex OAuth login inside the container, then restart:")
    print("   docker exec -it openclaw-product-team npx @openai/codex auth login --device-auth")
    print("   docker compose -f docker-compose.yml restart")
    print("")
    print(" Or use the convenience script: ./scripts/codex-login.sh")
    print("================================================================")
    print("")
PYEOF

# ── Auto-propagate OAuth credentials ──
# If any agent has a valid openai-codex OAuth credential and another has an
# expired or missing one, copy the freshest credential to the stale agents.
# This prevents silent model fallback (e.g. pm valid, main expired → anthropic).
python3 - <<'PYEOF'
import json, os, time, glob

STATE_DIR = "/root/.openclaw/agents"
NOW_MS = int(time.time() * 1000)
PROVIDER = "openai-codex"
PROFILE_ID = "openai-codex:default"

# Gather all agents that have auth-profiles.json
agent_paths = {}
for path in glob.glob(f"{STATE_DIR}/*/agent/auth-profiles.json"):
    agent_id = path.split("/")[-3]
    try:
        store = json.load(open(path))
        agent_paths[agent_id] = (path, store)
    except Exception:
        pass

# Find the freshest valid credential for PROVIDER
best_expires = 0
best_cred = None
for agent_id, (path, store) in agent_paths.items():
    cred = store.get("profiles", {}).get(PROFILE_ID)
    if cred and cred.get("type") == "oauth":
        exp = cred.get("expires", 0)
        if exp > NOW_MS and exp > best_expires:
            best_expires = exp
            best_cred = cred

if best_cred is None:
    # No valid credential found — nothing to propagate
    pass
else:
    exp_str = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(best_expires / 1000))
    for agent_id, (path, store) in agent_paths.items():
        cred = store.get("profiles", {}).get(PROFILE_ID)
        needs_update = (
            cred is None
            or cred.get("type") != "oauth"
            or cred.get("expires", 0) <= NOW_MS
        )
        if needs_update:
            store.setdefault("profiles", {})[PROFILE_ID] = best_cred
            with open(path, "w") as f:
                json.dump(store, f, indent=2)
            print(f"[entrypoint] Propagated fresh {PROVIDER} credential to agent '{agent_id}' (expires {exp_str})")
PYEOF

# Sync agent instruction files (CLAUDE.md) to workspace directories.
# agentDir paths in openclaw.json are relative to each agent's workspace.
# The source files live in /app/.agent/agents/ (from the Docker build),
# but agents resolve agentDir against their workspace (/workspaces/active).
WORKSPACES=("/workspaces/active" "/workspaces/vibe-flow" "/workspaces/saas-template")
for ws in "${WORKSPACES[@]}"; do
  if [ -d "$ws" ] && [ -d /app/.agent/agents ]; then
    mkdir -p "$ws/.agent/agents"
    cp -r /app/.agent/agents/* "$ws/.agent/agents/" 2>/dev/null || true
    echo "[entrypoint] Synced agent instruction files to $ws/.agent/agents/"
  fi
done

# ── Copy Control UI assets to break pnpm hardlinks ──
# pnpm hoisted mode creates hardlinks (nlink > 1) from node_modules to the
# content-addressable store. The OpenClaw SDK's boundary file opener rejects
# hardlinked files as a security measure. Copying the dist to a regular
# directory with nlink=1 files works around this.
CONTROL_UI_SRC="/app/node_modules/openclaw/dist/control-ui"
CONTROL_UI_DST="/root/.openclaw/control-ui"
if [ -d "$CONTROL_UI_SRC" ]; then
  rm -rf "$CONTROL_UI_DST"
  cp -r "$CONTROL_UI_SRC" "$CONTROL_UI_DST"
  echo "[entrypoint] Copied Control UI assets to $CONTROL_UI_DST (hardlink workaround)"
fi

# Start gateway in foreground
# Config is resolved via OPENCLAW_CONFIG_PATH env var (set above).
# The gateway CLI does NOT accept --config; it reads the env var directly.
# Pass --token so the gateway knows the token for dashboard URL generation.
echo ""
echo "================================================================"
echo " Dashboard URL (paste in browser — token auto-stores):"
echo ""
TOKEN_PREVIEW="${OPENCLAW_GATEWAY_TOKEN:0:8}..."
echo "   http://localhost:28789/#token=${TOKEN_PREVIEW}"
echo "   (full token is passed to the gateway via --token flag)"
echo ""
echo "================================================================"
echo ""
echo "[entrypoint] Starting gateway on port 28789..."
exec pnpm exec openclaw gateway run --port 28789 --token "$OPENCLAW_GATEWAY_TOKEN" --verbose
