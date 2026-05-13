#!/usr/bin/env bash
# Daily backup of Postgres + uploaded documents.
# Designed to run inside a small alpine sidecar in docker-compose.prod.yml,
# but also works standalone on a Mac mini (just install pg_dump).
#
# Required env:
#   PGHOST, PGUSER, PGDATABASE, PGPASSWORD   (Postgres connection)
#   BACKUP_DIR                               (where to write backups)
#   DOCUMENT_STORAGE_DIR                     (file uploads to copy)
# Optional:
#   BACKUP_RETENTION_DAYS  default 30
#   BACKUP_NOTIFY_URL      Slack/Discord webhook for failures (POST text)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"

mkdir -p "$BACKUP_DIR"

DB_FILE="$BACKUP_DIR/db-$STAMP.sql.gz"
DOCS_FILE="$BACKUP_DIR/docs-$STAMP.tar.gz"
DB_TMP="$DB_FILE.tmp"
DOCS_TMP="$DOCS_FILE.tmp"

notify_failure() {
  local msg="$1"
  echo "[backup] FAIL: $msg" >&2
  if [[ -n "${BACKUP_NOTIFY_URL:-}" ]]; then
    curl -s -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"InsuranceAI backup failed at $STAMP: $msg\"}" \
      "$BACKUP_NOTIFY_URL" >/dev/null || true
  fi
  exit 1
}

trap 'notify_failure "unexpected error on line $LINENO"' ERR

echo "[backup] $STAMP — dumping database"
pg_dump --no-owner --no-acl | gzip -9 > "$DB_TMP"
mv "$DB_TMP" "$DB_FILE"

if [[ -d "${DOCUMENT_STORAGE_DIR:-/storage/documents}" ]]; then
  echo "[backup] archiving uploaded documents"
  tar -czf "$DOCS_TMP" -C "$(dirname "${DOCUMENT_STORAGE_DIR:-/storage/documents}")" \
    "$(basename "${DOCUMENT_STORAGE_DIR:-/storage/documents}")"
  mv "$DOCS_TMP" "$DOCS_FILE"
fi

echo "[backup] pruning archives older than $RETENTION days"
find "$BACKUP_DIR" -type f -name 'db-*.sql.gz'  -mtime +$RETENTION -delete
find "$BACKUP_DIR" -type f -name 'docs-*.tar.gz' -mtime +$RETENTION -delete

DB_SIZE="$(stat -c%s "$DB_FILE" 2>/dev/null || stat -f%z "$DB_FILE")"
echo "[backup] done — db archive ${DB_SIZE} bytes"
