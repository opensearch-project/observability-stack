---
title: "OTel Collector Configuration"
description: "Configure the OpenTelemetry Collector pipeline for traces, metrics, and logs"
---

The OpenTelemetry Collector is the central routing layer in the observability stack. It receives telemetry from your applications via OTLP, processes it (batching, resource detection, transformations), and exports it to Data Prepper and Prometheus.

This page walks through the complete Collector configuration used by the stack.

## Prerequisites

- The observability stack running (OTel Collector, Data Prepper, Prometheus, OpenSearch)
- Applications configured to send OTLP to the Collector endpoints

:::tip[Upstream documentation]
For the complete OTel Collector reference, see the [official OpenTelemetry Collector documentation](https://opentelemetry.io/docs/collector/).
:::

## Full Configuration

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins: ["http://*", "https://*"]

processors:
  memory_limiter:
    check_interval: 5s
    limit_percentage: 80
    spike_limit_percentage: 25
  batch:
    timeout: 10s
    send_batch_size: 1024
  resourcedetection:
    detectors: [env, system]
  transform:
    error_mode: ignore
    trace_statements:
      - context: span
        statements:
          - replace_pattern(attributes["url.path"], "\\?.*", "")
          - replace_pattern(name, "\\?.*", "")
          - replace_pattern(name, "GET /api/products/[^/]+", "GET /api/products/{productId}")
          - set(attributes["db_system_name"], attributes["db.system.name"]) where attributes["db.system.name"] != nil
          - set(attributes["code_function_name"], attributes["code.function.name"]) where attributes["code.function.name"] != nil
          - set(attributes["user_agent_original"], attributes["user_agent.original"]) where attributes["user_agent.original"] != nil
          - set(attributes["upstream_cluster_name"], attributes["upstream_cluster.name"]) where attributes["upstream_cluster.name"] != nil
          - set(attributes["error_type"], attributes["error.type"]) where attributes["error.type"] != nil
          - set(attributes["app_ads_contextKeys"], attributes["app.ads.contextKeys"]) where attributes["app.ads.contextKeys"] != nil
          - set(attributes["rpc_system"], attributes["rpc.system"]) where attributes["rpc.system"] != nil
    log_statements:
      - context: log
        statements:
          - flatten(body, "")
          - merge_maps(body, body[""], "upsert")
          - delete_key(body, "")
          - set(body, Concat([body], ", ")) where IsMap(body)

exporters:
  debug:
    verbosity: detailed
  otlp/opensearch:
    endpoint: data-prepper:21890
    tls:
      insecure: true
  otlphttp/prometheus:
    endpoint: http://prometheus:9090/api/v1/otlp

service:
  telemetry:
    metrics:
      readers:
        - pull:
            exporter:
              prometheus:
                host: '0.0.0.0'
                port: 8888
  pipelines:
    traces:
      receivers: [otlp]
      processors: [resourcedetection, memory_limiter, transform, batch]
      exporters: [otlp/opensearch, debug]
    metrics:
      receivers: [otlp]
      processors: [resourcedetection, memory_limiter, batch]
      exporters: [otlphttp/prometheus, debug]
    logs:
      receivers: [otlp]
      processors: [resourcedetection, memory_limiter, transform, batch]
      exporters: [otlp/opensearch, debug]
```

## Receivers

The `otlp` receiver accepts all three telemetry signals over two protocols:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins: ["http://*", "https://*"]
```

| Setting | Value | Purpose |
|---------|-------|---------|
| `grpc.endpoint` | `0.0.0.0:4317` | Accept OTLP gRPC from backend services |
| `http.endpoint` | `0.0.0.0:4318` | Accept OTLP HTTP from browsers, serverless |
| `http.cors.allowed_origins` | `["http://*", "https://*"]` | Allow browser-based instrumentation from any origin |

The CORS configuration is permissive by default for development. In production, restrict `allowed_origins` to your application domains.

## Processors

Processors run in the order specified in each pipeline definition. The stack uses four processors:

### memory_limiter

```yaml
memory_limiter:
  check_interval: 5s
  limit_percentage: 80
  spike_limit_percentage: 25
```

Prevents the Collector from running out of memory under load. When memory usage exceeds 80%, the Collector starts dropping data. The spike limit reserves 25% headroom for sudden bursts.

Place `memory_limiter` early in the processor chain (after `resourcedetection`) so it can shed load before expensive processing occurs.

### batch

```yaml
batch:
  timeout: 10s
  send_batch_size: 1024
```

Batches telemetry records before export to reduce the number of outbound requests. A batch is flushed when it reaches 1024 items or 10 seconds have elapsed, whichever comes first.

| Setting | Default | Recommendation |
|---------|---------|----------------|
| `timeout` | 200ms | 5-30s for production |
| `send_batch_size` | 8192 | 512-2048 depending on payload size |

### resourcedetection

```yaml
resourcedetection:
  detectors: [env, system]
```

Automatically populates resource attributes from the runtime environment:

- **`env`** -- Reads `OTEL_RESOURCE_ATTRIBUTES` environment variable
- **`system`** -- Adds `host.name`, `host.arch`, `os.type`

Additional detectors are available for cloud environments: `aws`, `gcp`, `azure`, `docker`, `kubernetes`.

### transform

The transform processor uses the [OTel Transformation Language (OTTL)](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/transformprocessor) to modify telemetry in-flight.

**Trace transformations:**

```yaml
transform:
  error_mode: ignore
  trace_statements:
    - context: span
      statements:
        # Strip query parameters from URL paths and span names
        - replace_pattern(attributes["url.path"], "\\?.*", "")
        - replace_pattern(name, "\\?.*", "")
        # Normalize high-cardinality span names
        - replace_pattern(name, "GET /api/products/[^/]+", "GET /api/products/{productId}")
```

Query parameter stripping prevents high-cardinality URL paths from creating excessive unique span names. The product ID normalization collapses `GET /api/products/123`, `GET /api/products/456`, etc. into a single operation name.

**Dotted attribute flattening:**

```yaml
        # Flatten dotted attribute keys (workaround for data-prepper#5616)
        - set(attributes["db_system_name"], attributes["db.system.name"]) where attributes["db.system.name"] != nil
```

OTel semantic convention attributes use dots (e.g., `db.system.name`), but Data Prepper may interpret dots as nested object paths. These statements copy dotted attributes to underscore-delimited equivalents so they are indexed correctly.

**Log transformations:**

```yaml
  log_statements:
    - context: log
      statements:
        - flatten(body, "")
        - merge_maps(body, body[""], "upsert")
        - delete_key(body, "")
        - set(body, Concat([body], ", ")) where IsMap(body)
```

These statements normalize structured log bodies. Nested maps are flattened and merged into the top-level body, ensuring consistent indexing in OpenSearch.

## Exporters

### otlp/opensearch

```yaml
otlp/opensearch:
  endpoint: data-prepper:21890
  tls:
    insecure: true
```

Sends traces and logs to Data Prepper over OTLP gRPC. Data Prepper then processes and indexes them in OpenSearch. TLS is disabled because the Collector and Data Prepper communicate over a private Docker network.

In production with network exposure, enable TLS:

```yaml
otlp/opensearch:
  endpoint: data-prepper:21890
  tls:
    cert_file: /certs/collector.crt
    key_file: /certs/collector.key
    ca_file: /certs/ca.crt
```

### otlphttp/prometheus

```yaml
otlphttp/prometheus:
  endpoint: http://prometheus:9090/api/v1/otlp
```

Sends metrics to Prometheus via its native OTLP HTTP endpoint (available since Prometheus 2.47). No conversion or remote-write adapter is needed.

### debug

```yaml
debug:
  verbosity: detailed
```

Logs all exported telemetry to the Collector's stdout. Useful for development and troubleshooting. Remove or set `verbosity: basic` in production.

## Service Pipelines

The `service.pipelines` section wires receivers, processors, and exporters together:

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [resourcedetection, memory_limiter, transform, batch]
      exporters: [otlp/opensearch, debug]
    metrics:
      receivers: [otlp]
      processors: [resourcedetection, memory_limiter, batch]
      exporters: [otlphttp/prometheus, debug]
    logs:
      receivers: [otlp]
      processors: [resourcedetection, memory_limiter, transform, batch]
      exporters: [otlp/opensearch, debug]
```

Note that the **metrics** pipeline does not include the `transform` processor -- metric transformations are not needed for the default setup.

### Collector self-monitoring

```yaml
service:
  telemetry:
    metrics:
      readers:
        - pull:
            exporter:
              prometheus:
                host: '0.0.0.0'
                port: 8888
```

The Collector exposes its own metrics on port 8888 in Prometheus format. Scrape this endpoint to monitor Collector health, queue depths, and export errors.

## Customization Tips

**Add a new receiver** (e.g., Kafka):
```yaml
receivers:
  otlp: ...
  kafka:
    brokers: ["kafka:9092"]
    topic: telemetry
    encoding: otlp_proto

service:
  pipelines:
    traces:
      receivers: [otlp, kafka]
```

**Filter unwanted spans** (e.g., health checks):
```yaml
processors:
  filter:
    error_mode: ignore
    traces:
      span:
        - 'attributes["url.path"] == "/health"'
        - 'attributes["url.path"] == "/ready"'
```

**Add tail sampling** at the Collector level (see [Sampling Strategies](/docs/send-data/opentelemetry/sampling/)):
```yaml
processors:
  tail_sampling:
    decision_wait: 30s
    policies:
      - name: errors
        type: status_code
        status_code: {status_codes: [ERROR]}
      - name: slow
        type: latency
        latency: {threshold_ms: 5000}
```

## Related Links

- [OpenTelemetry Overview](/docs/send-data/opentelemetry/) -- Signals, protocols, and architecture
- [Sampling Strategies](/docs/send-data/opentelemetry/sampling/) -- Head and tail sampling configuration
- [Data Pipeline](/docs/send-data/data-pipeline/) -- Data Prepper and Prometheus configuration
- [OpenTelemetry Collector documentation](https://opentelemetry.io/docs/collector/) -- Official Collector configuration reference
- [Collector contrib components](https://github.com/open-telemetry/opentelemetry-collector-contrib) -- Community receivers, processors, and exporters
