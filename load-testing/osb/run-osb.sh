#!/usr/bin/env bash
# Run OpenSearch Benchmark against the cluster.
# Prerequisites: pip install opensearch-benchmark
#
# Usage:
#   # Port-forward first:
#   kubectl port-forward -n observability-stack svc/opensearch-cluster-master 9200:9200
#
#   ./run-osb.sh                    # standard benchmark
#   ./run-osb.sh --redline-test     # find breaking point automatically

set -euo pipefail

HOST="${OPENSEARCH_HOST:-https://localhost:9200}"
USER="${OPENSEARCH_USER:-admin}"
PASS="${OPENSEARCH_PASSWORD:-My_password_123!@#}"
WORKLOAD_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "${1:-}" == "--redline-test" ]]; then
  echo "🔴 Running redline test (auto-ramp to breaking point)..."
  opensearch-benchmark execute-test \
    --target-hosts="$HOST" \
    --pipeline=benchmark-only \
    --workload-path="$WORKLOAD_DIR" \
    --client-options="use_ssl:true,verify_certs:false,basic_auth_user:${USER},basic_auth_password:${PASS}" \
    --redline-test
else
  echo "📊 Running standard benchmark..."
  opensearch-benchmark execute-test \
    --target-hosts="$HOST" \
    --pipeline=benchmark-only \
    --workload-path="$WORKLOAD_DIR" \
    --client-options="use_ssl:true,verify_certs:false,basic_auth_user:${USER},basic_auth_password:${PASS}"
fi
