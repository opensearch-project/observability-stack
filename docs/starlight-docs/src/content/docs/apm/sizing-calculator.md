---
title: Sizing Calculator
description: Estimate APM storage, metrics, and ingest requirements based on your workload
---

The APM Sizing Calculator helps you estimate the resource consumption of Application Monitoring before you deploy — or as you plan to scale. It models the three storage systems APM uses (span storage in OpenSearch, service map in OpenSearch, and RED metrics in Prometheus) based on your workload parameters.

**[Open the APM Sizing Calculator →](https://observability.opensearch.org/apm-usage-calculator/)**

## What it estimates

The calculator takes six inputs and produces storage, document count, and ingest rate estimates for each APM subsystem:

### Span Storage (OpenSearch)

Spans are the raw building blocks of traces. Each span document is indexed into `otel-v1-apm-span-*` indices in OpenSearch.

| Output | Formula |
|--------|---------|
| **Spans / month** | `traces_per_month × avg_spans_per_trace` |
| **Retained spans** | `spans_per_month × (retention_days ÷ 30)` |
| **Storage** | `retained_spans × avg_span_size × 2.0` (the 2.0× factor accounts for OpenSearch index overhead — field mappings, inverted indices, doc values) |
| **Ingest rate** | `spans_per_month ÷ 30 ÷ 86400` (spans/sec) |

### Service Map (OpenSearch)

Data Prepper's `service_map_stateful` processor emits a document for every observed directed edge (service A → service B) every 180 seconds. These are indexed into `otel-v2-apm-service-map-*`.

| Output | Formula |
|--------|---------|
| **Directed edges** | `services × (services - 1)` (worst-case: every service calls every other) |
| **Docs / month** | `edges × (86400 ÷ 180) × 30` |
| **Storage** | `docs × 104 bytes × 2.0` (104 bytes is the measured average service map document size) |

### RED Metrics (Prometheus)

Data Prepper computes Rate, Error, and Duration metrics per service-operation pair and pushes them to Prometheus via OTLP. Each operation generates **16 time series**: `request_count`, `error_count`, `fault_count`, plus ~12 histogram buckets with `_sum` and `_count`.

| Output | Formula |
|--------|---------|
| **Active series** | `services × ops_per_service × 16` |
| **Samples / month** | `series × (30 × 24 × 3600 ÷ 60)` (one sample per series per minute) |
| **Storage** | `samples × 2 bytes` (Prometheus TSDB compression) |

### Totals

The calculator sums OpenSearch storage (spans + service map) and Prometheus storage separately, and computes a combined ingest rate in documents/sec.

## Inputs

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| Traces (requests) / month | 1.25M | 100K – 1B | Total traces (requests) your applications generate per month |
| Avg span payload size | 0.5 KB | 0.1 – 50 KB | Average size of a single span document before indexing |
| Avg spans per trace | 8 | 1 – 200 | How many spans make up one trace on average |
| Number of services | 10 | 1 – 1000 | Distinct instrumented services in your environment |
| Avg operations per service | 5 | 1 – 100 | Distinct operation names (endpoints/handlers) per service |
| Retention period | 15 days | 1 – 365 days | How long span data is retained in OpenSearch |

## Key assumptions

- **Index overhead 2.0×** — OpenSearch stores field mappings, inverted indices, doc values, and segment metadata alongside raw documents. The 2× multiplier is a conservative estimate for span-shaped documents with many string attributes.
- **Service map window 180s** — Data Prepper's `service_map_stateful` processor uses a default window of 180 seconds. One document per directed edge per window.
- **Service map doc size 104 bytes** — measured average from production `otel-v2-apm-service-map-*` indices.
- **RED series = 16 per operation** — includes `request_count`, `error_count`, `fault_count`, duration histogram buckets (~12), `_sum`, and `_count`.
- **Prometheus compression ~2 bytes/sample** — TSDB block compression ratio for typical time-series workloads.
- **Worst-case service map** — the calculator assumes every service communicates with every other service. Real topologies are typically sparser, so actual service map storage will be lower.

## Tips for right-sizing

1. **Start with spans/month** — this is the dominant cost driver. Check your current OTel Collector metrics (`otelcol_exporter_sent_spans`) or Data Prepper metrics to get a baseline.
2. **Measure your actual span size** — run `GET otel-v1-apm-span-*/_stats` and divide `store.size_in_bytes` by `docs.count` for your real average.
3. **Retention drives linear storage growth** — doubling retention doubles span storage. Consider [Index State Management (ISM)](https://opensearch.org/docs/latest/im-plugin/ism/index/) policies for automated rollover and deletion.
4. **Service map is usually small** — even with 100 services, service map storage is typically under 1 GB. Focus optimization efforts on span storage.
5. **RED metrics are lightweight** — Prometheus storage for APM metrics is typically a small fraction of total resource usage unless you have thousands of services with many operations each.
