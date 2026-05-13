#!/usr/bin/env bash
# Package non-Git deployment data for moving a team install to another machine.
#
# This intentionally keeps private/internal data out of the app Docker image and
# out of public GitHub. Put the generated archive on encrypted storage or a
# private handoff location.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-"$ROOT_DIR/deployment-data"}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
PACKAGE_NAME="insurance-agent-data-$STAMP.tar.gz"
PACKAGE_PATH="$OUT_DIR/$PACKAGE_NAME"
TMP_DIR="$(mktemp -d)"
MANIFEST="$TMP_DIR/DATA-MANIFEST.txt"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$OUT_DIR"

cd "$ROOT_DIR"

{
  echo "Insurance Agent Web deployment data package"
  echo "Created UTC: $STAMP"
  echo
  echo "Included when present:"
  echo "- knowledge-base/boc-portal*.json"
  echo "- knowledge-base/raw-pdfs/boc-portal/"
  echo "- backups/db-*.sql.gz"
  echo "- backups/docs-*.tar.gz"
  echo
  echo "Counts:"
  find knowledge-base -maxdepth 1 -type f -name 'boc-portal*.json' 2>/dev/null | wc -l | awk '{print "- BOC JSON files: " $1}'
  find knowledge-base/raw-pdfs/boc-portal -type f -name '*.pdf' 2>/dev/null | wc -l | awk '{print "- BOC PDF files: " $1}'
  if [[ -d backups ]]; then
    find backups -maxdepth 1 -type f -name 'db-*.sql.gz' 2>/dev/null | wc -l | awk '{print "- DB backups: " $1}'
    find backups -maxdepth 1 -type f -name 'docs-*.tar.gz' 2>/dev/null | wc -l | awk '{print "- Docs backups: " $1}'
  else
    echo "- DB backups: 0"
    echo "- Docs backups: 0"
  fi
  echo
  echo "Restore notes:"
  echo "- If db-*.sql.gz exists, restore that first on the new machine."
  echo "- If no DB backup exists, import knowledge-base files with the import scripts."
  echo "- Do not upload this package to public GitHub."
} > "$MANIFEST"

paths=()

while IFS= read -r file; do
  paths+=("$file")
done < <(find knowledge-base -maxdepth 1 -type f -name 'boc-portal*.json' 2>/dev/null | sort)

if [[ -d knowledge-base/raw-pdfs/boc-portal ]]; then
  paths+=("knowledge-base/raw-pdfs/boc-portal")
fi

if [[ -d backups ]]; then
  while IFS= read -r file; do
    paths+=("$file")
  done < <(find backups -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'docs-*.tar.gz' \) 2>/dev/null | sort)
fi

if [[ "${#paths[@]}" -eq 0 ]]; then
  echo "No deployment data found to package." >&2
  exit 1
fi

tar -czf "$PACKAGE_PATH" -C "$TMP_DIR" DATA-MANIFEST.txt -C "$ROOT_DIR" "${paths[@]}"

echo "$PACKAGE_PATH"
