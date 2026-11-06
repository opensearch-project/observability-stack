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

# Anomaly detection and forecasting seeded for the demos by
# docker-compose/opensearch-dashboards/init/init-anomaly-detectors.py: one
# init container per demo (example agents, OTel Demo), each creating its
# detectors, forecasters and one anomaly alerting monitor per detector.
#
# Creation waits for the demo's first spans (the plugins reject a detector
# until its index has documents and its fields are mapped), so allow a few
# minutes. Models only produce results ~40 minutes after bring-up, which is
# out of scope for E2E; these checks verify the setups exist and their
# real-time jobs are started.
AD_RETRIES="${AD_RETRIES:-480}"
AD_API="/_plugins/_anomaly_detection/detectors"
FORECAST_API="/_plugins/_forecast/forecasters"
EXAMPLE_DETECTORS=(agent-invocation-latency-errors agent-tool-errors-latency agent-llm-token-usage)
EXAMPLE_FORECASTERS=(agent-request-volume-forecast agent-llm-token-forecast)
EXAMPLE_AD_MONITORS=("Agent Demo - Agent Latency/Error Anomaly" "Agent Demo - Tool Call Anomaly" "Agent Demo - LLM Token Usage Anomaly")
OTEL_DEMO_DETECTORS=(otel-demo-service-traffic-errors otel-demo-service-latency)
OTEL_DEMO_FORECASTERS=(otel-demo-frontend-traffic-forecast)
OTEL_DEMO_AD_MONITORS=("OTel Demo - Service Traffic/Error Anomaly" "OTel Demo - Service Latency Anomaly")

# Print the id of the detector/forecaster named $2 under API $1, or nothing.
# Before the first one is created the config index doesn't exist, so the
# search returns an error body with no _id.
ad_config_id() {
  local api="$1" name="$2"
  osd_proxy POST "${api}/_search" -H "Content-Type: application/json" \
    -d "{\"size\":1,\"query\":{\"term\":{\"name.keyword\":\"${name}\"}}}" \
    | grep -o '"_id":"[^"]*"' | head -1 | sed 's/"_id":"\([^"]*\)"/\1/' || true
}

# Succeed if the config's real-time job is enabled. With ?job=true the
# response embeds the job, whose "enabled" flag is the only bare "enabled"
# key ("feature_enabled" doesn't match the quoted pattern).
ad_job_enabled() {
  local api="$1" id="$2"
  osd_proxy GET "${api}/${id}%3Fjob%3Dtrue" | grep -q '"enabled":true'
}

# Print the body of the alerting monitor named $1 (empty hits if none).
ad_monitor_search() {
  osd_proxy POST "/_plugins/_alerting/monitors/_search" -H "Content-Type: application/json" \
    -d "{\"size\":1,\"query\":{\"term\":{\"monitor.name.keyword\":\"$1\"}}}" || true
}

# Wait until the config named $3 exists under API $2 with its job started.
# Prints the id. $1 is a label for messages.
wait_for_ad_config() {
  local kind="$1" api="$2" name="$3" id=""
  for i in $(seq 1 "$((AD_RETRIES / 5))"); do
    id=$(ad_config_id "$api" "$name")
    if [[ -n "$id" ]] && ad_job_enabled "$api" "$id"; then
      echo "$id"
      return 0
    fi
    sleep 5
  done
  echo "FAIL: ${kind} '${name}' not created and started after ${AD_RETRIES}s (id: ${id:-none})" >&2
  return 1
}

# Fail if any of the named configs exists.
# Usage: assert_ad_absent <label> <detector|forecaster|monitor> <name>...
assert_ad_absent() {
  local label="$1" kind="$2" name
  shift 2
  for name in "$@"; do
    case "$kind" in
      detector)   [[ -z "$(ad_config_id "$AD_API" "$name")" ]] ;;
      forecaster) [[ -z "$(ad_config_id "$FORECAST_API" "$name")" ]] ;;
      monitor)    ! ad_monitor_search "$name" | grep -q '"_id"' ;;
    esac || { echo "FAIL: ${label} ${kind} '${name}' exists but shouldn't"; exit 1; }
  done
}

assert_otel_demo_ad_absent() {
  assert_ad_absent "OTel Demo" detector "${OTEL_DEMO_DETECTORS[@]}"
  assert_ad_absent "OTel Demo" forecaster "${OTEL_DEMO_FORECASTERS[@]}"
  assert_ad_absent "OTel Demo" monitor "${OTEL_DEMO_AD_MONITORS[@]}"
  echo "  No OTel Demo detectors, forecasters or anomaly monitors: OK"
}

# Usage: run_anomaly_detection_checks <examples|none>
#   examples: the example agents are on (the default .env) and the OTel Demo
#             is off: expect the example-agent set, and no OTel Demo set.
#   none:     both demos are off: expect nothing seeded.
run_anomaly_detection_checks() {
  local mode="$1" idx name id monitor_name body
  echo "==> Checking demo anomaly detection setups (${mode})..."
  case "$mode" in
    examples)
      for idx in "${!EXAMPLE_DETECTORS[@]}"; do
        name="${EXAMPLE_DETECTORS[$idx]}"
        monitor_name="${EXAMPLE_AD_MONITORS[$idx]}"
        id=$(wait_for_ad_config "Detector" "$AD_API" "$name") || exit 1
        echo "  Detector ${name}: started (${id})"
        # The detector's monitor must be an anomaly detector monitor over
        # this detector's results (what Alerting's "Anomaly detector"
        # defining method builds). It's created right after the detector.
        body=""
        for i in $(seq 1 30); do
          body=$(ad_monitor_search "$monitor_name")
          echo "$body" | grep -q "\"${id}\"" && break
          sleep 2
        done
        if ! echo "$body" | grep -q "\"${id}\"" || ! echo "$body" | grep -q 'opendistro-anomaly-results'; then
          echo "FAIL: anomaly monitor '${monitor_name}' missing or not wired to detector ${id}"
          exit 1
        fi
        echo "  Monitor '${monitor_name}': OK"
      done
      for name in "${EXAMPLE_FORECASTERS[@]}"; do
        id=$(wait_for_ad_config "Forecaster" "$FORECAST_API" "$name") || exit 1
        echo "  Forecaster ${name}: started (${id})"
      done
      assert_otel_demo_ad_absent
      ;;
    none)
      assert_ad_absent "example-agent" detector "${EXAMPLE_DETECTORS[@]}"
      assert_ad_absent "example-agent" forecaster "${EXAMPLE_FORECASTERS[@]}"
      assert_ad_absent "example-agent" monitor "${EXAMPLE_AD_MONITORS[@]}"
      echo "  No example-agent detectors, forecasters or anomaly monitors: OK"
      assert_otel_demo_ad_absent
      ;;
    *)
      echo "FAIL: run_anomaly_detection_checks: unknown mode '${mode}'"
      exit 1
      ;;
  esac
  echo ""
  echo "==> Anomaly detection checks passed!"
}
