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
# `up --wait` also fails when a one-shot init job (restart: "no") has already exited 0 by the
# time compose checks it, which depends on startup timing. So on failure, accept containers that
# exited 0 and keep waiting until every other container is running and, if it has a health check,
# healthy. A non-zero exit or an unhealthy container still fails.
compose_ready() {
  local pending=0 name state code health
  while read -r name state code health; do
    if [[ $state == exited ]]; then
      [[ $code == 0 ]] || { echo "container $name exited ($code)" >&2; return 2; }
    elif [[ $health == unhealthy ]]; then
      echo "container $name is unhealthy" >&2; return 2
    elif [[ $state != running || $health == starting ]]; then
      pending=1
    fi
  done < <(docker compose --project-directory "$PROJECT_DIR" ps -a \
    --format '{{.Name}} {{.State}} {{.ExitCode}} {{if .Health}}{{.Health}}{{else}}none{{end}}')
  return $pending
}
if ! docker compose --project-directory "$PROJECT_DIR" up -d --wait --wait-timeout "$WAIT_TIMEOUT"; then
  echo "==> compose --wait failed; checking containers directly..."
  deadline=$((SECONDS + WAIT_TIMEOUT))
  until compose_ready; do
    rc=$?
    if (( rc == 2 || SECONDS >= deadline )); then
      docker compose --project-directory "$PROJECT_DIR" ps -a
      exit 1
    fi
    sleep 5
  done
  echo "==> All containers are running or completed successfully"
fi

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
