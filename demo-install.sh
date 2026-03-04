#!/usr/bin/env bash
#
# Observability Stack Installer Demo
# Shows what the installer looks like without actually installing
#

# Colors and formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# Unicode symbols
CHECK="✓"
CROSS="✗"
ARROW="→"
STAR="★"

clear

echo -e ""
echo -e "  ${PURPLE}${BOLD}🔭 Observability Stack${RESET}"
echo -e ""
echo -e "  ${DIM}Installer v0.1${RESET}"
echo -e "  ${DIM}Agents, Services, Logs, Metrics, Traces & Evals${RESET}"
echo -e ""

sleep 1

echo -e "${PURPLE}${BOLD}${ARROW}${RESET} ${BOLD}Checking system requirements...${RESET}"
sleep 0.5
echo -e "${GREEN}${CHECK}${RESET} Git installed: git version 2.39.0"
sleep 0.3
echo -e "${GREEN}${CHECK}${RESET} Container runtime: docker"
sleep 0.3
echo -e "${GREEN}${CHECK}${RESET} Docker Compose: v2.23.0"
sleep 0.3
echo -e "${GREEN}${CHECK}${RESET} Available memory: 16GB"
sleep 0.5

echo ""
echo -e "${PURPLE}${BOLD}${ARROW}${RESET} ${BOLD}Configuration${RESET}"
echo ""
sleep 0.5
echo -e "${BOLD}Installation directory${RESET} ${DIM}(default: observability-stack)${RESET}: observability-stack"
sleep 0.5
echo -e "${BOLD}Include example services?${RESET} ${DIM}(Y/n)${RESET}: Y"
sleep 0.5
echo -e "${BOLD}Include OpenTelemetry Demo?${RESET} ${DIM}(Y/n)${RESET}: Y"
sleep 0.5
echo -e "${BOLD}Customize OpenSearch credentials?${RESET} ${DIM}(y/N)${RESET}: N"
sleep 0.5

echo ""
echo -e "${PURPLE}${BOLD}${ARROW}${RESET} ${BOLD}Cloning Observability Stack repository...${RESET}"
sleep 1
echo -e "${GREEN}${CHECK}${RESET} Repository cloned to observability-stack"
sleep 0.5

echo ""
echo -e "${PURPLE}${BOLD}${ARROW}${RESET} ${BOLD}Configuring environment...${RESET}"
sleep 0.5
echo -e "${DIM}  Example services enabled${RESET}"
sleep 0.3
echo -e "${GREEN}${CHECK}${RESET} Environment configured"
sleep 0.5

echo ""
echo -e "${PURPLE}${BOLD}${ARROW}${RESET} ${BOLD}Pulling container images...${RESET}"
echo ""
sleep 0.5

# Demo image list (versions are illustrative - actual versions come from .env)
images=(
    "opensearchproject/opensearch:3.5.0"
    "opensearchproject/opensearch-dashboards:3.5.0"
    "otel/opentelemetry-collector-contrib:0.143.0"
    "opensearchproject/data-prepper:2.13.0"
    "prom/prometheus:v3.8.1"
    "python:3.11-slim"
)

spinner=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

