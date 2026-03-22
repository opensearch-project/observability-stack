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

## Connection Defaults

| Variable | Default | Description |
|---|---|---|
| `OPENSEARCH_ENDPOINT` | `https://localhost:9200` | OpenSearch base URL |
| `OPENSEARCH_USER` | `admin` | OpenSearch username |
| `OPENSEARCH_PASSWORD` | `My_password_123!@#` | OpenSearch password |
| `PROMETHEUS_ENDPOINT` | `http://localhost:9090` | Prometheus base URL |


## Metric Discovery

Different OTel SDK versions and languages emit HTTP metrics under different names. Before querying, discover which metric names are active in your stack:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/label/__name__/values" | python3 -c "
import json, sys
for m in json.load(sys.stdin).get('data', []):
    if any(k in m for k in ['http_server', 'gen_ai', 'db_client']):
        print(m)"
```

**Common HTTP metric name variants:**

| Metric Name | Unit | Emitted By |
|---|---|---|
| `http_server_duration_milliseconds` | milliseconds | Python OTel SDK (older semconv) |
| `http_server_duration_seconds` | seconds | .NET, Java OTel SDKs |
| `http_server_request_duration_seconds` | seconds | Stable HTTP semconv (newer SDKs) |

> **Important:** Replace the metric name in the PromQL queries below with whichever variant is active in your stack. For millisecond-unit metrics, adjust latency thresholds accordingly (e.g., `le="250"` instead of `le="0.25"`).

## Rate Queries

### Per-Service Request Rate (PromQL)

Calculate the per-second HTTP request rate over a 5-minute window, grouped by service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

### Per-Endpoint Request Rate (PromQL)

Break down request rate by service and HTTP route to identify hot endpoints:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count[5m])) by (service_name, http_route)'
```

### Request Rate from Trace Spans (PPL)

Calculate request rate from trace spans as an alternative to PromQL. This counts spans per 5-minute bucket grouped by service:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as request_count by span(startTime, 5m), serviceName"}'
```


## Error Queries

### Error Rate Ratio (PromQL)

Calculate the ratio of 5xx error responses to total requests by service. A value of 0.01 means 1% of requests are failing:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name) / sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

### Error Count (PromQL)

Calculate the per-second rate of 5xx errors by service (useful for alerting on absolute error volume):

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name)'
```

### Error Count from Trace Spans (PPL)

Count error spans (status code 2 = Error in OTel) grouped by service:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `status.code` = 2 | stats count() as error_count by serviceName"}'
```


## Duration Queries

### Latency Percentiles (PromQL)

#### p50 (Median) Latency by Service

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.50, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))'
```

#### p95 Latency by Service

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))'
```

#### p99 Latency by Service

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.99, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))'
```

### Latency Percentiles from Trace Spans (PPL)

Calculate p50, p95, and p99 latency directly from trace span durations. Values are in nanoseconds — divide by 1,000,000 for milliseconds:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats percentile(durationInNanos, 50) as p50, percentile(durationInNanos, 95) as p95, percentile(durationInNanos, 99) as p99 by serviceName"}'
```


## Combined RED Dashboard

Run all three RED signals for every service in a single investigation. Execute these queries together to get a complete service health snapshot.

### Rate — Requests per second by service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

### Errors — Error ratio by service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name) / sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

### Duration — p95 latency by service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))'
```

### Combined RED via PPL (Trace Spans)

