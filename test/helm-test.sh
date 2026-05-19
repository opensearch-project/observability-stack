#!/usr/bin/env bash
# Helm lint + unit tests for the observability-stack chart.
# Requires: helm, helm-unittest plugin (helm plugin install https://github.com/helm-unittest/helm-unittest.git)
# Usage: ./test/helm-test.sh
set -euo pipefail

CHART="charts/observability-stack"

echo "==> helm dependency build"
# Subchart tarballs must be present for unittest suites that target subchart
# templates (e.g. tests/otel_demo_frontend_proxy_test.yaml against the
# opentelemetry-demo subchart's component.yaml).
helm dependency build "$CHART"

echo ""
echo "==> helm lint"
helm lint "$CHART"

echo ""
echo "==> helm unittest"
helm unittest "$CHART"
