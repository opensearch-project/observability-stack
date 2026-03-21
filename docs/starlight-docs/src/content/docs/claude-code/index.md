---
title: Claude Code
description: Give Claude observability skills for querying traces, logs, and metrics from your OpenSearch stack
---

The Claude Code Observability Plugin teaches Claude how to query and investigate traces, logs, and metrics from your OpenSearch-based observability stack. It provides eight skill files containing PPL query templates for OpenSearch, PromQL query templates for Prometheus, and ready-to-execute curl commands.

The plugin follows the open [Agent Skills](https://agentskills.io/) specification, so the same skill files work across Claude Code (CLI), Claude for VS Code, and Claude Desktop.

## What the plugin provides

| Skill | What it does |
|---|---|
| **Traces** | PPL queries for agent invocations, tool executions, slow spans, error spans, token usage, service maps, remote service identification |
| **Logs** | PPL queries for severity filtering, trace correlation, error patterns, log volume, full-text search |
| **Metrics** | PromQL queries for HTTP rates, latency percentiles, error rates, GenAI metrics |
| **Stack Health** | Health checks, troubleshooting, port reference, diagnostic commands |
| **PPL Reference** | 50+ PPL commands with syntax, examples, and function reference |
| **Correlation** | Cross-signal workflows linking traces, logs, and metrics with batch correlation and `coalesce()` patterns |
| **APM RED** | Rate/Errors/Duration methodology queries with safe division, `topk()`, and availability patterns |
| **SLO/SLI** | SLI definitions, recording rules, error budgets, burn rate alerts |

## Prerequisites

- A running [Observability Stack](/docs/get-started/installation/) (or any OpenSearch + Prometheus setup)
- One of: Claude Code CLI, Claude for VS Code, or Claude Desktop

## Installation

### Claude Code (CLI and VS Code extension)

First, add the repository as a plugin marketplace:

```
/plugin marketplace add https://github.com/opensearch-project/observability-stack.git
```

Then install the plugin:

```
/plugin install observability@observability
```

All eight skills are registered and Claude automatically routes to the right one based on your question.

Verify the skills loaded:

```
/skills
```

### Claude Desktop

Claude Desktop supports custom skills through **Settings → Capabilities → Skills**. Each skill must be uploaded as a separate ZIP file.

Pre-built ZIP files are attached to each [GitHub release](https://github.com/opensearch-project/observability-stack/releases) — one per skill:

| ZIP file | Skill |
|---|---|
| `traces.zip` | Trace querying and investigation |
| `logs.zip` | Log searching and correlation |
| `metrics.zip` | PromQL metrics queries |
| `stack-health.zip` | Health checks and troubleshooting |
| `ppl-reference.zip` | PPL syntax reference |
| `correlation.zip` | Cross-signal correlation |
| `apm-red.zip` | RED methodology metrics |
| `slo-sli.zip` | SLO/SLI definitions and alerts |

To install:

1. Download or clone the repository:
   ```bash
   git clone https://github.com/opensearch-project/observability-stack.git
   ```

2. In Claude Desktop, go to **Settings → Capabilities → Skills**

3. Click **Add** and upload each ZIP file from `claude-code-observability-plugin/dist/`

4. Enable each skill after uploading

:::note
Claude Desktop requires one ZIP per skill — you cannot bundle all skills into a single ZIP. Upload all eight for the full observability experience.
:::

## Try it out

Once installed, start asking questions:

```
Show me the slowest traces from the last hour
```

```
What's the error rate across services?
```

```
Check if the observability stack is healthy
```

```
Calculate the error budget for a 99.9% availability SLO
```

See the [Usage Guide](/docs/claude-code/usage/) for 50+ sample questions across all eight skills.

## Configuration

### Default endpoints

The plugin defaults to the local Observability Stack:

| Service | Endpoint | Auth |
|---|---|---|
| OpenSearch | `https://localhost:9200` | Basic auth (`admin` / `My_password_123!@#`), skip TLS verify |
| Prometheus | `http://localhost:9090` | None |

### Custom endpoints

Set environment variables to override defaults:

```bash
export OPENSEARCH_ENDPOINT=https://your-opensearch-host:9200
export PROMETHEUS_ENDPOINT=http://your-prometheus-host:9090
```

### AWS managed services

The skill files include AWS SigV4 variants for Amazon OpenSearch Service and Amazon Managed Service for Prometheus. When using managed services, the query syntax stays the same — only the endpoint URL and authentication method change.

## Index patterns

The plugin queries these OpenSearch indices:

| Signal | Index Pattern | Key Fields |
|---|---|---|
| Traces | `otel-v1-apm-span-*` | `traceId`, `spanId`, `serviceName`, `name`, `durationInNanos`, `status.code`, `attributes.gen_ai.*` |
| Logs | `logs-otel-v1-*` | `traceId`, `spanId`, `severityText`, `body`, `resource.attributes.service.name`, `@timestamp` |
| Service Maps | `otel-v2-apm-service-map-*` | `sourceNode`, `targetNode`, `sourceOperation`, `targetOperation` |

:::note
The log index uses `resource.attributes.service.name` (backtick-quoted in PPL as `` `resource.attributes.service.name` ``) instead of the top-level `serviceName` field found in the trace span index.
:::

## Running the tests

The plugin includes a test suite to validate skill file correctness:

```bash
cd claude-code-observability-plugin/tests
pip install -r requirements.txt

# Property tests (no running stack needed)
pytest test_properties.py -v

# Integration tests (requires running stack)
pytest -v
```

## Troubleshooting

### "Observability stack is not running"

Tests and skills require OpenSearch and Prometheus to be running locally:

```bash
docker compose up -d opensearch prometheus
```

### OpenSearch returns "Unauthorized"

Check the password in `.env` matches the default: `My_password_123!@#`

### No trace or log data

The stack includes example services that generate telemetry automatically. Verify they're running:

```bash
docker compose ps | grep -E "canary|weather|travel"
```

### Prometheus crash-looping (exit code 137)

Clear the corrupted WAL data:

```bash
docker compose stop prometheus
docker compose rm -f prometheus
docker volume rm observability-stack_prometheus-data
docker compose up -d prometheus
```

## Related links

- [Usage Guide](/docs/claude-code/usage/) — 50+ sample questions with real examples
- [MCP Server](/docs/mcp/) — query OpenSearch via Model Context Protocol
- [Investigate Traces](/docs/investigate/discover-traces/) — explore traces in OpenSearch Dashboards
- [Investigate Logs](/docs/investigate/discover-logs/) — explore logs in OpenSearch Dashboards
- [Send Data](/docs/send-data/) — instrument your applications with OpenTelemetry
