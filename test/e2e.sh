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

OPENSEARCH_URL="https://localhost:${OPENSEARCH_PORT}"
CURL_OPTS=(-s -k -u "${OPENSEARCH_USER}:${OPENSEARCH_PASSWORD}")

echo "==> Checking OpenSearch cluster health..."
health=$(curl "${CURL_OPTS[@]}" "$OPENSEARCH_URL/_cluster/health" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
if [[ "$health" == "red" ]]; then
  echo "FAIL: OpenSearch cluster health is red"
  exit 1
fi
echo "  OpenSearch cluster health: $health"

echo "==> Checking OTel Collector is accepting OTLP..."
otel_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${OTEL_COLLECTOR_PORT_HTTP}/v1/traces" \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}')
if [[ "$otel_status" != "200" ]]; then
  echo "FAIL: OTel Collector OTLP HTTP endpoint returned $otel_status"
  exit 1
fi
echo "  OTel Collector OTLP HTTP: OK"

echo "==> Checking Prometheus is up..."
prom_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PROMETHEUS_PORT}/-/healthy")
if [[ "$prom_status" != "200" ]]; then
  echo "FAIL: Prometheus health check returned $prom_status"
  exit 1
fi
echo "  Prometheus: OK"

echo "==> Checking OpenSearch Dashboards is up..."
dashboards_status=$(curl -s -o /dev/null -w "%{http_code}" -u "${OPENSEARCH_USER}:${OPENSEARCH_PASSWORD}" \
  "http://localhost:${OPENSEARCH_DASHBOARDS_PORT}/api/status")
if [[ "$dashboards_status" != "200" ]]; then
  echo "FAIL: OpenSearch Dashboards returned $dashboards_status"
  exit 1
fi
echo "  OpenSearch Dashboards: OK"

echo "==> Sending test trace through OTel Collector..."
trace_response=$(curl -s -w "\n%{http_code}" "http://localhost:${OTEL_COLLECTOR_PORT_HTTP}/v1/traces" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {"attributes": [{"key": "service.name", "value": {"stringValue": "e2e-test"}}]},
      "scopeSpans": [{
        "spans": [{
          "traceId": "5b8efff798038103d269b633813fc60c",
          "spanId": "eee19b7ec3c1b174",
          "name": "e2e-test-span",
          "kind": 1,
          "startTimeUnixNano": "1000000000",
          "endTimeUnixNano": "2000000000",
          "status": {}
        }]
      }]
    }]
  }')
trace_status=$(echo "$trace_response" | tail -1)
if [[ "$trace_status" != "200" ]]; then
  echo "FAIL: Sending test trace returned $trace_status"
  exit 1
fi
echo "  Test trace sent: OK"

echo "==> Verifying trace landed in OpenSearch..."
TRACE_ID="5b8efff798038103d269b633813fc60c"
MAX_RETRIES=60
for i in $(seq 1 "$MAX_RETRIES"); do
  hits=$(curl "${CURL_OPTS[@]}" "$OPENSEARCH_URL/*span*,*trace*/_search" \
    -H "Content-Type: application/json" \
    -d "{\"query\":{\"bool\":{\"should\":[{\"term\":{\"traceId\":\"$TRACE_ID\"}},{\"term\":{\"traceID\":\"$TRACE_ID\"}}]}}}" \
    | sed -n 's/.*"total":{"value":\([0-9]*\).*/\1/p')
  if [[ "$hits" -gt 0 ]]; then
    echo "  Trace found in OpenSearch after ${i}s"
    break
  fi
  if [[ "$i" -eq "$MAX_RETRIES" ]]; then
    echo "FAIL: Trace not found in OpenSearch after ${MAX_RETRIES}s"
    echo "  Available indices:"
    curl "${CURL_OPTS[@]}" "$OPENSEARCH_URL/_cat/indices?v" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

echo ""
echo "==> All E2E checks passed!"
