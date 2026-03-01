#!/usr/bin/env bash
# backup-volumes.sh -- Backup SQLite DB and workspace metadata
#
# Usage: ./scripts/backup-volumes.sh
#
# Retains the last 7 backups. Requires docker compose to be available.

set -euo pipefail

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
MAX_BACKUPS=7
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
SERVICE="gateway"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting backup at $TIMESTAMP"

# 1. Stop the container gracefully
echo "[backup] Stopping gateway..."
docker compose -f "$COMPOSE_FILE" stop "$SERVICE" || true

# 2. Copy SQLite database
VOLUME_PATH=$(docker volume inspect openclaw-data --format '{{.Mountpoint}}' 2>/dev/null || echo "")
if [ -n "$VOLUME_PATH" ] && [ -d "$VOLUME_PATH" ]; then
  BACKUP_FILE="$BACKUP_DIR/openclaw-data-$TIMESTAMP.tar.gz"
  echo "[backup] Backing up data volume to $BACKUP_FILE"
  tar -czf "$BACKUP_FILE" -C "$VOLUME_PATH" . 2>/dev/null || echo "[backup] Warning: could not tar data volume directly"
else
  # Fallback: copy from container
  BACKUP_FILE="$BACKUP_DIR/openclaw-data-$TIMESTAMP.tar.gz"
  echo "[backup] Copying data from container volume..."
  docker compose -f "$COMPOSE_FILE" run --rm -v "$BACKUP_DIR:/backup" "$SERVICE" \
    tar -czf "/backup/openclaw-data-$TIMESTAMP.tar.gz" -C /app/data . 2>/dev/null || \
    echo "[backup] Warning: could not backup data volume"
fi

# 3. Restart the container
echo "[backup] Restarting gateway..."
docker compose -f "$COMPOSE_FILE" start "$SERVICE"

# 4. Rotate old backups (keep last MAX_BACKUPS)
echo "[backup] Rotating backups (keeping last $MAX_BACKUPS)..."
ls -t "$BACKUP_DIR"/openclaw-data-*.tar.gz 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f

echo "[backup] Done. Backup at: $BACKUP_FILE"
