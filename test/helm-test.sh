#!/usr/bin/env bash
# Helm lint + unit tests for the observability-stack chart.
# Requires: helm, helm-unittest plugin (helm plugin install https://github.com/helm-unittest/helm-unittest.git)
# Usage: ./test/helm-test.sh
set -euo pipefail

CHART="charts/observability-stack"

echo "==> helm lint"
helm lint "$CHART"

echo ""
echo "==> helm unittest"
helm unittest "$CHART"
