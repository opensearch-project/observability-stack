#!/usr/bin/env bash
# Shared health checks and trace verification for E2E tests.
# Expects these variables to be set before sourcing:
#   OPENSEARCH_USER, OPENSEARCH_PASSWORD,
#   OPENSEARCH_DASHBOARDS_PORT, OTEL_COLLECTOR_PORT_HTTP, PROMETHEUS_PORT
set -euo pipefail

# Query OpenSearch through the OSD console proxy, routed via the local_cluster
# data source (dataSourceId), instead of hitting localhost:9200 directly. This
# exercises the configured OSD_DATASOURCE_ENDPOINT, so a misconfigured endpoint
# fails the test.
OSD_URL="http://localhost:${OPENSEARCH_DASHBOARDS_PORT}"
OSD_CURL_OPTS=(-s -u "${OPENSEARCH_USER}:${OPENSEARCH_PASSWORD}" -H "osd-xsrf: true")
HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-30}"
# Separate, larger budget than HEALTH_CHECK_RETRIES: the local_cluster data
# source is seeded by the one-shot opensearch-dashboards-init container, which
# `--wait` does not block on, so it can appear well after OSD reports healthy.
DATASOURCE_RETRIES="${DATASOURCE_RETRIES:-180}"

# Resolved by resolve_datasource_id() before any osd_proxy call.
DATASOURCE_ID=""

