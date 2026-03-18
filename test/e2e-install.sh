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
# Feed answers: install dir, no examples, no otel demo, no custom creds
printf '%s\n' "$INSTALL_DIR" "n" "n" "n" | bash "$PROJECT_DIR/install.sh" --skip-pull

# Parse .env from the installed directory
eval "$(grep -E '^(OPENSEARCH_USER|OPENSEARCH_PASSWORD|OPENSEARCH_PORT|OPENSEARCH_DASHBOARDS_PORT|OTEL_COLLECTOR_PORT_HTTP|PROMETHEUS_PORT)=' "$INSTALL_DIR/.env")"

source "$SCRIPT_DIR/checks.sh"
run_checks
