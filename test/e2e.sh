#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-180}"

# Override to only run core stack (no examples/demo)
export INCLUDE_COMPOSE_EXAMPLES=docker-compose/util/docker-compose.empty.yml
export INCLUDE_COMPOSE_OTEL_DEMO=docker-compose/util/docker-compose.empty.yml

cleanup() {
  echo "==> Tearing down..."
  docker compose -f "$COMPOSE_FILE" --project-directory "$PROJECT_DIR" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Starting observability stack..."
docker compose -f "$COMPOSE_FILE" --project-directory "$PROJECT_DIR" up -d --wait --wait-timeout "$WAIT_TIMEOUT"

# Parse .env safely (don't source — some values aren't shell-safe)
eval "$(grep -E '^(OPENSEARCH_USER|OPENSEARCH_PASSWORD|OPENSEARCH_PORT|OPENSEARCH_DASHBOARDS_PORT|OTEL_COLLECTOR_PORT_HTTP|PROMETHEUS_PORT)=' "$PROJECT_DIR/.env")"

source "$SCRIPT_DIR/checks.sh"
run_checks