Get all three RED signals from trace spans in a single PPL query:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as total_requests, sum(case(`status.code` = 2, 1 else 0)) as error_count, percentile(durationInNanos, 50) as p50, percentile(durationInNanos, 95) as p95, percentile(durationInNanos, 99) as p99 by serviceName"}'
```


## Data Prepper APM Metrics

Data Prepper's APM service map processor generates its own RED metrics from trace spans and writes them to Prometheus. These are the metrics that power the OpenSearch Dashboards APM UI. Unlike OTel SDK histogram metrics (which use `rate()` on counters), Data Prepper APM metrics are **gauges** — instantaneous snapshot values that should be queried directly without `rate()`.

### Data Prepper APM Metric Reference

| Metric | Type | Description |
|---|---|---|
| `request` | gauge | Total request count per service/operation edge |
| `error` | gauge | Error count (server-side errors, status code 2) |
| `fault` | gauge | Fault count (client-side errors) |
| `latency_seconds_seconds_bucket` | histogram | Latency distribution with `le` buckets (note: double `_seconds` suffix from unit handling) |

Common labels on all Data Prepper APM metrics:

| Label | Description |
|---|---|
| `service` | Source service name |
| `operation` | Source operation (e.g., `GET /api/cart`) |
| `remoteService` | Destination service name |
| `remoteOperation` | Destination operation |
| `environment` | Deployment environment (e.g., `generic:default`) |
| `namespace` | Always `span_derived` for Data Prepper APM metrics |

> **Important:** These metrics use `service` (not `service_name`) as the label for service names, unlike OTel SDK metrics which use `service_name`.

### Request Count by Service (Data Prepper)

Query total request count per service. This is a gauge — no `rate()` needed:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(request{namespace="span_derived"}) by (service)'
```

### Request Count by Service and Operation (Data Prepper)

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=request{namespace="span_derived", service="frontend"}'
```

### Error Count by Service (Data Prepper)

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(error{namespace="span_derived"}) by (service)'
```

### Fault Count by Service (Data Prepper)

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(fault{namespace="span_derived"}) by (service)'
```

### Error Rate by Service (Data Prepper)

Calculate the error ratio using safe division to avoid NaN when request count is zero:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(error{namespace="span_derived"}) by (service) / (sum(request{namespace="span_derived"}) by (service) > 0)'
```

### Latency Percentiles (Data Prepper)

#### p50 (Median) Latency by Service

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.50, sum(latency_seconds_seconds_bucket{namespace="span_derived"}) by (le, service))'
```

#### p95 Latency by Service

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, sum(latency_seconds_seconds_bucket{namespace="span_derived"}) by (le, service))'
```

#### p99 Latency by Service

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.99, sum(latency_seconds_seconds_bucket{namespace="span_derived"}) by (le, service))'
```

### p99 Latency for a Specific Service (Data Prepper)

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.99, sum(latency_seconds_seconds_bucket{namespace="span_derived", service="frontend"}) by (le))'
```

### Top-K Services by Error Rate (Data Prepper)

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=topk(5, sum(error{namespace="span_derived"}) by (service) / (sum(request{namespace="span_derived"}) by (service) > 0))'
```


## GenAI-Specific RED Metrics

Apply the RED methodology to GenAI operations using the `gen_ai_client_operation_duration_seconds` histogram.

### GenAI Rate — Operations per second by operation and model:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(gen_ai_client_operation_duration_seconds_count[5m])) by (gen_ai_operation_name, gen_ai_request_model)'
```

### GenAI Errors — Error ratio by operation and model:

GenAI operations that result in errors (e.g., model timeouts, rate limits) are tracked via span status. Use trace spans to calculate GenAI error rates:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where isnotnull(`attributes.gen_ai.operation.name`) | stats count() as total, sum(case(`status.code` = 2, 1 else 0)) as errors by `attributes.gen_ai.operation.name`, `attributes.gen_ai.request.model`"}'
```

### GenAI Duration — p50/p95/p99 by operation and model:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.50, sum(rate(gen_ai_client_operation_duration_seconds_bucket[5m])) by (le, gen_ai_operation_name, gen_ai_request_model))'
```

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(gen_ai_client_operation_duration_seconds_bucket[5m])) by (le, gen_ai_operation_name, gen_ai_request_model))'
```

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.99, sum(rate(gen_ai_client_operation_duration_seconds_bucket[5m])) by (le, gen_ai_operation_name, gen_ai_request_model))'
```


## OTel HTTP Semantic Convention Metrics Reference

