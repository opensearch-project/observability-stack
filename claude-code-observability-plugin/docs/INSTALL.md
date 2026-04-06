# Installation Guide

## Prerequisites

1. **Claude Code CLI** — Install from [claude.ai/claude-code](https://claude.ai/claude-code)
2. **Running Observability Stack** — The plugin queries a local OpenSearch + Prometheus stack

### Start the Observability Stack

```bash
git clone https://github.com/opensearch-project/observability-stack.git
cd observability-stack
docker compose up -d
```

Verify services are running:

```bash
# OpenSearch (should return cluster health JSON)
curl -sk -u 'admin:My_password_123!@#' https://localhost:9200/_cluster/health?pretty

# Prometheus (should return "Prometheus Server is Healthy.")
curl -s http://localhost:9090/-/healthy
```

## Install the Plugin

From the `observability-stack` repository root:

```bash
claude plugin marketplace add ./
claude plugin install observability
```

Or install directly from GitHub:

```bash
claude plugin marketplace add https://github.com/opensearch-project/observability-stack
claude plugin install observability
```

## Verify Installation

Start Claude Code and try a query:

```
claude
> Show me the top 10 services by trace span count
```

Claude should execute a PPL query against OpenSearch and return results. You can also try:

```
> Check the health of the observability stack
> Show me error logs from the last hour
> What is the p95 latency for all services?
```

## Configuration

### Default Endpoints

| Service | Endpoint | Auth |
|---|---|---|
| OpenSearch | `https://localhost:9200` | `admin` / `My_password_123!@#` (HTTPS, `-k` flag) |
| Prometheus | `http://localhost:9090` | None |

### Custom Endpoints

Override defaults with environment variables:

```bash
export OPENSEARCH_ENDPOINT=https://my-opensearch:9200
export PROMETHEUS_ENDPOINT=http://my-prometheus:9090
```

### AWS Managed Services

The plugin supports Amazon OpenSearch Service and Amazon Managed Service for Prometheus. Queries use AWS SigV4 authentication instead of basic auth. See the skill files for AWS-specific curl examples.

## Available Skills

| Skill | Description |
|---|---|
| `traces` | Query trace spans — agent invocations, tool executions, latency, errors |
| `logs` | Search and analyze logs — severity filtering, body search, error patterns |
| `metrics` | Query Prometheus metrics — HTTP rates, latency percentiles, GenAI tokens |
| `stack-health` | Check component health, verify data ingestion, troubleshoot issues |
| `ppl-reference` | Comprehensive PPL syntax reference with observability examples |
| `correlation` | Cross-signal correlation between traces, logs, and metrics |
| `apm-red` | RED metrics (Rate, Errors, Duration) for service monitoring |
| `slo-sli` | SLO/SLI definitions, error budgets, and burn rate alerting |

## Running Tests

```bash
cd claude-code-observability-plugin/tests
pip install -r requirements.txt

# All tests (requires running stack)
pytest -v

# Property tests only (no stack needed)
pytest test_properties.py -v

# Filter by skill
pytest -m traces
pytest -m logs
pytest -m metrics
```

## Troubleshooting

### "Observability stack is not running"

Tests and skills require OpenSearch and Prometheus to be running locally. Start them with:

```bash
docker compose up -d opensearch prometheus
```

### OpenSearch returns "Unauthorized"

Check the password in `.env` matches what you're using. Default: `My_password_123!@#`

### No trace/log data

The observability stack includes example services (canary, weather-agent, travel-planner) that generate telemetry data automatically. Ensure they're running:

```bash
docker compose ps | grep -E "canary|weather|travel"
```

If not running, check that `INCLUDE_COMPOSE_EXAMPLES=docker-compose.examples.yml` is set in `.env`.

### Prometheus OOM / crash-looping

If Prometheus is crash-looping (exit code 137), its WAL may be corrupted. Clear the volume and restart:

```bash
docker compose stop prometheus
docker compose rm -f prometheus
docker volume rm observability-stack_prometheus-data
docker compose up -d prometheus
```

## Index Reference

| Signal | Index Pattern | Key Fields |
|---|---|---|
| Traces | `otel-v1-apm-span-*` | `traceId`, `spanId`, `serviceName`, `name`, `durationInNanos`, `status.code` |
| Logs | `logs-otel-v1-*` | `traceId`, `spanId`, `severityText`, `body`, `resource.attributes.service.name` |
| Service Maps | `otel-v2-apm-service-map-*` | `sourceNode`, `targetNode`, `sourceOperation`, `targetOperation` |
