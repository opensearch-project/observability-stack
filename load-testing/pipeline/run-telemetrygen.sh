#!/usr/bin/env bash
# Pipeline throughput test — ramps telemetrygen rate to find breaking point.
# Prerequisites: telemetrygen installed
#   go install github.com/open-telemetry/opentelemetry-collector-contrib/cmd/telemetrygen@latest
#
# Usage:
#   # Port-forward first:
#   kubectl port-forward -n observability-stack svc/obs-stack-opentelemetry-collector 4317:4317
#
#   ./run-telemetrygen.sh              # default: traces
#   ./run-telemetrygen.sh logs         # test log pipeline
#   ./run-telemetrygen.sh metrics      # test metrics pipeline
#   ./run-telemetrygen.sh all          # test all three

set -euo pipefail

ENDPOINT="${OTEL_ENDPOINT:-localhost:4317}"
DURATION="${DURATION:-3m}"
SIGNAL="${1:-traces}"
RATES=(50 100 250 500 1000 2500 5000)

run_step() {
  local signal="$1" rate="$2"
  echo ""
  echo "=========================================="
  echo "  ${signal} @ ${rate}/sec for ${DURATION}"
  echo "=========================================="
  telemetrygen "$signal" \
    --otlp-endpoint="$ENDPOINT" \
    --otlp-insecure \
    --rate="$rate" \
    --duration="$DURATION" \
    --service="load-test-${signal}" \
    --otlp-attributes='gen_ai.agent.name="load-test"' \
    2>&1 | tail -5
  echo "--- Sleeping 30s before next step ---"
  sleep 30
}

run_signal() {
  local signal="$1"
  echo ""
  echo "############################################"
  echo "  Starting ${signal} ramp test"
  echo "  Endpoint: ${ENDPOINT}"
  echo "  Duration per step: ${DURATION}"
  echo "  Rates: ${RATES[*]}"
  echo "############################################"
  for rate in "${RATES[@]}"; do
    run_step "$signal" "$rate"
  done
  echo ""
  echo "✅ ${signal} ramp complete"
}

case "$SIGNAL" in
  all)
    for s in traces logs metrics; do run_signal "$s"; done
    ;;
  traces|logs|metrics)
    run_signal "$SIGNAL"
    ;;
  *)
    echo "Usage: $0 [traces|logs|metrics|all]"
    exit 1
    ;;
esac
