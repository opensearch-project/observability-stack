#!/bin/bash
set -e
DOCS_DIR="$(cd "$(dirname "$0")/.." && pwd)"

case "${1:-}" in
  --stop)
    pkill -f "astro preview" 2>/dev/null && echo "Stopped" || echo "Not running"
    ;;
  --build)
    cd "$DOCS_DIR" && rm -rf dist .astro && npm run build
    ;;
  *)
    pkill -f "astro preview" 2>/dev/null || true
    sleep 1
    # Launch via a detached helper script so the parent shell can exit
    cat > /tmp/_docs_preview.sh << EOF
cd "$DOCS_DIR" && exec npx astro preview --port 4321 > /tmp/astro-preview.log 2>&1
EOF
    /bin/bash /tmp/_docs_preview.sh &
    for i in $(seq 1 15); do
      if curl -s http://localhost:4321/docs > /dev/null 2>&1; then
        echo "Ready at http://localhost:4321/docs"
        exit 0
      fi
      sleep 2
    done
    echo "Failed to start — check /tmp/astro-preview.log"
    exit 1
    ;;
esac
