#!/usr/bin/env bash
#
# Observability Stack Installer
# Downloads and runs the interactive TUI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/opensearch-project/observability-stack/main/install.sh | bash
#

set -e
set -o pipefail

# Configuration
REPO_URL="https://github.com/opensearch-project/observability-stack.git"
TEMP_DIR=$(mktemp -d)
SIMULATE_MODE=false
SKIP_PULL=false
OPENSEARCH_PROTOCOL=""
OPENSEARCH_HOST=""
OPENSEARCH_PORT=""
OPENSEARCH_DASHBOARDS_PROTOCOL=""
OPENSEARCH_DASHBOARDS_HOST=""
OPENSEARCH_DASHBOARDS_PORT=""
CURRENT_STEP=""  # Track current installation step

# Cleanup on exit
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo ""
        print_error "Installation failed"
        echo ""
        
        # Save logs if installation directory exists
        if [ -n "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR" ]; then
            local log_file="$INSTALL_DIR/install-error.log"
            echo "Saving installation logs to: $log_file"
            
            {
                echo "=== Observability Stack Installation Error Log ==="
                echo "Date: $(date)"
                echo "Installation Directory: $INSTALL_DIR"
                echo "Container Runtime: $CONTAINER_RUNTIME"
                echo "Failed Step: ${CURRENT_STEP:-Unknown}"
                echo ""
                echo "=== System Information ==="
                echo "OS: $(uname -s)"
                echo "Architecture: $(uname -m)"
                if command -v docker >/dev/null 2>&1; then
                    echo "Docker Version: $(docker --version 2>&1)"
                fi
                echo ""
                echo "=== Error Details ==="
                
                # Read error from temp file if it exists
                if [ -f "$TEMP_DIR/last_error.txt" ]; then
                    cat "$TEMP_DIR/last_error.txt"
                elif [ -f "$INSTALL_DIR/.install_error" ]; then
                    cat "$INSTALL_DIR/.install_error"
                else
                    echo "Step '$CURRENT_STEP' failed"
                    echo "No detailed error information captured"
                    echo ""
                    echo "Common issues:"
                    echo "  - Network connectivity problems"
                    echo "  - Docker not running or insufficient permissions"
                    echo "  - Insufficient disk space"
                    echo "  - Invalid configuration in docker-compose.yml"
                fi
                
                echo ""
                
                # Capture docker compose logs if services were started
                if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
                    echo "=== Docker Compose Logs ==="
                    cd "$INSTALL_DIR" 2>/dev/null
                    if [ "$CONTAINER_RUNTIME" = "docker" ]; then
                        docker compose logs 2>&1 || echo "No services running yet"
                    else
                        finch compose logs 2>&1 || echo "No services running yet"
                    fi
                fi
            } > "$log_file" 2>&1
            
            echo ""
            print_info "Troubleshooting:"
            echo "  1. Check logs: cat $log_file"
            echo "  2. Verify Docker is running: docker info"
            echo "  3. Check disk space: df -h"
            echo "  4. Visit: https://github.com/opensearch-project/observability-stack/issues"
        else
            print_info "For help, visit: https://github.com/opensearch-project/observability-stack/issues"
        fi
    fi
    
    # Clean up temp directory
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}

trap cleanup EXIT

# Handle interrupts gracefully
interrupt_handler() {
    echo ""
    echo "Installation interrupted by user"
    exit 130
}

trap interrupt_handler INT TERM

# Help text
usage() {
    cat <<EOF
Observability Stack Installer

Usage: install.sh [OPTIONS]

Options:
  --simulate   Preview the installer output without actually installing
  --skip-pull  Skip building and pulling container images (uses cached images)
  --help       Show this help message

Examples:
  curl -fsSL https://raw.githubusercontent.com/.../install.sh | bash
  ./install.sh --simulate
  ./install.sh --skip-pull
EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            usage
            ;;
        --simulate)
            SIMULATE_MODE=true
            shift
            ;;
        --skip-pull)
            SKIP_PULL=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

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

# Configuration
DEFAULT_INSTALL_DIR="observability-stack"

# Print functions
print_header() {
    echo -e ""
    echo -e "  ${PURPLE}${BOLD}🔭 Observability Stack${RESET}"
    echo -e ""
    echo -e "  ${DIM}Installer v0.1${RESET}"
    echo -e "  ${DIM}Agents, Services, Logs, Metrics, Traces & Evals${RESET}"
    echo -e ""
}

