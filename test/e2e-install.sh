#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="/tmp/observability-stack-e2e"

rm -rf "$INSTALL_DIR"

cleanup() {
  echo "==> Tearing down..."
  if [ -d "$INSTALL_DIR" ]; then
    docker compose -f "$INSTALL_DIR/docker-compose.yml" --project-directory "$INSTALL_DIR" down -v --remove-orphans 2>/dev/null || true
    rm -rf "$INSTALL_DIR"
  fi
}
trap cleanup EXIT

echo "==> Running install.sh..."
# Patch install.sh to read from stdin instead of /dev/tty (no TTY in CI)
# and replace git clone with a local copy so we test the PR's code
PATCHED_SCRIPT=$(mktemp)
sed -e 's|< /dev/tty||g' \
    -e 's|git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>\&1|cp -r "'"$PROJECT_DIR"'/." "$INSTALL_DIR"|' \
    "$PROJECT_DIR/install.sh" > "$PATCHED_SCRIPT"
chmod +x "$PATCHED_SCRIPT"

# Feed answers: install dir, no examples, no otel demo, no custom creds
printf '%s\n' "$INSTALL_DIR" "n" "n" "n" | bash "$PATCHED_SCRIPT" --skip-pull
rm -f "$PATCHED_SCRIPT"

# Parse .env from the installed directory
eval "$(grep -E '^(OPENSEARCH_USER|OPENSEARCH_PASSWORD|OPENSEARCH_PORT|OPENSEARCH_DASHBOARDS_PORT|OTEL_COLLECTOR_PORT_HTTP|PROMETHEUS_PORT)=' "$INSTALL_DIR/.env")"

source "$SCRIPT_DIR/checks.sh"
run_checks