for i in "${!images[@]}"; do
    num=$((i + 1))
    total=${#images[@]}
    percent=$((num * 100 / total))
    filled=$((percent / 5))
    empty=$((20 - filled))
    
    # Show progress bar with spinner animation
    for spin_idx in {0..9}; do
        echo -ne "\r${DIM}[$num/$total]${RESET} ["
        printf "%${filled}s" | tr ' ' '█'
        printf "%${empty}s" | tr ' ' '░'
        echo -ne "] ${percent}% ${PURPLE}${spinner[$spin_idx]}${RESET} ${DIM}Pulling ${images[$i]}${RESET}"
        sleep 0.08
    done
    
    # Show completion
    echo -ne "\r${DIM}[$num/$total]${RESET} ["
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    echo -e "] ${percent}% ${GREEN}${CHECK}${RESET} ${DIM}${images[$i]}${RESET}"
done

echo ""
echo -e "${GREEN}${CHECK}${RESET} Images ready: 6 pulled, 0 cached"
sleep 0.5

echo ""
echo -e "${PURPLE}${BOLD}${ARROW}${RESET} ${BOLD}Starting Observability Stack services...${RESET}"
echo ""
sleep 1

echo -e "${DIM}[+] Running 8/8${RESET}"
echo -e "${DIM} ✔ Network observability-stack-network           Created${RESET}"
echo -e "${DIM} ✔ Volume \"observability-stack_opensearch-data\"  Created${RESET}"
echo -e "${DIM} ✔ Volume \"observability-stack_prometheus-data\"  Created${RESET}"
echo -e "${DIM} ✔ Container opensearch               Started${RESET}"
echo -e "${DIM} ✔ Container otel-collector           Started${RESET}"
echo -e "${DIM} ✔ Container data-prepper             Started${RESET}"
echo -e "${DIM} ✔ Container prometheus               Started${RESET}"
echo -e "${DIM} ✔ Container opensearch-dashboards    Started${RESET}"

sleep 1
echo ""
echo -e "${GREEN}${CHECK}${RESET} Services started"
sleep 0.5

echo ""
echo -e "${PURPLE}${BOLD}${ARROW}${RESET} ${BOLD}Waiting for services to be ready...${RESET}"
echo ""
sleep 0.5

echo -ne "${DIM}Waiting for OpenSearch${RESET}"
for i in {1..8}; do
    sleep 0.3
    echo -ne "."
done
echo -e "${GREEN}${CHECK}${RESET}"
sleep 0.3

echo -ne "${DIM}Waiting for OpenSearch Dashboards${RESET}"
for i in {1..8}; do
    sleep 0.3
    echo -ne "."
done
echo -e "${GREEN}${CHECK}${RESET}"
sleep 0.5

echo ""
echo -e "${GREEN}${CHECK}${RESET} Services are ready"
sleep 1

echo ""
echo -e "  ${GREEN}${BOLD}${STAR} Observability Stack Install Complete! ${STAR}${RESET}"
echo ""

echo -e "${GREEN}${ARROW}${RESET} ${BOLD}UI:${RESET}        OpenSearch Dashboards  ${BOLD}http://localhost:5601${RESET}"
echo -e "           ${DIM}Username: ${RESET}${BOLD}admin${RESET}  ${DIM}Password: ${RESET}${BOLD}My_password_123!@#${RESET}"
echo ""
echo -e "${GREEN}${ARROW}${RESET} ${BOLD}Send OTLP:${RESET} OTel Collector         ${BOLD}grpc://localhost:4317${RESET}"
echo -e "                                      ${BOLD}http://localhost:4318${RESET}"
echo ""

echo -e "${DIM}Other Services:${RESET}"
echo -e "  ${DIM}${ARROW} Prometheus:            http://localhost:9090${RESET}"
echo -e "  ${DIM}${ARROW} OpenSearch API:        https://localhost:9200${RESET}"
echo -e "  ${DIM}${ARROW} Weather Agent:         http://localhost:8000${RESET}"
echo -e "  ${DIM}${ARROW} Travel Planner:        http://localhost:8003${RESET}"
echo -e "  ${DIM}${ARROW} OTel Demo Frontend:    http://localhost:8080${RESET}"
echo -e "  ${DIM}${ARROW} Load Generator:        http://localhost:8089${RESET}"

echo ""
echo -e "${BOLD}Useful Commands:${RESET}"
echo -e "  ${DIM}# View logs${RESET}"
echo -e "  ${BOLD}cd observability-stack && docker compose logs -f${RESET}"
echo ""
echo -e "  ${DIM}# Stop services${RESET}"
echo -e "  ${BOLD}cd observability-stack && docker compose down${RESET}"
echo ""
echo -e "  ${DIM}# Stop and remove data${RESET}"
echo -e "  ${BOLD}cd observability-stack && docker compose down -v${RESET}"

echo ""
echo -e "${PURPLE}${BOLD}Next Steps:${RESET}"
echo -e "  1. Visit ${PURPLE}http://localhost:5601${RESET} to explore your data"
echo -e "  2. To send data, point your OTLP exporter at ${PURPLE}localhost:4317${RESET} (gRPC) or ${PURPLE}localhost:4318${RESET} (HTTP)"
echo -e "  3. Learn more at ${PURPLE}https://opensearch.org/platform/observability/${RESET}"

echo ""
echo -e "${DIM}For support, visit: https://github.com/opensearch-project/observability-stack${RESET}"
echo ""
