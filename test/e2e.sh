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

# Read .env values as literal strings; don't source or eval (values aren't shell-safe).
while IFS='=' read -r key value; do
  if [[ $value =~ ^\'(.*)\'$ || $value =~ ^\"(.*)\"$ ]]; then value="${BASH_REMATCH[1]}"; fi
  printf -v "$key" '%s' "$value"
done < <(grep -E '^(OPENSEARCH_USER|OPENSEARCH_PASSWORD|OPENSEARCH_DASHBOARDS_PORT|OTEL_COLLECTOR_PORT_HTTP|PROMETHEUS_PORT)=' "$PROJECT_DIR/.env")

source "$SCRIPT_DIR/checks.sh"
run_checks
run_negative_checks
# The default .env includes the example agents (not the OTel Demo), so the
# example-agent anomaly detection setups must be seeded and the OTel Demo's not.
run_anomaly_detection_checks examples
