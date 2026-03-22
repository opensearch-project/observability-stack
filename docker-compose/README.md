# Observability Stack Docker Compose Deployment

This directory contains the Docker Compose configuration for running the Observability Stack locally.

## Directory Structure

```
docker-compose/
├── docker-compose.yml              # Main orchestration file - defines core services
├── docker-compose.examples.yml     # Example services (included via .env)
├── .env                            # Environment variables (versions, ports, credentials)
├── otel-collector/                 # OpenTelemetry Collector configuration
│   └── config.yaml
├── data-prepper/                   # Data Prepper configuration
│   ├── pipelines.template.yaml
│   └── data-prepper-config.yaml
├── prometheus/                     # Prometheus configuration
│   └── prometheus.yml
├── opensearch-dashboards/          # OpenSearch Dashboards configuration
│   └── opensearch_dashboards.template.yml
└── canary/                         # Canary service (optional example)
    ├── Dockerfile
    └── canary.py
```

The main `docker-compose.yml` file is located in the repository root and references configuration files from this directory's subdirectories. The `docker-compose.examples.yml` file contains example services (weather-agent, canary) and is included via the `INCLUDE_COMPOSE_FILES` variable in `.env`. Each service has its own subdirectory containing its specific configuration files. OpenSearch uses default configuration with environment variables set in docker-compose.yml.

## Quick Start

**Note**: The `.env` file in the repository root contains all configurable parameters including component versions, ports, credentials, and resource limits. You can customize these values before starting the stack.

By default, the stack includes example services (weather-agent and canary) via `INCLUDE_COMPOSE_EXAMPLES=docker-compose.examples.yml` in `.env`. To run only the core stack, comment out this line.

**macOS users**: If you're using Finch instead of Docker, replace `docker compose` with `finch compose` in all commands below.

1. **Start the stack:**
   ```bash
   docker compose up -d
   ```

   This starts all services including examples.

2. **To run only the core stack without examples:**
   
   Edit `.env` and comment out the `INCLUDE_COMPOSE_FILES` line:
   ```env
   # INCLUDE_COMPOSE_EXAMPLES=docker-compose.examples.yml
   ```
   
   Then start the stack:
   ```bash
   docker compose up -d
   ```

2. **Verify services are running:**
   ```bash
   docker-compose ps
   ```

3. **Access the UIs:**
   - OpenSearch Dashboards: http://localhost:5601
   - Prometheus: http://localhost:9090
   - OpenSearch API: http://localhost:9200
   - Travel Planner API (multi-agent): http://localhost:8003
   - Weather Agent API: http://localhost:8000

4. **View telemetry data:**
   
   - View canary logs: `docker-compose logs -f canary`
   - See metrics in Prometheus: http://localhost:9090 (query: `gen_ai_client_token_usage_total`)
   - See traces in OpenSearch Dashboards: http://localhost:5601 (Observability → Trace Analytics)
   
   **Or send your own test data:**
   Configure your agent application to send OTLP data to:
   - gRPC: `http://localhost:4317`
   - HTTP: `http://localhost:4318`

5. **Stop the stack:**
   ```bash
   docker-compose down
   ```

6. **Stop and remove data:**
   ```bash
   docker-compose down -v
   ```

## Development

When making changes to example services or other components, rebuild and restart with:

```bash
docker compose up -d --build
```

This rebuilds any modified containers and restarts them with the new changes.

## Services

### Core Services

- **otel-collector**: Receives OTLP telemetry data (ports 4317, 4318, 8888)
- **data-prepper**: Processes logs and traces before OpenSearch ingestion (ports 21890, 21892)
- **prometheus**: Stores metrics with OTLP receiver enabled (port 9090)
- **opensearch-dashboards-init**: One-time initialization service that creates workspace, index patterns, and saved queries

### Optional Services (local mode)

Included by default via `.env`. Comment out the corresponding `INCLUDE_COMPOSE_*` variable to use a cloud-hosted instance instead.

- **opensearch**: Stores logs and traces with security enabled (port 9200, 9600). Controlled by `INCLUDE_COMPOSE_LOCAL_OPENSEARCH`.
  - Default credentials: admin/My_password_123!@# (configured in .env file)