print_step() {
    echo -e "${PURPLE}${BOLD}${ARROW}${RESET} ${BOLD}$1${RESET}"
}

print_success() {
    echo -e "${GREEN}${CHECK}${RESET} $1"
}

print_error() {
    echo -e "${RED}${CROSS}${RESET} $1"
}

print_warning() {
    echo -e "${YELLOW}!${RESET} $1"
}

print_info() {
    echo -e "${DIM}  $1${RESET}"
}

# Progress bar function
show_progress() {
    local duration=$1
    local message=$2
    local width=50
    
    echo -ne "${message}"
    for ((i=0; i<=width; i++)); do
        sleep $(echo "scale=3; $duration/$width" | bc)
        local percent=$((i * 100 / width))
        local filled=$((i * 100 / width / 2))
        local empty=$((50 - filled))
        
        printf "\r${message} ["
        printf "%${filled}s" | tr ' ' '█'
        printf "%${empty}s" | tr ' ' '░'
        printf "] %3d%%" $percent
    done
    echo -e " ${GREEN}${CHECK}${RESET}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect Docker or Finch
detect_container_runtime() {
    if command_exists docker && docker info >/dev/null 2>&1; then
        echo "docker"
    elif command_exists finch && finch info >/dev/null 2>&1; then
        echo "finch"
    else
        echo ""
    fi
}

# Check system requirements
check_requirements() {
    print_step "Checking system requirements..."
    
    local all_good=true
    
    # Check for git
    if command_exists git; then
        print_success "Git installed: $(git --version | head -n1)"
    else
        print_error "Git is not installed"
        print_info "Install git: https://git-scm.com/downloads"
        all_good=false
    fi
    
    # Check for container runtime
    CONTAINER_RUNTIME=$(detect_container_runtime)
    if [ -n "$CONTAINER_RUNTIME" ]; then
        print_success "Container runtime: $CONTAINER_RUNTIME"
        
        # Check Docker Compose
        if [ "$CONTAINER_RUNTIME" = "docker" ]; then
            if docker compose version >/dev/null 2>&1; then
                print_success "Docker Compose: $(docker compose version --short)"
            else
                print_error "Docker Compose is not available"
                print_info "Install Docker Compose: https://docs.docker.com/compose/install/"
                all_good=false
            fi
        elif [ "$CONTAINER_RUNTIME" = "finch" ]; then
            if finch compose version >/dev/null 2>&1; then
                print_success "Finch Compose: $(finch compose version --short)"
            else
                print_error "Finch Compose is not available"
                all_good=false
            fi
        fi
    else
        print_error "No container runtime found (Docker or Finch)"
        print_info "Install Docker: https://docs.docker.com/get-docker/"
        print_info "Or Finch (macOS): https://github.com/runfinch/finch"
        all_good=false
    fi
    
    # Check available memory
    if [[ "$OSTYPE" == "darwin"* ]]; then
        total_mem=$(sysctl -n hw.memsize | awk '{print int($1/1024/1024/1024)}')
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        total_mem=$(free -g | awk '/^Mem:/{print $2}')
    else
        total_mem=0
    fi
    
    if [ "$total_mem" -ge 4 ]; then
        print_success "Available memory: ${total_mem}GB"
    else
        print_warning "Low memory detected: ${total_mem}GB (4GB+ recommended)"
    fi
    
    echo ""
    
    if [ "$all_good" = false ]; then
        print_error "System requirements not met. Please install missing dependencies."
        exit 1
    fi
}

# Interactive configuration
configure_installation() {
    print_step "Configuration"
    echo ""
    
    # Installation directory
    echo -ne "${BOLD}Installation directory${RESET} ${DIM}(default: $DEFAULT_INSTALL_DIR)${RESET}: "
    read -r install_dir < /dev/tty
    INSTALL_DIR="${install_dir:-$DEFAULT_INSTALL_DIR}"
    
    # Check if directory exists
    if [ -d "$INSTALL_DIR" ]; then
        echo -ne "${YELLOW}Directory exists. Overwrite?${RESET} ${DIM}(y/N)${RESET}: "
        read -r overwrite < /dev/tty
        if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
            print_error "Installation cancelled"
            exit 0
        fi
        rm -rf "$INSTALL_DIR"
    fi
    
    # Include examples
    echo -ne "${BOLD}Include example services?${RESET} ${DIM}(weather-agent, travel-planner, canary)${RESET} ${DIM}(Y/n)${RESET}: "
    read -r include_examples < /dev/tty
    INCLUDE_EXAMPLES="${include_examples:-Y}"
    
    # Include OTel Demo
    echo -ne "${BOLD}Include OpenTelemetry Demo?${RESET} ${DIM}(requires ~2GB additional memory)${RESET} ${DIM}(Y/n)${RESET}: "
    read -r include_otel_demo < /dev/tty
    INCLUDE_OTEL_DEMO="${include_otel_demo:-Y}"
    
    # Custom credentials
    echo -ne "${BOLD}Customize OpenSearch credentials?${RESET} ${DIM}(y/N)${RESET}: "
    read -r custom_creds < /dev/tty
    if [[ "$custom_creds" =~ ^[Yy]$ ]]; then
        echo -ne "${BOLD}OpenSearch username${RESET} ${DIM}(default: admin)${RESET}: "
        read -r opensearch_user < /dev/tty
        OPENSEARCH_USER="${opensearch_user:-admin}"
        
        echo -ne "${BOLD}OpenSearch password${RESET} ${DIM}(default: My_password_123!@#)${RESET}: "
        read -rs opensearch_password < /dev/tty
        echo ""
        OPENSEARCH_PASSWORD="${opensearch_password:-My_password_123!@#}"
    else
        OPENSEARCH_USER="admin"
        OPENSEARCH_PASSWORD="My_password_123!@#"
    fi
    
    echo ""
}

# Clone repository
clone_repository() {
    CURRENT_STEP="Cloning repository"
    print_step "Cloning Observability Stack repository..."
    
    # Convert to absolute path
    if [[ "$INSTALL_DIR" != /* ]]; then
        INSTALL_DIR="$(pwd)/$INSTALL_DIR"
    fi
    
    if git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1; then
        print_success "Repository cloned to $INSTALL_DIR"
    else
        print_error "Failed to clone repository"
        exit 1
    fi
}

# Configure environment
configure_environment() {
    CURRENT_STEP="Configuring environment"
    print_step "Configuring environment..."
    
    # Verify we can access the directory
    if [ ! -d "$INSTALL_DIR" ]; then
        print_error "Installation directory not found: $INSTALL_DIR"
        exit 1
    fi
    
    # Verify .env file exists
    if [ ! -f "$INSTALL_DIR/.env" ]; then
        print_error ".env file not found in $INSTALL_DIR"
        exit 1
    fi
    
    cd "$INSTALL_DIR" || exit 1
    
    # Update .env file
    if [[ ! "$INCLUDE_EXAMPLES" =~ ^[Yy]$ ]]; then
        sed -i.bak 's/^INCLUDE_COMPOSE_EXAMPLES=/#INCLUDE_COMPOSE_EXAMPLES=/' .env
        print_info "Example services disabled"
    fi
    
    if [[ "$INCLUDE_OTEL_DEMO" =~ ^[Yy]$ ]]; then
        sed -i.bak 's/^# *INCLUDE_COMPOSE_OTEL_DEMO=/INCLUDE_COMPOSE_OTEL_DEMO=/' .env
        print_info "OpenTelemetry Demo enabled"
    fi
    
    # Update credentials if customized
    if [ "$OPENSEARCH_USER" != "admin" ] || [ "$OPENSEARCH_PASSWORD" != "My_password_123!@#" ]; then
        sed -i.bak "s/^OPENSEARCH_USER=.*/OPENSEARCH_USER=$OPENSEARCH_USER/" .env
        sed -i.bak "s/^OPENSEARCH_PASSWORD=.*/OPENSEARCH_PASSWORD='$OPENSEARCH_PASSWORD'/" .env
        
        print_info "Credentials updated"
    fi
    
    # Clean up backup files
    find . -name "*.bak" -delete
    
    print_success "Environment configured"
}

# Pull Docker images
pull_images() {
    CURRENT_STEP="Building and pulling container images"

    if [ "$SKIP_PULL" = true ]; then
        print_step "Skipping image build/pull (--skip-pull)"
        return
    fi

    print_step "Building and pulling container images..."
    echo ""

    cd "$INSTALL_DIR" || exit 1

    # First, build any custom images with progress indicator
    echo -ne "${DIM}Building custom OpenSearch image...${RESET}"
    
    # Spinner for build process
    local spinner=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local spinner_idx=0
    
    if [ "$CONTAINER_RUNTIME" = "docker" ]; then
        docker compose build >/dev/null 2>&1 &
    else
        finch compose build >/dev/null 2>&1 &
    fi
    
    local build_pid=$!
    
    # Show spinner while building
    while kill -0 $build_pid 2>/dev/null; do
        echo -ne "\r${DIM}Building custom OpenSearch image...${RESET} ${PURPLE}${spinner[$spinner_idx]}${RESET}"
        spinner_idx=$(( (spinner_idx + 1) % ${#spinner[@]} ))
        sleep 0.1
    done
    
    wait $build_pid
    local build_exit=$?
    
    if [ $build_exit -eq 0 ]; then
        echo -e "\r${DIM}Building custom OpenSearch image...${RESET} ${GREEN}${CHECK}${RESET}"
    else
        echo -e "\r${DIM}Building custom OpenSearch image...${RESET} ${RED}${CROSS}${RESET}"
        
        # Capture build error
        local build_error
        if [ "$CONTAINER_RUNTIME" = "docker" ]; then
            build_error=$(docker compose build 2>&1)
        else
            build_error=$(finch compose build 2>&1)
        fi
        
        cat > "$INSTALL_DIR/.install_error" << EOF
Failed to build custom OpenSearch image

Build Error:
$build_error

This may be due to:
  - Network connectivity issues (can't pull base image)
  - Docker build permissions
  - Insufficient disk space
  - Invalid Dockerfile

Command that failed:
  $CONTAINER_RUNTIME compose build
EOF
        
        print_error "Failed to build custom OpenSearch image"
        echo ""
        print_info "Build error:"
        echo "$build_error" | head -20 | sed 's/^/  /'
        exit 1
    fi
    
    echo ""
    
    # Get list of images (excluding locally built ones)
    local images=()
    if [ "$CONTAINER_RUNTIME" = "docker" ]; then
        # Get all images from compose config, excluding those with 'build' directive
        images=($(docker compose config | grep 'image:' | awk '{print $2}' | grep -v '^observability-stack-' | sort -u))
    else
        images=($(finch compose config | grep 'image:' | awk '{print $2}' | grep -v '^observability-stack-' | sort -u))
    fi
    
    local total=${#images[@]}
    local current=0
    local pulled=0
    local skipped=0
    
    # Spinner characters
    local spinner=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    
    for image in "${images[@]}"; do
        current=$((current + 1))
        
        # Calculate progress percentage
        local percent=$((current * 100 / total))
        local filled=$((percent / 5))
        local empty=$((20 - filled))
        
        # Pull with spinner
        if [ "$CONTAINER_RUNTIME" = "docker" ]; then
            docker pull "$image" >/dev/null 2>&1 &
        else
            finch pull "$image" >/dev/null 2>&1 &
        fi
        
        local pull_pid=$!
        
        # Show spinner while pulling
        local spinner_idx=0
        while kill -0 $pull_pid 2>/dev/null; do
            echo -ne "\r${DIM}[$current/$total]${RESET} ["
            printf "%${filled}s" | tr ' ' '█'
            printf "%${empty}s" | tr ' ' '░'
            echo -ne "] ${percent}% ${PURPLE}${spinner[$spinner_idx]}${RESET} ${DIM}Pulling ${image}${RESET}"
            spinner_idx=$(( (spinner_idx + 1) % ${#spinner[@]} ))
            sleep 0.1
        done
        
        # Check if pull was successful
        wait $pull_pid
        local exit_code=$?
        
        # Clear line and show result
        echo -ne "\r${DIM}[$current/$total]${RESET} ["
        printf "%${filled}s" | tr ' ' '█'
        printf "%${empty}s" | tr ' ' '░'
        echo -ne "] ${percent}%"
        
        if [ $exit_code -eq 0 ]; then
            echo -e " ${GREEN}${CHECK}${RESET} ${DIM}${image}${RESET}"
            pulled=$((pulled + 1))
        else
            # Check if image exists locally
            if [ "$CONTAINER_RUNTIME" = "docker" ]; then
                if docker image inspect "$image" >/dev/null 2>&1; then
                    echo -e " ${YELLOW}⊘${RESET} ${DIM}${image} (cached)${RESET}"
                    skipped=$((skipped + 1))
                else
                    echo -e " ${RED}${CROSS}${RESET} ${DIM}${image} (failed)${RESET}"
                    
                    # Capture the actual error from docker
                    local docker_error
                    if [ "$CONTAINER_RUNTIME" = "docker" ]; then
                        docker_error=$(docker pull "$image" 2>&1)
                    else
                        docker_error=$(finch pull "$image" 2>&1)
                    fi
                    
                    # Write error immediately to install dir
                    cat > "$INSTALL_DIR/.install_error" << EOF
Failed to pull image: $image

Docker Error:
$docker_error

This may be due to:
  - Image doesn't exist in registry (check image name and tag)
  - Network connectivity issues
  - Docker Hub rate limiting
  - Image requires authentication

Command that failed:
  $CONTAINER_RUNTIME pull $image
EOF
                    
                    print_error "Failed to pull image: $image"
                    echo ""
                    print_info "Docker says:"
                    echo "$docker_error" | head -10 | sed 's/^/  /'
                    echo ""
                    print_info "This may be due to:"
                    echo "  - Image doesn't exist in registry (check image name and tag)"
                    echo "  - Network connectivity issues"
                    echo "  - Docker Hub rate limiting"
                    echo "  - Image requires authentication"
                    echo ""
                    print_info "Command that failed: $CONTAINER_RUNTIME pull $image"
                    exit 1
                fi
            else
                if finch image inspect "$image" >/dev/null 2>&1; then
                    echo -e " ${YELLOW}⊘${RESET} ${DIM}${image} (cached)${RESET}"
                    skipped=$((skipped + 1))
                else
                    echo -e " ${RED}${CROSS}${RESET} ${DIM}${image} (failed)${RESET}"
                    print_error "Failed to pull image: $image"
                    exit 1
                fi
            fi
        fi
    done
    
    echo ""
    print_success "Images ready: $pulled pulled, $skipped cached"
}

# Start services
start_services() {
    print_step "Starting Observability Stack services..."
    echo ""
    
    cd "$INSTALL_DIR"
    
    if [ "$CONTAINER_RUNTIME" = "docker" ]; then
        docker compose up -d
    else
        finch compose up -d
    fi
    
    echo ""
    print_success "Services started"
}

# Read a single variable from a .env file, returns empty string if not found
read_env_var() {
    local key=$1
    local file=$2
    grep -E "^${key}=" "$file" 2>/dev/null | cut -d= -f2 | tr -d "'\"" || true
}

# Load connection config from .env into script-level variables
load_env_config() {
    if [ ! -f "$INSTALL_DIR/.env" ]; then
        return
    fi
    local env_file="$INSTALL_DIR/.env"
    OPENSEARCH_PROTOCOL=$(read_env_var "OPENSEARCH_PROTOCOL" "$env_file")
    OPENSEARCH_HOST=$(read_env_var "OPENSEARCH_HOST" "$env_file")
    OPENSEARCH_PORT=$(read_env_var "OPENSEARCH_PORT" "$env_file")
    OPENSEARCH_USER=$(read_env_var "OPENSEARCH_USER" "$env_file")
    OPENSEARCH_PASSWORD=$(read_env_var "OPENSEARCH_PASSWORD" "$env_file")
    OPENSEARCH_DASHBOARDS_PROTOCOL=$(read_env_var "OPENSEARCH_DASHBOARDS_PROTOCOL" "$env_file")
    OPENSEARCH_DASHBOARDS_HOST=$(read_env_var "OPENSEARCH_DASHBOARDS_HOST" "$env_file")
    OPENSEARCH_DASHBOARDS_PORT=$(read_env_var "OPENSEARCH_DASHBOARDS_PORT" "$env_file")
    # Apply defaults
    OPENSEARCH_PROTOCOL="${OPENSEARCH_PROTOCOL:-https}"
    OPENSEARCH_PORT="${OPENSEARCH_PORT:-9200}"
    # If host is the internal Docker service name, use localhost for external access
    if [ "${OPENSEARCH_HOST:-opensearch}" = "opensearch" ]; then
        OPENSEARCH_HOST="localhost"
    fi
    OPENSEARCH_DASHBOARDS_PROTOCOL="${OPENSEARCH_DASHBOARDS_PROTOCOL:-http}"
    OPENSEARCH_DASHBOARDS_PORT="${OPENSEARCH_DASHBOARDS_PORT:-5601}"
    # If host is the internal Docker service name, use localhost for external access
    if [ "${OPENSEARCH_DASHBOARDS_HOST:-opensearch-dashboards}" = "opensearch-dashboards" ]; then
        OPENSEARCH_DASHBOARDS_HOST="localhost"
    fi
}

wait_for_services() {
    print_step "Waiting for services to be ready..."
    echo ""

    cd "$INSTALL_DIR"

    local max_wait=180
    local elapsed=0
    local check_interval=5

    # Check OpenSearch
    echo -ne "${DIM}Waiting for OpenSearch...${RESET}"
    while [ $elapsed -lt $max_wait ]; do
        if curl -s -k -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" "${OPENSEARCH_PROTOCOL}://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}/_cluster/health" >/dev/null 2>&1; then
            echo -e " ${GREEN}${CHECK}${RESET}"
            break
        fi
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
        echo -ne "."
    done

    if [ $elapsed -ge $max_wait ]; then
        echo -e " ${YELLOW}timeout${RESET}"
        print_warning "OpenSearch may still be starting. Check logs with: $CONTAINER_RUNTIME compose logs opensearch"
    fi

    # Check OpenSearch Dashboards
    echo -ne "${DIM}Waiting for OpenSearch Dashboards...${RESET}"
    elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        if curl -s -k -f -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" "${OPENSEARCH_DASHBOARDS_PROTOCOL}://${OPENSEARCH_DASHBOARDS_HOST}:${OPENSEARCH_DASHBOARDS_PORT}/api/status" >/dev/null 2>&1; then
            echo -e " ${GREEN}${CHECK}${RESET}"
            break
        fi
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
        echo -ne "."
    done
    
    if [ $elapsed -ge $max_wait ]; then
        echo -e " ${YELLOW}timeout${RESET}"
        print_warning "Dashboards may still be starting. Check logs with: $CONTAINER_RUNTIME compose logs opensearch-dashboards"
    fi
    
    echo ""
    print_success "Services are ready"
}

# Print summary
print_summary() {
    echo ""
    echo -e "  ${GREEN}${BOLD}${STAR} Observability Stack Install Complete! ${STAR}${RESET}"
    echo ""

    echo -e "${GREEN}${ARROW}${RESET} ${BOLD}UI:${RESET}        OpenSearch Dashboards  ${BOLD}${OPENSEARCH_DASHBOARDS_PROTOCOL}://${OPENSEARCH_DASHBOARDS_HOST}:${OPENSEARCH_DASHBOARDS_PORT}${RESET}"
    echo -e "           ${DIM}Username: ${RESET}${BOLD}$OPENSEARCH_USER${RESET}  ${DIM}Password: ${RESET}${BOLD}$OPENSEARCH_PASSWORD${RESET}"
    echo ""

    if [[ "$INCLUDE_OTEL_DEMO" =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}${ARROW}${RESET} ${BOLD}OTel Demo:${RESET}"
        echo -e "  ${DIM}${ARROW} Web Store:             http://localhost:8080/${RESET}"
        echo -e "  ${DIM}${ARROW} Load Generator UI:     http://localhost:8080/loadgen/${RESET}"
        echo -e "  ${DIM}${ARROW} Feature Flags UI:      http://localhost:8080/feature${RESET}"
        echo ""
    fi

    echo -e "${DIM}Other Services:${RESET}"
    echo -e "  ${DIM}${ARROW} Prometheus:            http://localhost:9090${RESET}"
    echo -e "  ${DIM}${ARROW} OpenSearch API:        ${OPENSEARCH_PROTOCOL}://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}${RESET}"

    if [[ "$INCLUDE_EXAMPLES" =~ ^[Yy]$ ]]; then
        echo -e "  ${DIM}${ARROW} Weather Agent:         http://localhost:8000${RESET}"
        echo -e "  ${DIM}${ARROW} Travel Planner:        http://localhost:8003${RESET}"
    fi

    echo ""
    echo -e "${BOLD}Useful Commands:${RESET}"
    echo -e "  ${DIM}# View logs${RESET}"
    echo -e "  ${BOLD}cd $INSTALL_DIR && $CONTAINER_RUNTIME compose logs -f${RESET}"
    echo ""
    echo -e "  ${DIM}# Stop services${RESET}"
    echo -e "  ${BOLD}cd $INSTALL_DIR && $CONTAINER_RUNTIME compose down${RESET}"
    echo ""
    echo -e "  ${DIM}# Stop and remove data${RESET}"
    echo -e "  ${BOLD}cd $INSTALL_DIR && $CONTAINER_RUNTIME compose down -v${RESET}"

    echo ""
    echo -e "${PURPLE}${BOLD}Send Telemetry:${RESET}"
    echo -e "  ${BOLD}OTLP gRPC${RESET}  ${ARROW} localhost:4317  ${DIM}(OpenTelemetry SDK default)${RESET}"
    echo -e "  ${BOLD}OTLP HTTP${RESET}  ${ARROW} localhost:4318  ${DIM}(Strands SDK, HTTP-based exporters)${RESET}"
    echo ""
    echo -e "  ${DIM}# Set environment variables for your application:${RESET}"
    echo -e "  ${BOLD}export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317${RESET}  ${DIM}# gRPC (most SDKs)${RESET}"
    echo -e "  ${BOLD}export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318${RESET}  ${DIM}# HTTP/protobuf${RESET}"

    echo ""
    echo -e "${PURPLE}${BOLD}Next Steps:${RESET}"
    echo -e "  1. Visit ${PURPLE}${OPENSEARCH_DASHBOARDS_PROTOCOL}://${OPENSEARCH_DASHBOARDS_HOST}:${OPENSEARCH_DASHBOARDS_PORT}${RESET} to explore your data"
    echo -e "  2. Learn more at ${PURPLE}https://opensearch.org/platform/observability/${RESET}"

    echo ""
    echo -e "${DIM}For support, visit: https://github.com/opensearch-project/observability-stack${RESET}"
    echo ""
}

# Run simulated installer (preview output without installing)
run_simulated_installer() {
    OPENSEARCH_USER="admin"
    OPENSEARCH_PASSWORD="My_password_123!@#"
    INCLUDE_EXAMPLES="Y"
    INCLUDE_OTEL_DEMO="Y"
    INSTALL_DIR="observability-stack"
    CONTAINER_RUNTIME="docker"

    print_step "Checking system requirements..."
    sleep 0.5
    print_success "Git installed: git version 2.39.0"
    sleep 0.3
    print_success "Container runtime: docker"
    sleep 0.3
    print_success "Docker Compose: v2.23.0"
    sleep 0.3
    print_success "Available memory: 16GB"
    sleep 0.5

    echo ""
    print_step "Configuration"
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
    print_step "Cloning Observability Stack repository..."
    sleep 1
    print_success "Repository cloned to observability-stack"
    sleep 0.5

    echo ""
    print_step "Configuring environment..."
    sleep 0.5
    print_info "Example services enabled"
    sleep 0.3
    print_success "Environment configured"
    sleep 0.5

    echo ""
    print_step "Building and pulling container images..."
    echo ""
    sleep 0.5

    # Demo image list
    local images=(
        "opensearchproject/opensearch:3.5.0"
        "opensearchproject/opensearch-dashboards:3.5.0"
        "otel/opentelemetry-collector-contrib:0.143.0"
        "opensearchproject/data-prepper:2.13.0"
        "prom/prometheus:v3.8.1"
        "python:3.11-slim"
    )

    local spinner=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

    for i in "${!images[@]}"; do
        local num=$((i + 1))
        local total=${#images[@]}
        local percent=$((num * 100 / total))
        local filled=$((percent / 5))
        local empty=$((20 - filled))

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
    print_success "Images ready: 6 pulled, 0 cached"
    sleep 0.5

    echo ""
    print_step "Starting Observability Stack services..."
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
    print_success "Services started"
    sleep 0.5

    echo ""
    print_step "Waiting for services to be ready..."
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
    print_success "Services are ready"
    sleep 1

    print_summary
}

# Main installation flow
main() {
    print_header
    
    echo -e "${PURPLE}${BOLD}Starting installation...${RESET}\n"

    if [ "$SIMULATE_MODE" = true ]; then
        run_simulated_installer
    else
        run_manual_installer
    fi
}

# Run manual installer
run_manual_installer() {
    check_requirements
    configure_installation
    clone_repository
    configure_environment
    load_env_config
    pull_images
    start_services
    wait_for_services
    print_summary
}

# Run main function
main
