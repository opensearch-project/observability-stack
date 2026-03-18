#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-180}"

cleanup() {
  echo "==> Tearing down..."
  docker compose --project-directory "$PROJECT_DIR" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Starting observability stack..."
docker compose --project-directory "$PROJECT_DIR" up -d --wait --wait-timeout "$WAIT_TIMEOUT"

# Parse .env safely (don't source — some values aren't shell-safe)
eval "$(grep -E '^(OPENSEARCH_USER|OPENSEARCH_PASSWORD|OPENSEARCH_PORT|OPENSEARCH_DASHBOARDS_PORT|OTEL_COLLECTOR_PORT_HTTP|PROMETHEUS_PORT)=' "$PROJECT_DIR/.env")"

source "$SCRIPT_DIR/checks.sh"
run_checks