- **opensearch-dashboards**: Visualization UI (port 5601). Controlled by `INCLUDE_COMPOSE_LOCAL_OPENSEARCH_DASHBOARDS`.

### Example Services

These services demonstrate how to instrument agent applications and generate test telemetry:

- **travel-planner**: Multi-agent orchestrator that fans out to weather and events agents (port 8003)
  - Demonstrates trace context propagation across services
  - Fault injection at orchestrator and sub-agent levels
  - Graceful degradation on partial failures
- **weather-agent**: Example FastAPI server with OpenTelemetry instrumentation (port 8000)
  - Three tools: current weather, forecast, historical
  - Full Gen-AI semantic convention coverage
  - Fault injection API for debugging scenarios
- **events-agent**: Local events lookup agent (port 8002)
  - Returns events for destination cities
  - Supports fault injection
- **canary**: Periodic test client that invokes travel-planner (no exposed ports)
  - Generates synthetic multi-agent traffic with fault injection
  - Configurable fault distribution (50% normal, 50% various faults)
  - Validates the observability pipeline end-to-end

## Configuration Files

All configuration files are organized by service in subdirectories:

- **.env**: Environment variables for versions, ports, credentials, and resource limits (in repository root)
  - `INCLUDE_COMPOSE_EXAMPLES`: Controls whether example services are included (default: `docker-compose.examples.yml`)
  - `INCLUDE_COMPOSE_LOCAL_OPENSEARCH`: Controls whether local OpenSearch is included (default: `docker-compose.local-opensearch.yml`)
  - `INCLUDE_COMPOSE_LOCAL_OPENSEARCH_DASHBOARDS`: Controls whether local OpenSearch Dashboards is included (default: `docker-compose.local-opensearch-dashboards.yml`)
- **docker-compose.yml**: Main service definitions for core observability stack (in repository root)
- **docker-compose.examples.yml**: Example services (weather-agent, canary) included via .env (in repository root)
- **otel-collector/config.yaml**: OpenTelemetry Collector receivers, processors, and exporters
- **data-prepper/pipelines.template.yaml**: Data transformation pipeline template for logs and traces (credentials injected at container startup)
- **data-prepper/data-prepper-config.yaml**: Data Prepper server settings
- **prometheus/prometheus.yml**: Prometheus scrape targets and storage configuration
- **opensearch-dashboards/opensearch_dashboards.template.yml**: Dashboard UI settings template (OpenSearch host is injected at container startup)

OpenSearch uses default configuration with settings provided via environment variables in docker-compose.yml.

### Managing Example Services

The example services (weather-agent and canary) are defined in `docker-compose.examples.yml` and included via the `.env` file:

```env
INCLUDE_COMPOSE_EXAMPLES=docker-compose.examples.yml
```

**To disable example services:**
1. Edit `.env` and comment out the line:
   ```env
   # INCLUDE_COMPOSE_EXAMPLES=docker-compose.examples.yml
   ```
2. Restart the stack:
   ```bash
   docker compose down
   docker compose up -d
   ```

**To re-enable example services:**
1. Uncomment the line in `.env`
2. Restart the stack

### Customizing Configuration

**To change versions, ports, or credentials**: Edit the `.env` file in the repository root and restart services:
```bash
docker-compose down
docker compose up -d
```

**To modify service behavior**: Edit the configuration file in its respective subdirectory and restart the service:
```bash
docker-compose restart <service-name>
```

**To customize example services**: Edit the `.env` file:
- `WEATHER_AGENT_PORT`: Port for weather-agent API (default: 8000)
- `CANARY_INTERVAL`: Seconds between canary invocations (default: 30)
- `FAULT_WEIGHTS`: JSON object controlling fault injection distribution
- `WEATHER_AGENT_MEMORY_LIMIT`: Memory limit for weather-agent (default: 200M)
- `CANARY_MEMORY_LIMIT`: Memory limit for canary (default: 100M)

**To modify weather-agent or canary code**: After editing code in `examples/plain-agents/weather-agent/` or `docker-compose/canary/canary.py`:
```bash
# Rebuild the service with no cache
docker compose build --no-cache example-weather-agent
# Or for canary
docker compose build --no-cache example-canary

# Restart the service
docker compose up -d example-weather-agent
# Or rebuild and restart in one command
docker compose up -d --build example-weather-agent example-canary
```

