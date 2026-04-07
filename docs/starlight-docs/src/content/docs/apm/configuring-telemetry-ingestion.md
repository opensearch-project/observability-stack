---
title: Configuring Telemetry Ingestion
description: Set up the OpenTelemetry Collector and Data Prepper to ingest traces, logs, and metrics for APM
sidebar:
  label: Telemetry Ingestion
  order: 10
---

To use APM, you need to ingest application traces and logs into OpenSearch using the OpenTelemetry Collector and Data Prepper pipeline. For an overview of the complete APM architecture, see the [APM overview](/docs/apm/).

This page covers configuring the OpenTelemetry Collector and Data Prepper to process and route telemetry data to OpenSearch and Prometheus.

## Configuring the OpenTelemetry Collector

The [OpenTelemetry (OTel) Collector](https://opentelemetry.io/docs/collector/) acts as the entry point for all application telemetry. It receives data through the OpenTelemetry Protocol (OTLP) and routes traces and logs to Data Prepper while sending metrics to Prometheus.

The following example shows the key exporter and pipeline configuration for routing telemetry to Data Prepper and Prometheus:

```yaml
exporters:
  otlp/opensearch:
    endpoint: "data-prepper:21890"
    tls:
      insecure: true

  otlphttp/prometheus:
    endpoint: "http://prometheus:9090/api/v1/otlp"
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [resourcedetection, memory_limiter, transform, batch]
      exporters: [otlp/opensearch]

    metrics:
      receivers: [otlp]
      processors: [resourcedetection, memory_limiter, batch]
      exporters: [otlphttp/prometheus]

    logs:
      receivers: [otlp]
      processors: [resourcedetection, memory_limiter, transform, batch]
      exporters: [otlp/opensearch]
```

The `otlp/opensearch` exporter sends traces and logs to Data Prepper. The `otlphttp/prometheus` exporter sends metrics directly to Prometheus. For a complete OTel Collector configuration example including receivers, processors, and telemetry settings, see the [observability-stack OTel Collector config](https://github.com/opensearch-project/observability-stack/blob/main/docker-compose/otel-collector/config.yaml).

## Configuring Data Prepper pipelines

Data Prepper receives telemetry data from the OTel Collector and processes it into the formats required for APM. The pipeline architecture routes data through specialized subpipelines for log processing, trace storage, and service map generation.

The following example shows a complete Data Prepper pipeline configuration:

```yaml
# Main OTLP pipeline - receives all telemetry and routes by type
otlp-pipeline:
  source:
    otlp:
      ssl: false
  route:
    - logs: "getEventType() == \"LOG\""
    - traces: "getEventType() == \"TRACE\""
  sink:
    - pipeline:
        name: "otel-logs-pipeline"
        routes:
          - "logs"
    - pipeline:
        name: "otel-traces-pipeline"
        routes:
          - "traces"

# Log processing pipeline
otel-logs-pipeline:
  workers: 5
  delay: 10
  source:
    pipeline:
      name: "otlp-pipeline"
  buffer:
    bounded_blocking:
  sink:
    - opensearch:
        hosts: ["https://<opensearch-host>:9200"]
        username: <username>
        password: <password>
        insecure: true
        index_type: log-analytics-plain

# Trace processing pipeline
otel-traces-pipeline:
  source:
    pipeline:
      name: "otlp-pipeline"
  sink:
    - pipeline:
        name: "traces-raw-pipeline"
    - pipeline:
        name: "service-map-pipeline"

# Raw trace storage pipeline
traces-raw-pipeline:
  source:
    pipeline:
      name: "otel-traces-pipeline"
  processor:
    - otel_traces:
  sink:
    - opensearch:
        hosts: ["https://<opensearch-host>:9200"]
        username: <username>
        password: <password>
        insecure: true
        index_type: trace-analytics-plain-raw

# Service map and APM metrics pipeline
service-map-pipeline:
  source:
    pipeline:
      name: "otel-traces-pipeline"
  processor:
    - otel_apm_service_map:
        group_by_attributes: [telemetry.sdk.language] # Add any resource attribute to group by
  route:
    - otel_apm_service_map_route: 'getEventType() == "SERVICE_MAP"'
    - service_processed_metrics: 'getEventType() == "METRIC"'
  sink:
    - opensearch:
        hosts: ["https://<opensearch-host>:9200"]
        username: <username>
        password: <password>
        index_type: otel-v2-apm-service-map
        routes: [otel_apm_service_map_route]
        insecure: true
    - prometheus:
        url: "http://prometheus:9090/api/v1/write"
        routes: [service_processed_metrics]
```

### Pipeline architecture

The Data Prepper pipeline processes telemetry data using the following steps:

1. The entry pipeline (`otlp-pipeline`) receives all telemetry and routes logs and traces to their respective subpipelines.
2. The log pipeline (`otel-logs-pipeline`) writes logs to OpenSearch using the `log-analytics-plain` index type.
3. The trace pipeline (`otel-traces-pipeline`) distributes traces to both the raw storage pipeline and the service map pipeline.
4. The raw trace pipeline (`traces-raw-pipeline`) processes individual trace spans using the `otel_traces` processor and stores them in OpenSearch using the `trace-analytics-plain-raw` index type.
5. The service map pipeline (`service-map-pipeline`) uses the `otel_apm_service_map` processor to generate service dependency maps and RED metrics. Service map topology data is written to OpenSearch, and RED metrics are exported to Prometheus through remote write.

Two key configuration options for the `otel_apm_service_map` processor are `group_by_attributes` (which determines how services can be grouped in the application map) and `window_duration` (which sets the time window for aggregating trace data).

## Verifying ingestion

After configuring the OTel Collector and Data Prepper, verify that data is flowing correctly:

1. **Verify OpenSearch indexes** - confirm the following indexes are created in your OpenSearch cluster:
   - `otel-v1-apm-span-*` - raw trace spans
   - `otel-v2-apm-service-map` - service topology data
   - `logs-otel-v1-*` - application logs

   You can check indexes using:
   ```bash
   curl -k -u admin:My_password_123!@# https://localhost:9200/_cat/indices?v
   ```

2. **Verify Prometheus** - confirm the Data Prepper remote write target is active in your Prometheus instance by checking the Prometheus targets page at `http://localhost:9090/targets`.

3. **Verify in OpenSearch Dashboards** - navigate to **Observability** > **APM** to confirm that your services appear in the [Services](/docs/apm/services/) catalog and the [Application Map](/docs/apm/service-map/).

> **Warning:** Ensure that all port mappings are correct between the OTel Collector, Data Prepper, OpenSearch, and Prometheus. Mismatched ports are a common cause of ingestion failures.

## Next steps

- [Configuring APM in OpenSearch Dashboards](/docs/apm/configuring-apm/): Create datasets, index patterns, and configure APM settings to start using APM features.
