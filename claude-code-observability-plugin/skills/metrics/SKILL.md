---
name: metrics
description: Query metrics from Prometheus using PromQL for HTTP request rates, latency percentiles, error rates, active connections, and GenAI token usage.
allowed-tools:
  - Bash
  - curl
---

# Metrics Querying with PromQL

## Overview

This skill provides PromQL query templates for querying metrics from Prometheus. All queries use the Prometheus HTTP API at `http://localhost:9090/api/v1/query`. No authentication is needed for local Prometheus.

Prometheus runs on port 9090 using HTTP (not HTTPS).

## Connection Defaults

| Variable | Default | Description |
|---|---|---|
| `PROMETHEUS_ENDPOINT` | `http://localhost:9090` | Prometheus base URL |

## HTTP Request Rate by Service

Calculate the per-second HTTP request rate over a 5-minute window, grouped by service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

## HTTP Latency Percentiles

### p95 Latency by Service

Calculate the 95th percentile HTTP request latency by service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))'
```

### p99 Latency by Service

Calculate the 99th percentile HTTP request latency by service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.99, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))'
```

## Error Rate (5xx Responses)

Calculate the ratio of 5xx error responses to total requests by service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name) / sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

## Active Connections

Query the current number of active HTTP connections by service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(http_server_active_requests) by (service_name)'
```

## Database Operation Latency

### DB Operation p95 Latency by Service

Calculate the 95th percentile database operation latency by service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(db_client_operation_duration_seconds_bucket[5m])) by (le, service_name))'
```

## GenAI-Specific Metrics

### Token Usage by Operation and Model

Query GenAI token usage histograms grouped by operation name and request model:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(gen_ai_client_token_usage_bucket[5m])) by (le, gen_ai_operation_name, gen_ai_request_model)'
```

Token usage p95 by operation and model:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(gen_ai_client_token_usage_bucket[5m])) by (le, gen_ai_operation_name, gen_ai_request_model))'
```

### Operation Duration by Operation and Model

Query GenAI operation duration histograms grouped by operation and model:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(gen_ai_client_operation_duration_bucket[5m])) by (le, gen_ai_operation_name, gen_ai_request_model)'
```

Operation duration p95 by operation and model:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(gen_ai_client_operation_duration_bucket[5m])) by (le, gen_ai_operation_name, gen_ai_request_model))'
```

## Available Metric Names and Label Dimensions

| Metric | Type | Labels |
|---|---|---|
| `http_server_duration_seconds` | histogram | `service_name`, `http_response_status_code` |
| `http_server_active_requests` | gauge | `service_name` |
| `db_client_operation_duration_seconds` | histogram | `service_name` |
| `gen_ai_client_token_usage` | histogram | `gen_ai.operation.name`, `gen_ai.request.model` |
| `gen_ai_client_operation_duration` | histogram | `gen_ai.operation.name`, `gen_ai.request.model` |
| `app_frontend_requests_total` | counter | — |
| `app_payment_transactions_total` | counter | — |

> **Note on Prometheus label names:** Prometheus replaces dots in label names with underscores. The OTel attribute `gen_ai.operation.name` becomes the Prometheus label `gen_ai_operation_name` in PromQL queries. The table above shows the original OTel attribute names for reference.

## PPL Alternative for OpenSearch-Ingested Metrics

PPL can also query metrics stored in OpenSearch when metrics are ingested via Data Prepper, as an alternative to PromQL. This is useful for OpenSearch-native workflows where you want to query metrics alongside traces and logs using a single query language. When Data Prepper is configured to ingest metrics into OpenSearch, you can use PPL `source=` queries against the metrics index just as you would for traces and logs.

## References

- [PPL Language Reference](https://github.com/opensearch-project/sql/blob/main/docs/user/ppl/index.md) — Official PPL syntax documentation. Fetch this if queries fail due to OpenSearch version differences or new syntax.
- [Prometheus Querying Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/) — PromQL syntax reference.

## AWS Managed Service for Prometheus

To query metrics on Amazon Managed Service for Prometheus (AMP), replace the local endpoint and add AWS SigV4 authentication:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:aps" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  'https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

- Endpoint format: `https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query`
- Auth: `--aws-sigv4 "aws:amz:REGION:aps"` with `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"`
- PromQL query syntax is identical between local Prometheus and Amazon Managed Prometheus; only the endpoint and authentication differ