# Look up the id of the seeded `local_cluster` data source, retrying until the
# init container has created it. Sets the global DATASOURCE_ID.
resolve_datasource_id() {
  local max="$1"
  for i in $(seq 1 "$max"); do
    DATASOURCE_ID=$(curl "${OSD_CURL_OPTS[@]}" \
      "$OSD_URL/api/saved_objects/_find?type=data-source&fields=title&search=local_cluster&search_fields=title" \
      | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
    [[ -n "$DATASOURCE_ID" ]] && return 0
    [[ "$i" -eq "$max" ]] && { echo "FAIL: local_cluster data source not found after ${max}s"; exit 1; }
    sleep 1
  done
}

# Proxy a request to OpenSearch through the OSD Dev Tools console proxy, routed
# through the `local_cluster` data source.
# Usage: osd_proxy <method> <opensearch-path> [extra curl args...]
# The console proxy route is always POSTed to; the <method> arg is the verb
# applied against OpenSearch itself.
osd_proxy() {
  local method="$1" path="$2"
  shift 2
  curl "${OSD_CURL_OPTS[@]}" -X POST \
    "$OSD_URL/api/console/proxy?method=${method}&path=${path}&dataSourceId=${DATASOURCE_ID}" "$@"
}

# Check cluster health through the selected data source (DATASOURCE_ID).
# Requires an explicit green/yellow status, not merely "not red": a bad endpoint
# yields a non-JSON error body and thus an empty status, which must fail here.
check_cluster_health() {
  local health_body health
  health_body=$(osd_proxy GET "/_cluster/health")
  health=$(echo "$health_body" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
  if [[ "$health" != "green" && "$health" != "yellow" ]]; then
    echo "  cluster health not green/yellow (via OSD data source)"
    echo "  Response: $health_body"
    return 1
  fi
  echo "  OpenSearch cluster health: $health"
  return 0
}

# Retry a curl check until it returns the expected HTTP status code.
# Usage: retry_check <label> <max_retries> <expected_status> <curl_args...>
retry_check() {
  local label="$1" max="$2" expected="$3"
  shift 3
  local status
  for i in $(seq 1 "$max"); do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$@") && true
    [[ "$status" == "$expected" ]] && return 0
    [[ "$i" -eq "$max" ]] && { echo "FAIL: $label not ready after ${max}s (last status: $status)"; exit 1; }
    sleep 1
  done
}

run_checks() {
  echo "==> Checking OpenSearch Dashboards is up..."
  # OSD must be ready first: the OpenSearch checks below query through its
  # console proxy rather than hitting OpenSearch directly.
  retry_check "OpenSearch Dashboards" "$HEALTH_CHECK_RETRIES" "200" \
    -u "${OPENSEARCH_USER}:${OPENSEARCH_PASSWORD}" \
    "http://localhost:${OPENSEARCH_DASHBOARDS_PORT}/api/status"
  echo "  OpenSearch Dashboards: OK"

  echo "==> Resolving local_cluster data source..."
  resolve_datasource_id "$DATASOURCE_RETRIES"
  echo "  local_cluster data source: $DATASOURCE_ID"

  echo "==> Checking OpenSearch cluster health (via OSD data source)..."
  if ! check_cluster_health; then
    echo "FAIL: OpenSearch cluster health check failed"
    exit 1
  fi

  echo "==> Checking OTel Collector is accepting OTLP..."
  retry_check "OTel Collector" "$HEALTH_CHECK_RETRIES" "200" \
    "http://localhost:${OTEL_COLLECTOR_PORT_HTTP}/v1/traces" \
    -H "Content-Type: application/json" \
    -d '{"resourceSpans":[]}'
  echo "  OTel Collector OTLP HTTP: OK"

  echo "==> Checking Prometheus is up..."
  # Cortex runs under the "prometheus" service name and exposes /ready
  # (not the vanilla Prometheus /-/healthy endpoint).
  retry_check "Prometheus" "$HEALTH_CHECK_RETRIES" "200" \
    "http://localhost:${PROMETHEUS_PORT}/ready"
  echo "  Prometheus: OK"

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

  echo "==> Verifying trace landed in OpenSearch (via OSD data source)..."
  TRACE_ID="5b8efff798038103d269b633813fc60c"
  # The index pattern is URL-encoded for the console proxy's path query param:
  # "*span*,*trace*" -> "%2Aspan%2A%2C%2Atrace%2A".
  SEARCH_PATH="%2Aspan%2A%2C%2Atrace%2A/_search"
  MAX_RETRIES=90
  for i in $(seq 1 "$MAX_RETRIES"); do
    # `|| true` so a transient transport error (e.g. curl exit 7 if OSD blips
    # mid-loop) lets the retry loop continue rather than aborting under
    # `set -euo pipefail`. Mirrors retry_check's `&& true` defusing.
    hits=$(osd_proxy GET "$SEARCH_PATH" \
      -H "Content-Type: application/json" \
      -d "{\"query\":{\"bool\":{\"should\":[{\"term\":{\"traceId\":\"$TRACE_ID\"}},{\"term\":{\"traceID\":\"$TRACE_ID\"}}]}}}" \
      | sed -n 's/.*"total":{"value":\([0-9]*\).*/\1/p') || true
    if [[ "$hits" -gt 0 ]]; then
      echo "  Trace found in OpenSearch after ${i}s"
      break
    fi
    if [[ "$i" -eq "$MAX_RETRIES" ]]; then
      echo "FAIL: Trace not found in OpenSearch after ${MAX_RETRIES}s"
      exit 1
    fi
    sleep 1
  done

  echo ""
  echo "==> All E2E checks passed!"
}

# Delete every data source whose title matches $1. Used to clear orphaned
# throwaway data sources left by a crashed prior run before recreating one, so
# reruns against a persistent stack are self-healing (the saved-objects API does
# not dedupe by title, so a stale object would otherwise accumulate silently).
delete_datasources_by_title() {
  local title="$1" id
  # `grep -o` extracts EVERY id in the response. A greedy `sed` would capture
  # only one match on the single-line JSON body, so multiple orphans would not
  # all be deleted.
  for id in $(curl "${OSD_CURL_OPTS[@]}" \
    "$OSD_URL/api/saved_objects/_find?type=data-source&fields=title&search=${title}&search_fields=title" \
    | grep -o '"id":"[^"]*"' | sed 's/"id":"\([^"]*\)"/\1/'); do
    curl "${OSD_CURL_OPTS[@]}" -o /dev/null -X DELETE \
      "$OSD_URL/api/saved_objects/data-source/${id}" || true
  done
}

# Negative-path regression test for OSD_DATASOURCE_ENDPOINT.
#
# Seeds a throwaway data source whose endpoint points at https://localhost:9200
# — the exact misconfiguration that breaks MDS-scoped OSD features when OSD runs
# inside the compose network (the container can't resolve `localhost` to
# OpenSearch). It then asserts that querying through that data source FAILS the
# health check. This guards against a regression where the health check stops
# detecting a bad endpoint (e.g. reverting to a "not red" check that lets an
# empty/error response slip through).
#
# Assumes run_checks has already passed, so OSD is up and DATASOURCE_ID is set.
run_negative_checks() {
  echo "==> [negative] Verifying a bad data-source endpoint is caught..."
  local bad_id saved_id="$DATASOURCE_ID" bad_title="e2e_bad_endpoint" healthy

  # Self-heal: clear any orphan left by a crashed prior run before recreating,
  # so reruns against a persistent stack stay clean.
  delete_datasources_by_title "$bad_title"

  # Create a data source pointing at the host-only, in-container-unreachable URL.
  bad_id=$(curl "${OSD_CURL_OPTS[@]}" -X POST \
    "$OSD_URL/api/saved_objects/data-source" \
    -H "Content-Type: application/json" \
    -d "{\"attributes\":{\"title\":\"${bad_title}\",\"endpoint\":\"https://localhost:9200\",\"auth\":{\"type\":\"username_password\",\"credentials\":{\"username\":\"${OPENSEARCH_USER}\",\"password\":\"${OPENSEARCH_PASSWORD}\"}},\"dataSourceVersion\":\"3.5.0\",\"dataSourceEngineType\":\"OpenSearch\"}}" \
    | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
  if [[ -z "$bad_id" ]]; then
    echo "FAIL: [negative] could not create throwaway data source"
    exit 1
  fi

  # Point the proxy at the bad data source; the health check must fail. The
  # `if` guard captures the result without `set -e` aborting on the expected
  # non-zero return.
  DATASOURCE_ID="$bad_id"
  if check_cluster_health >/dev/null 2>&1; then healthy=0; else healthy=1; fi

  # Restore the real data source and delete the throwaway one. Delete by the
  # captured id (not _find-by-title): the just-created object may not yet be
  # visible to _find due to saved-objects index refresh lag. No command between
  # create and here can abort under `set -e`, so inline cleanup needs no trap.
  DATASOURCE_ID="$saved_id"
  curl "${OSD_CURL_OPTS[@]}" -o /dev/null -X DELETE \
    "$OSD_URL/api/saved_objects/data-source/${bad_id}" || true

  if [[ "$healthy" -eq 0 ]]; then
    echo "FAIL: [negative] health check PASSED through a bad endpoint (should fail)"
    exit 1
  fi
  echo "  Bad data-source endpoint correctly rejected: OK"

  echo ""
  echo "==> Negative-path checks passed!"
}