The docker-compose.yml file mounts these configurations into the containers.

## Data Retention

- **Logs and Traces**: Managed by OpenSearch index lifecycle policies (default: unlimited in development)
- **Metrics**: 15 days (configured in Prometheus)

Adjust retention periods by modifying the respective configuration files or OpenSearch index settings.

## Resource Requirements

**Minimum:**
- 4GB RAM
- 10GB disk space

**Recommended:**
- 8GB RAM
- 20GB disk space

## Troubleshooting

**Services won't start:**
```bash
docker-compose logs <service-name>
```

**Check OpenSearch health:**
```bash
curl https://localhost:9200/_cluster/health?pretty
```

**Check if data is being ingested:**
```bash
curl https://localhost:9200/_cat/indices?v
```

**Reset everything:**
```bash
docker-compose down -v
docker compose up -d
```

## Using a Cloud OpenSearch Cluster

By default the stack runs a local OpenSearch node and OpenSearch Dashboards container. You can replace either or both with a cloud-hosted cluster.

### Switch to cloud OpenSearch (keep local Dashboards)

1. Comment out the local OpenSearch include in `.env`:
   ```env
   # INCLUDE_COMPOSE_LOCAL_OPENSEARCH=docker-compose.local-opensearch.yml
   ```

2. Point to your cloud cluster in `.env`:
   ```env
   OPENSEARCH_HOST=your-cluster.example.com
   OPENSEARCH_PORT=9200
   OPENSEARCH_PROTOCOL=https
   OPENSEARCH_USER=admin
   OPENSEARCH_PASSWORD=your-password
   ```

3. Restart the stack:
   ```bash
   docker compose down
   docker compose up -d
   ```

The local `opensearch-dashboards` container will connect to the cloud cluster. Its `opensearch.hosts` is injected at startup from the environment variables above via template substitution.

### Switch to cloud OpenSearch Dashboards

If your cloud provider also hosts a Dashboards instance, comment out the local Dashboards include as well:

```env
# INCLUDE_COMPOSE_LOCAL_OPENSEARCH_DASHBOARDS=docker-compose.local-opensearch-dashboards.yml
```

Then access your cloud Dashboards URL directly — no local container needed.

### Caveats

- **TLS**: Ensure `OPENSEARCH_PROTOCOL=https` matches your cluster's actual scheme. Some clusters behind a load balancer may use `http`.
- **Authentication**: Cloud clusters may require different auth mechanisms (API keys, IAM). Update `OPENSEARCH_USER` and `OPENSEARCH_PASSWORD` accordingly.
- **Network reachability**: The `otel-collector` and `data-prepper` containers must be able to reach `OPENSEARCH_HOST:OPENSEARCH_PORT` from inside Docker. If your cluster is VPC-restricted, ensure the host machine has the necessary network access.
- **Certificate verification**: This project disables TLS certificate verification everywhere HTTPS is used — this applies to all components:
  - **Data Prepper** → OpenSearch: `insecure: true` in `pipelines.template.yaml`
  - **OpenSearch Dashboards** → OpenSearch: `opensearch.ssl.verificationMode: none` in `opensearch_dashboards.template.yml`
  - **Init script** → OpenSearch Dashboards: `verify=False` in `init-opensearch-dashboards.py`
  - **install.sh health checks**: `curl -k` for both OpenSearch and OpenSearch Dashboards

  For production environments with valid certificates, enable verification in each of these places.

## Security Warning

⚠️ **This configuration is for development only!**

Security considerations:
- OpenSearch has security enabled with default credentials (admin/admin)
- SSL certificate verification is disabled for development ease
- Permissive CORS settings
- No network isolation between services

For production use:
- Change default passwords
- Enable proper SSL/TLS with valid certificates
- Configure proper authentication and authorization
- Implement network policies
- Review and harden all security settings

Never use this configuration in production without proper hardening.

## Next Steps

- See the main README.md for instrumentation examples
- Check the examples/ directory for code samples
- Visit OpenSearch Dashboards to create visualizations
- Configure your agent applications to send OTLP data
