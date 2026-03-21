---
name: apm-red
description: APM RED metrics (Rate, Errors, Duration) for service-level monitoring using PromQL and PPL queries.
allowed-tools:
  - Bash
  - curl
---

# APM RED Metrics

## Overview

This skill provides query templates for the RED methodology — the three golden signals for service-level monitoring:

| Signal | What it measures | Key question |
|---|---|---|
| **Rate** | Requests per second | How much traffic is the service handling? |
| **Errors** | Failed requests as a ratio of total | What percentage of requests are failing? |
| **Duration** | Latency distribution (p50, p95, p99) | How long do requests take? |

RED metrics give you a complete picture of service health at a glance. Every service should be monitored on all three signals. This skill covers both PromQL queries against Prometheus and PPL queries against OpenSearch trace spans as an alternative.

All Prometheus queries use the HTTP API at `http://localhost:9090/api/v1/query`. All OpenSearch queries use the PPL API at `https://localhost:9200/_plugins/_ppl` with HTTPS and basic authentication. Credentials are read from the `.env` file (default: `admin` / `My_password_123!@#`).


## Rate Queries

### Per-Service Request Rate (PromQL)

Calculate the per-second HTTP request rate over a 5-minute window, grouped by service:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

### Per-Endpoint Request Rate (PromQL)

Break down request rate by service and HTTP route to identify hot endpoints:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count[5m])) by (service_name, http_route)'
```

### Request Rate from Trace Spans (PPL)

Calculate request rate from trace spans as an alternative to PromQL. This counts spans per 5-minute bucket grouped by service:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as request_count by span(startTime, 5m), serviceName"}'
```


## Error Queries

### Error Rate Ratio (PromQL)

Calculate the ratio of 5xx error responses to total requests by service. A value of 0.01 means 1% of requests are failing:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name) / sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

### Error Count (PromQL)

Calculate the per-second rate of 5xx errors by service (useful for alerting on absolute error volume):

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name)'
```

### Error Count from Trace Spans (PPL)

Count error spans (status code 2 = Error in OTel) grouped by service:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `status.code` = 2 | stats count() as error_count by serviceName"}'
```


## Duration Queries

### Latency Percentiles (PromQL)

#### p50 (Median) Latency by Service

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.50, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))'
```

#### p95 Latency by Service

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))'
```

#### p99 Latency by Service

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.99, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))'
```

### Latency Percentiles from Trace Spans (PPL)

Calculate p50, p95, and p99 latency directly from trace span durations. Values are in nanoseconds — divide by 1,000,000 for milliseconds:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats percentile(durationInNanos, 50) as p50, percentile(durationInNanos, 95) as p95, percentile(durationInNanos, 99) as p99 by serviceName"}'
```


## Combined RED Dashboard

Run all three RED signals for every service in a single investigation. Execute these queries together to get a complete service health snapshot.

### Rate — Requests per second by service:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

### Errors — Error ratio by service:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name) / sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

### Duration — p95 latency by service:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))'
```

### Combined RED via PPL (Trace Spans)

Get all three RED signals from trace spans in a single PPL query:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as total_requests, sum(case(`status.code` = 2, 1 else 0)) as error_count, percentile(durationInNanos, 50) as p50, percentile(durationInNanos, 95) as p95, percentile(durationInNanos, 99) as p99 by serviceName"}'
```


## GenAI-Specific RED Metrics

Apply the RED methodology to GenAI operations using the `gen_ai_client_operation_duration` histogram.

### GenAI Rate — Operations per second by operation and model:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(gen_ai_client_operation_duration_count[5m])) by (gen_ai_operation_name, gen_ai_request_model)'
```

### GenAI Errors — Error ratio by operation and model:

GenAI operations that result in errors (e.g., model timeouts, rate limits) are tracked via span status. Use trace spans to calculate GenAI error rates:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` is not null | stats count() as total, sum(case(`status.code` = 2, 1 else 0)) as errors by `attributes.gen_ai.operation.name`, `attributes.gen_ai.request.model`"}'
```

### GenAI Duration — p50/p95/p99 by operation and model:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.50, sum(rate(gen_ai_client_operation_duration_bucket[5m])) by (le, gen_ai_operation_name, gen_ai_request_model))'
```

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(gen_ai_client_operation_duration_bucket[5m])) by (le, gen_ai_operation_name, gen_ai_request_model))'
```

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.99, sum(rate(gen_ai_client_operation_duration_bucket[5m])) by (le, gen_ai_operation_name, gen_ai_request_model))'
```


## OTel HTTP Semantic Convention Metrics Reference