The RED queries in this skill use metrics defined by the [OpenTelemetry HTTP semantic conventions](https://opentelemetry.io/docs/specs/semconv/http/http-metrics/). The OTel SDK instruments HTTP servers and clients using these standard metric names, which Prometheus exports with underscores replacing dots.

| OTel Metric Name | Prometheus Metric Name(s) | Type | Description |
|---|---|---|---|
| `http.server.request.duration` | `http_server_duration_seconds`, `http_server_duration_milliseconds`, `http_server_request_duration_seconds` | histogram | Duration of HTTP server requests (unit varies by SDK) |
| `http.server.active_requests` | `http_server_active_requests` | gauge | Number of active HTTP server requests |

> **Note:** The exact Prometheus metric name depends on the OTel SDK version and language. Python SDKs with older semconv emit `http_server_duration_milliseconds`; .NET/Java SDKs emit `http_server_duration_seconds`; newer stable semconv uses `http_server_request_duration_seconds`. Use the [Metric Discovery](#metric-discovery) section to check which name is active.

Common labels on HTTP server duration metrics:

| Label | Description |
|---|---|
| `service_name` | Service that handled the request |
| `http_response_status_code` | HTTP response status code (200, 404, 500, etc.) |
| `http_route` | HTTP route pattern (e.g., `/api/v1/users`) |
| `http_request_method` | HTTP method (GET, POST, PUT, DELETE) |

> **Note on status code labels:** The label name varies by OTel SDK version. Older semconv uses `http_status_code`; newer stable semconv uses `http_response_status_code`. Use the [Metric Discovery](#metric-discovery) section to check which label is present, or query both variants.

> **Note:** Prometheus replaces dots in OTel metric and label names with underscores. The OTel metric `http.server.request.duration` becomes a Prometheus metric with a unit suffix added by the OTel exporter. The exact name varies by SDK — see the table above.


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
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(traces_spanmetrics_calls_total[5m])) by (service_name)'
```

Error rate from spanmetrics:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(traces_spanmetrics_calls_total{status_code="STATUS_CODE_ERROR"}[5m])) by (service_name) / sum(rate(traces_spanmetrics_calls_total[5m])) by (service_name)'
```

Duration p95 from spanmetrics:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(traces_spanmetrics_duration_seconds_bucket[5m])) by (le, service_name))'
```

> **Note:** This stack currently routes traces to OpenSearch via Data Prepper and metrics to Prometheus via OTLP. The `spanmetrics` connector is not enabled by default but can be added to `docker-compose/otel-collector/config.yaml` to auto-generate RED metrics from traces. This is useful when application-level HTTP metrics are not available.


## Advanced PromQL Patterns

### Safe Division (Avoid NaN/Inf)

When dividing metrics (e.g., error rate = errors/total), use `clamp_min()` to avoid division-by-zero which produces NaN or Inf:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name) / clamp_min(sum(rate(http_server_duration_seconds_count[5m])) by (service_name), 1) * 100'
```

### Top-K Services by Fault Rate

Find the top 5 services with the highest fault rate using `topk()`:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=topk(5, sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name) / clamp_min(sum(rate(http_server_duration_seconds_count[5m])) by (service_name), 1) * 100)'
```

### Top-K Operations by Fault Rate for a Service

Drill into a specific service to find its worst-performing operations:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=topk(5, sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5..", service_name="frontend"}[5m])) by (http_route) / clamp_min(sum(rate(http_server_duration_seconds_count{service_name="frontend"}[5m])) by (http_route), 1) * 100)'
```

### Service Availability

Calculate availability as the inverse of fault rate (percentage of non-5xx responses):

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=(1 - sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name) / clamp_min(sum(rate(http_server_duration_seconds_count[5m])) by (service_name), 1)) * 100'
```

### Bottom-K Services by Availability

Find the 5 services with the lowest availability (most errors):

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=bottomk(5, (1 - sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name) / clamp_min(sum(rate(http_server_duration_seconds_count[5m])) by (service_name), 1)) * 100)'
```

### Per-Operation RED Metrics for a Service

Get latency, request rate, and error rate per operation for a specific service:

```bash
curl -s "$PROMETHEUS_ENDPOINT/api/v1/query" \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_server_duration_seconds_bucket{service_name="checkout"}[5m])) by (le, http_route))'
```

## References

- [PPL Language Reference](https://github.com/opensearch-project/sql/blob/main/docs/user/ppl/index.md) — Official PPL syntax documentation. Fetch this if queries fail due to OpenSearch version differences or new syntax.
- [Prometheus Querying Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/) — PromQL syntax reference.

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
