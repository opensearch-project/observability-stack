---
title: "Batching & Performance"
description: "Tune batch sizes, memory limits, and worker counts for production throughput"
---

Telemetry data passes through multiple batching stages: the OTel SDK, the OTel Collector, and Data Prepper. Each stage has independent configuration that affects throughput, latency, and memory usage. Tuning these settings correctly prevents data loss and ensures stable ingestion under load.

## Batching stages

```mermaid
flowchart LR
    A[OTel SDK<br/>BatchSpanProcessor] -->|batch export| B[OTel Collector<br/>batch processor]
    B -->|batch export| C[Data Prepper<br/>workers + delay]
    C -->|bulk write| D[OpenSearch]
```

## OTel Collector batch processor

The Collector's batch processor groups telemetry into larger payloads before exporting to Data Prepper:

```yaml
processors:
  batch:
    timeout: 10s
    send_batch_size: 1024

  memory_limiter:
    check_interval: 5s
    limit_percentage: 80
    spike_limit_percentage: 25
```

### Batch processor settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| `timeout` | 200ms | Maximum time to wait before sending a partial batch |
| `send_batch_size` | 8192 | Number of spans/logs/metrics that trigger an immediate export |
| `send_batch_max_size` | 0 (unlimited) | Hard upper limit on batch size; set to prevent oversized exports |

Setting `timeout: 10s` and `send_batch_size: 1024` means the Collector exports a batch when either 1,024 items accumulate or 10 seconds elapse, whichever comes first. This balances throughput with acceptable latency.

### Memory limiter settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| `check_interval` | 0s | How often to check memory usage |
| `limit_percentage` | 0 | Percentage of total memory that triggers throttling |
| `spike_limit_percentage` | 0 | Additional headroom for sudden spikes |

With `limit_percentage: 80` and `spike_limit_percentage: 25`, the Collector starts refusing data when memory reaches 80% and reserves 25% headroom for spikes. This prevents OOM crashes during traffic bursts.

Place `memory_limiter` first in your processor pipeline so it runs before any memory-intensive operations:

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/dataprepper]
```

## Data Prepper workers and delay

Each Data Prepper pipeline has independent concurrency and batching settings:

```yaml
otlp-pipeline:
  workers: 5
  delay: 10
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `workers` | 1 | Number of threads processing events in parallel |
| `delay` | 3000 | Milliseconds to buffer events before processing a batch |

Increasing `workers` improves throughput for CPU-bound processors. Increasing `delay` creates larger batches, which improves OpenSearch bulk indexing efficiency but adds latency.

### Worker sizing guidelines

| Pipeline Throughput | Recommended Workers | Delay (ms) |
|--------------------|-------------------|------------|
| < 1,000 events/sec | 1-2 | 3000 |
| 1,000-10,000 events/sec | 3-5 | 1000-3000 |
| 10,000-50,000 events/sec | 5-10 | 500-1000 |
| > 50,000 events/sec | 10-20 | 100-500 |

## SDK-side BatchSpanProcessor

The OTel SDK batches spans before sending to the Collector. Tune these settings to control export frequency and memory usage in your application:

```python
from opentelemetry.sdk.trace.export import BatchSpanProcessor

processor = BatchSpanProcessor(
    exporter,
    max_queue_size=2048,
    schedule_delay_millis=5000,
    max_export_batch_size=512,
    export_timeout_millis=30000,
)
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_queue_size` | 2048 | Maximum spans buffered in memory before dropping |
| `schedule_delay_millis` | 5000 | Delay between export attempts |
| `max_export_batch_size` | 512 | Spans per export batch |
| `export_timeout_millis` | 30000 | Timeout for each export call |

These defaults work well for most applications. Increase `max_queue_size` and `max_export_batch_size` for high-throughput services. Decrease `schedule_delay_millis` if you need lower latency from span creation to visibility.

Environment variable equivalents:

| Environment Variable | Parameter |
|---------------------|-----------|
| `OTEL_BSP_MAX_QUEUE_SIZE` | `max_queue_size` |
| `OTEL_BSP_SCHEDULE_DELAY` | `schedule_delay_millis` |
| `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` | `max_export_batch_size` |
| `OTEL_BSP_EXPORT_TIMEOUT` | `export_timeout_millis` |

## Production recommendations

| Setting | Development | Production |
|---------|------------|------------|
| Collector `batch.timeout` | 1s | 5-10s |
| Collector `batch.send_batch_size` | 256 | 1024-4096 |
| Collector `memory_limiter.limit_percentage` | 80 | 75-80 |
| Data Prepper `workers` | 1 | 5-10 |
| Data Prepper `delay` | 3000 | 500-2000 |
| SDK `max_queue_size` | 2048 | 4096-8192 |
| SDK `schedule_delay_millis` | 5000 | 2000-5000 |
| SDK `max_export_batch_size` | 512 | 512-1024 |

## Monitoring pipeline health

Watch these indicators to detect batching or performance issues:

- **Collector dropped spans/logs** -- Check `otelcol_processor_dropped_spans` and `otelcol_processor_dropped_log_records` metrics. Non-zero values indicate the memory limiter is active or the export queue is full.
- **Data Prepper buffer usage** -- Monitor Data Prepper logs for `Buffer is full` warnings. Increase `workers` or reduce upstream throughput.
- **OpenSearch indexing latency** -- High bulk indexing latency causes backpressure through the pipeline. Check `_nodes/stats` for thread pool rejections.
- **SDK queue drops** -- The `otel.bsp.spans.dropped` metric indicates the SDK is producing spans faster than it can export them. Increase `max_queue_size` or reduce `schedule_delay_millis`.

## Related links

- [Data Prepper](/docs/send-data/data-pipeline/data-prepper/) -- Full pipeline configuration reference.
- [OTel Collector](/docs/send-data/opentelemetry/collector/) -- Collector deployment and configuration.
- [Pipeline Overview](/docs/send-data/data-pipeline/) -- Architecture and data flow diagram.