The RED queries in this skill use metrics defined by the [OpenTelemetry HTTP semantic conventions](https://opentelemetry.io/docs/specs/semconv/http/http-metrics/). The OTel SDK instruments HTTP servers and clients using these standard metric names, which Prometheus exports with underscores replacing dots.

| OTel Metric Name | Prometheus Metric Name | Type | Description |
|---|---|---|---|
| `http.server.request.duration` | `http_server_duration_seconds` | histogram | Duration of HTTP server requests (seconds) |
| `http.server.active_requests` | `http_server_active_requests` | gauge | Number of active HTTP server requests |

Common labels on `http_server_duration_seconds`:

| Label | Description |
|---|---|
| `service_name` | Service that handled the request |
| `http_response_status_code` | HTTP response status code (200, 404, 500, etc.) |
| `http_route` | HTTP route pattern (e.g., `/api/v1/users`) |
| `http_request_method` | HTTP method (GET, POST, PUT, DELETE) |

> **Note:** Prometheus replaces dots in OTel metric and label names with underscores. The OTel metric `http.server.request.duration` becomes `http_server_duration_seconds` in Prometheus (with the `_seconds` unit suffix added by the OTel exporter).


## OTel Collector `spanmetrics` Connector

The OTel Collector `spanmetrics` connector auto-generates RED metrics from trace spans without requiring application-level metric instrumentation. It processes incoming spans and produces metrics for request count, error count, and duration histograms.

### How It Works

The `spanmetrics` connector sits between the traces pipeline and the metrics pipeline in the OTel Collector configuration:

```yaml
connectors:
  spanmetrics:
    histogram:
      explicit:
        buckets: [2ms, 4ms, 6ms, 8ms, 10ms, 50ms, 100ms, 200ms, 400ms, 800ms, 1s, 1400ms, 2s, 5s, 10s, 15s]
    dimensions:
      - name: service.name
      - name: http.route
      - name: http.request.method
      - name: http.response.status_code
    exemplars:
      enabled: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/opensearch, spanmetrics]
    metrics:
      receivers: [otlp, spanmetrics]
      processors: [batch]
      exporters: [otlphttp/prometheus]
```

### Generated Metrics

The `spanmetrics` connector produces these metrics from trace spans:

| Metric | Type | Description |
|---|---|---|
| `traces_spanmetrics_calls_total` | counter | Total number of span calls (Rate) |
| `traces_spanmetrics_duration_seconds` | histogram | Span duration distribution (Duration) |

Error counts are derived by filtering `traces_spanmetrics_calls_total` on `status_code="STATUS_CODE_ERROR"`.

### Querying spanmetrics-Generated RED Metrics

Rate from spanmetrics:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(traces_spanmetrics_calls_total[5m])) by (service_name)'
```

Error rate from spanmetrics:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(traces_spanmetrics_calls_total{status_code="STATUS_CODE_ERROR"}[5m])) by (service_name) / sum(rate(traces_spanmetrics_calls_total[5m])) by (service_name)'
```

Duration p95 from spanmetrics:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(traces_spanmetrics_duration_seconds_bucket[5m])) by (le, service_name))'
```

> **Note:** This stack currently routes traces to OpenSearch via Data Prepper and metrics to Prometheus via OTLP. The `spanmetrics` connector is not enabled by default but can be added to `docker-compose/otel-collector/config.yaml` to auto-generate RED metrics from traces. This is useful when application-level HTTP metrics are not available.


## AWS Managed Service Variants

### Amazon OpenSearch Service (SigV4)

Replace the local OpenSearch endpoint and authentication with AWS SigV4 for all PPL queries in this skill:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:es" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -X POST https://DOMAIN-ID.REGION.es.amazonaws.com/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as request_count by span(startTime, 5m), serviceName"}'
```

- Endpoint format: `https://DOMAIN-ID.REGION.es.amazonaws.com`
- Auth: `--aws-sigv4 "aws:amz:REGION:es"` with `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"`
- The PPL API endpoint (`/_plugins/_ppl`) and query syntax are identical to the local stack
- No `-k` flag needed — AWS managed endpoints use valid TLS certificates

### Amazon Managed Service for Prometheus (AMP) (SigV4)

Replace the local Prometheus endpoint and authentication with AWS SigV4 for all PromQL queries:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:aps" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  'https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

- Endpoint format: `https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query`
- Auth: `--aws-sigv4 "aws:amz:REGION:aps"` with `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"`
- PromQL query syntax is identical between local Prometheus and Amazon Managed Prometheus; only the endpoint and authentication differ
