---
title: "Data Prepper"
description: "Configure Data Prepper pipelines for trace and log ingestion into OpenSearch"
---

Data Prepper is the pipeline engine that receives OTLP telemetry, routes events by signal type, applies processors, and writes to OpenSearch indices. The default configuration handles traces, logs, and service map generation.

## Prerequisites

- OpenSearch Observability Stack running (see [Quickstart](/docs/get-started/quickstart/))
- OTel Collector configured to export to Data Prepper on port 21890

## Pipeline configuration

The pipeline configuration file (`pipelines.yaml`) defines a directed acyclic graph of named pipelines. Each pipeline has a source, optional processors, optional routing rules, and one or more sinks.

### OTLP source pipeline

The entry-point pipeline receives all OTLP data and routes events by type:

```yaml
otlp-pipeline:
  workers: 5
  delay: 10
  source:
    otlp:
      ssl: false
      port: 21890
  router:
    - "LOG": '/eventType == "LOG"'
    - "TRACE": '/eventType == "TRACE"'
  route:
    - LOG: [otel-logs-pipeline]
    - TRACE: [otel-traces-pipeline]
```

| Parameter | Description |
|-----------|-------------|
| `workers` | Number of threads processing events in parallel |
| `delay` | Milliseconds to wait before flushing a partial batch |
| `source.otlp.port` | gRPC port for receiving OTLP data (default: 21890) |
| `router` | Conditional expressions that classify events by type |
| `route` | Maps router labels to downstream pipeline names |

### Log pipeline

The log pipeline receives routed log events, copies the timestamp field, and writes to the log analytics index:

```yaml
otel-logs-pipeline:
  workers: 5
  delay: 10
  source:
    pipeline:
      name: "otlp-pipeline"
  processor:
    - copy_values:
        entries:
          - from_key: "time"
            to_key: "@timestamp"
  sink:
    - opensearch:
        hosts: ["https://opensearch:9200"]
        username: "admin"
        password: "${OPENSEARCH_PASSWORD}"
        insecure: true
        index_type: log-analytics-plain
```

The `copy_values` processor maps the OTel `time` field to the `@timestamp` field that OpenSearch log analytics expects.

### Trace pipelines

Traces fan out to two downstream pipelines for parallel processing:

```yaml
otel-traces-pipeline:
  source:
    pipeline:
      name: "otlp-pipeline"
  sink:
    - pipeline:
        name: "traces-raw-pipeline"
    - pipeline:
        name: "service-map-pipeline"
```

#### Raw traces pipeline

Processes raw span data and writes to the trace analytics index:

```yaml
traces-raw-pipeline:
  source:
    pipeline:
      name: "otel-traces-pipeline"
  processor:
    - otel_traces:
  sink:
    - opensearch:
        hosts: ["https://opensearch:9200"]
        username: "admin"
        password: "${OPENSEARCH_PASSWORD}"
        insecure: true
        index_type: trace-analytics-plain-raw
```

The `otel_traces` processor converts OpenTelemetry span data into the document format that the OpenSearch trace analytics UI expects.

#### Service map pipeline

Aggregates span relationships to build a service dependency map:

```yaml
service-map-pipeline:
  source:
    pipeline:
      name: "otel-traces-pipeline"
  processor:
    - otel_apm_service_map:
        group_by_attributes:
          - telemetry.sdk.language
        window_duration: "10s"
  route:
    - SERVICE_MAP: [opensearch-service-map-sink]
    - METRIC: [prometheus-service-map-sink]
  sink:
    - opensearch:
        name: opensearch-service-map-sink
        hosts: ["https://opensearch:9200"]
        username: "admin"
        password: "${OPENSEARCH_PASSWORD}"
        insecure: true
        index_type: otel-v2-apm-service-map
    - prometheus_remote_write:
        name: prometheus-service-map-sink
        url: "http://prometheus:9090/api/v1/write"
        max_events: 500
        flush_timeout: "5s"
```

| Parameter | Description |
|-----------|-------------|
| `group_by_attributes` | Attributes to include as dimensions in the service map (e.g., `telemetry.sdk.language`) |
| `window_duration` | Time window for aggregating service relationships |
| `max_events` | Maximum events per Prometheus remote write batch |
| `flush_timeout` | Maximum wait before flushing a partial Prometheus batch |

The service map pipeline has a dual sink: it writes service relationship documents to OpenSearch for the service map UI, and exports derived metrics to Prometheus via remote write.

## Enabling experimental processors

Some processors like `otel_apm_service_map` and the Prometheus sink require explicit opt-in via `data-prepper-config.yaml`:

```yaml
ssl: false
experimental:
  enabled_plugins:
    processor:
      - otel_apm_service_map
    sink:
      - prometheus
```

## Index types reference

| Index Type | Pipeline | Description |
|-----------|----------|-------------|
| `log-analytics-plain` | otel-logs-pipeline | Plain-text log events with `@timestamp` |
| `trace-analytics-plain-raw` | traces-raw-pipeline | Raw span documents for trace analytics |
| `otel-v2-apm-service-map` | service-map-pipeline | Service dependency relationships |

## Adding custom processors

Insert processors into the `processor` list of any pipeline. Processors execute in order.

Common examples:

```yaml
# Filter events by attribute
processor:
  - filter:
      condition: '/severity_text == "DEBUG"'
      action: drop

# Add a static field
processor:
  - add_entries:
      entries:
        - key: "environment"
          value: "production"

# Truncate long fields
processor:
  - truncate:
      entries:
        - source_key: "body"
          length: 10000
```

Chain multiple processors to build a transformation pipeline:

```yaml
processor:
  - copy_values:
      entries:
        - from_key: "time"
          to_key: "@timestamp"
  - add_entries:
      entries:
        - key: "cluster"
          value: "prod-us-east-1"
  - filter:
      condition: '/severity_text == "DEBUG"'
      action: drop
```

## Environment variables

Use environment variable substitution to avoid hardcoding credentials:

```yaml
sink:
  - opensearch:
      hosts: ["${OPENSEARCH_HOSTS}"]
      username: "${OPENSEARCH_USERNAME}"
      password: "${OPENSEARCH_PASSWORD}"
```

Set these in your deployment environment or Docker Compose file:

```bash
export OPENSEARCH_HOSTS="https://opensearch:9200"
export OPENSEARCH_USERNAME="admin"
export OPENSEARCH_PASSWORD="your-secure-password"
```

## Related links

- [Pipeline Overview](/docs/send-data/data-pipeline/) -- Architecture and data flow diagram.
- [Batching & Performance](/docs/send-data/data-pipeline/batching/) -- Tune workers, batch sizes, and memory limits.
- [Data Prepper processor reference](https://opensearch.org/docs/latest/data-prepper/pipelines/configuration/processors/processors/) -- Full list of available processors.
