#!/usr/bin/env bash
# Run the observability stack with Data Prepper -> a local Mustang node. See AOS-MUSTANG-SETUP.md.
#   usage: ./aos-mustang-up.sh [compose args]     default: up -d
#   e.g.   ./aos-mustang-up.sh up -d --force-recreate --no-deps data-prepper
# Optional settings in ${AOS_MUSTANG_ENV:-~/.aos-mustang.env}:
#   MUSTANG_URL             node as seen from this host        (default http://127.0.0.1:9200)
#   MUSTANG_ENDPOINT        node as seen from the containers  (default http://host.docker.internal:9200)
#   MUSTANG_USER / MUSTANG_PASSWORD                            (only if the node runs the security plugin)
#   DP_OPENSEARCH_SINK_JAR  default: ../data-prepper/data-prepper-plugins/opensearch/build/libs/data-prepper-opensearch-*-SNAPSHOT.jar
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=${AOS_MUSTANG_ENV:-$HOME/.aos-mustang.env}
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
MUSTANG_URL=${MUSTANG_URL:-http://127.0.0.1:9200}
AUTH=(); [ -n "${MUSTANG_USER:-}" ] && [ -n "${MUSTANG_PASSWORD:-}" ] && AUTH=(-u "$MUSTANG_USER:$MUSTANG_PASSWORD")

if [ -z "${DP_OPENSEARCH_SINK_JAR:-}" ]; then
  DP_OPENSEARCH_SINK_JAR=$(ls ../data-prepper/data-prepper-plugins/opensearch/build/libs/data-prepper-opensearch-*-SNAPSHOT.jar 2>/dev/null | head -1 || true)
fi
[ -f "${DP_OPENSEARCH_SINK_JAR:-}" ] || { echo "DP_OPENSEARCH_SINK_JAR not found (build data-prepper main: ./gradlew :data-prepper-plugins:opensearch:jar)"; exit 1; }
export DP_OPENSEARCH_SINK_JAR=$(cd "$(dirname "$DP_OPENSEARCH_SINK_JAR")" && pwd)/$(basename "$DP_OPENSEARCH_SINK_JAR")

if [ "${1:-up}" = up ]; then
  curl -sf -m5 "${AUTH[@]}" "$MUSTANG_URL" >/dev/null || { echo "Mustang node not reachable at $MUSTANG_URL"; exit 1; }
  GW=$(ip -4 -o addr show docker0 2>/dev/null | awk '{print $4}' | cut -d/ -f1)
  if [ -n "$GW" ] && ! curl -s -m3 -o /dev/null "http://$GW:9200"; then
    echo "Containers can't reach the node: run  python3 mustang-bridge-fwd.py $GW  (keep it running)"; exit 1
  fi
  # Data Prepper only references the component template; it must exist before DP starts.
  curl -sf "${AUTH[@]}" -XPUT "$MUSTANG_URL/_component_template/composite-index" -H 'content-type: application/json' \
       -d @docker-compose/data-prepper/composite-index-component-template.json >/dev/null && echo "component template composite-index: ok"
fi

export INCLUDE_COMPOSE_OTEL_DEMO=${INCLUDE_COMPOSE_OTEL_DEMO:-docker-compose.otel-demo.yml}
# Shell values would override .env for the bundled local OpenSearch; let .env decide.
unset OPENSEARCH_HOST OPENSEARCH_PORT OPENSEARCH_PROTOCOL OPENSEARCH_USER OPENSEARCH_PASSWORD
F=(-f docker-compose.yml -f docker-compose.local-env-fixes.yml -f docker-compose.aos-mustang.yml)
[ $# -eq 0 ] && set -- up -d
exec docker compose "${F[@]}" "$@"
