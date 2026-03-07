---
title: "Sampling Strategies"
description: "Control telemetry volume with head-based and tail-based sampling"
---

Sampling determines which traces are recorded and exported. In production environments with high request volumes, exporting every trace is often impractical -- it increases storage costs, network bandwidth, and processing load. Sampling lets you retain a representative subset of traces while ensuring important traces (errors, slow requests) are always captured.

## Prerequisites

- Familiarity with the [OTel Collector configuration](/docs/send-data/opentelemetry/collector/)
- Understanding of [OpenTelemetry traces](/docs/send-data/opentelemetry/)

## Head-Based vs Tail-Based Sampling

| Aspect | Head-Based | Tail-Based |
|--------|-----------|------------|
| Decision point | At trace start (first span) | After trace completes |
| Information available | Trace ID, parent context | All spans, status, duration |
| Resource cost | Low (per-span check) | High (must buffer full traces) |
| Implementation | SDK-level | Collector-level |
| Can filter by outcome | No | Yes (errors, latency, etc.) |

**Head-based sampling** decides at the moment a trace begins whether to record it. The decision is fast and cheap but cannot account for what happens later in the trace.

**Tail-based sampling** waits until all spans in a trace have arrived, then decides based on the complete picture. This is more powerful but requires buffering entire traces in the Collector.

## Sampling and APM Service Maps

:::caution
Data Prepper's `otel_apm_service_map` processor needs **all traces** to compute RED metrics (Rate, Errors, Duration) and build accurate service maps. If you sample at the SDK or Collector level, the service map will be incomplete and RED metrics will be inaccurate.

**Recommendation:** For APM users, keep the SDK sampler at `always_on` and let Data Prepper handle sampling after service map processing.

The recommended data flow for APM users:

```
SDK (always_on) → Collector (no sampling) → Data Prepper (service map → sample) → OpenSearch
```
:::

## Sampling with the OTel SDK

Head-based samplers run inside the OTel SDK in your application process.

### AlwaysOn / AlwaysOff

```bash
# Record everything (default)
export OTEL_TRACES_SAMPLER="always_on"

# Record nothing
export OTEL_TRACES_SAMPLER="always_off"
```

### TraceIdRatioBased

Samples a fixed percentage of traces based on the trace ID. The decision is deterministic -- the same trace ID always produces the same decision, ensuring consistency across services.

```bash
# Sample 10% of traces
export OTEL_TRACES_SAMPLER="traceidratio"
export OTEL_TRACES_SAMPLER_ARG="0.1"
```

In code (Python):

```python
from opentelemetry.sdk.trace.sampling import TraceIdRatioBased

sampler = TraceIdRatioBased(rate=0.1)  # 10%
tracer_provider = TracerProvider(sampler=sampler, resource=resource)
```

| Rate | Traces Kept | Use Case |
|------|-------------|----------|
| `1.0` | 100% | Development, low-traffic services |
| `0.1` | 10% | Medium-traffic production |
| `0.01` | 1% | High-traffic production |
| `0.001` | 0.1% | Very high-traffic (>10K rps) |

### ParentBased

Wraps another sampler and respects the parent span's sampling decision. This ensures that if a parent service decided to sample a trace, all downstream services also sample it, maintaining trace completeness.

```bash
# Sample 10% of root spans; follow parent decision for child spans
export OTEL_TRACES_SAMPLER="parentbased_traceidratio"
export OTEL_TRACES_SAMPLER_ARG="0.1"
```

In code (Python):

```python
from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased

sampler = ParentBased(root=TraceIdRatioBased(rate=0.1))
tracer_provider = TracerProvider(sampler=sampler, resource=resource)
```

**ParentBased is the recommended default for most deployments.** It prevents broken traces where some services sample a request and others do not.

The `parentbased_traceidratio` sampler works as follows:

1. If the incoming request has a sampled parent context, **always sample** (keep the trace).
2. If the incoming request has an unsampled parent context, **never sample** (drop the trace).
3. If there is no parent context (root span), apply the `TraceIdRatioBased` decision.

For a deeper dive, see the [OpenTelemetry sampling concepts documentation](https://opentelemetry.io/docs/concepts/sampling/).

## Sampling in the OTel Collector

Tail-based sampling runs in the OTel Collector using the `tail_sampling` processor. It buffers complete traces and applies policy-based decisions.

### Basic Configuration

```yaml
processors:
  tail_sampling:
    decision_wait: 30s
    num_traces: 100000
    expected_new_traces_per_sec: 1000
    policies:
      - name: keep-errors
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: keep-slow
        type: latency
        latency:
          threshold_ms: 5000
      - name: sample-rest
        type: probabilistic
        probabilistic:
          sampling_percentage: 10
```

### Policy Types

| Policy | Description | Example |
|--------|-------------|---------|
| `status_code` | Keep traces with specific status codes | Keep all errors |
| `latency` | Keep traces exceeding a latency threshold | Keep traces > 5s |
| `probabilistic` | Random percentage sampling | Keep 10% of remaining |
| `string_attribute` | Match a span attribute value | Keep traces from `payment-service` |
| `rate_limiting` | Cap traces per second | Max 100 traces/sec |
| `always_sample` | Keep all traces (used with composite) | Fallback policy |
| `composite` | Combine multiple policies with rates | Complex multi-rule sampling |

### Policy Evaluation

Policies are evaluated in order. A trace is kept if **any** policy matches. The first matching policy determines the outcome. Use this to build an "always keep errors and slow traces, sample the rest" strategy:

1. `keep-errors` -- Always keep error traces
2. `keep-slow` -- Always keep slow traces
3. `sample-rest` -- Probabilistically sample everything else

### Composite Sampling

For fine-grained control, use the `composite` policy to combine sub-policies with rate limits:

```yaml
processors:
  tail_sampling:
    decision_wait: 30s
    policies:
      - name: composite-policy
        type: composite
        composite:
          max_total_spans_per_second: 5000
          policy_order: [errors-policy, slow-policy, general-policy]
          composite_sub_policy:
            - name: errors-policy
              type: status_code
              status_code:
                status_codes: [ERROR]
            - name: slow-policy
              type: latency
              latency:
                threshold_ms: 2000
            - name: general-policy
              type: always_sample
          rate_allocation:
            - policy: errors-policy
              percent: 50
            - policy: slow-policy
              percent: 30
            - policy: general-policy
              percent: 20
```

This allocates 50% of the span budget to errors, 30% to slow traces, and 20% to a random sample of everything else.

### Adding Tail Sampling to the Pipeline

Add the `tail_sampling` processor to the traces pipeline in your Collector configuration:

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [resourcedetection, memory_limiter, tail_sampling, batch]
      exporters: [otlp/opensearch, debug]
```

Place `tail_sampling` before `batch` -- it needs to see individual spans before they are grouped.

### Resource Considerations

Tail-based sampling requires buffering complete traces in memory:

| Setting | Default | Description |
|---------|---------|-------------|
| `decision_wait` | 30s | Time to wait for all spans in a trace |
| `num_traces` | 50000 | Maximum traces held in memory |
| `expected_new_traces_per_sec` | 0 | Used to pre-allocate memory |

Increase `decision_wait` if your traces have long-running spans (e.g., batch jobs). Increase `num_traces` proportionally with traffic volume. Monitor the Collector's memory usage via its Prometheus metrics endpoint (port 8888).

For more on Collector data transformation, see the [OTel Collector transforming telemetry guide](https://opentelemetry.io/docs/collector/transforming-telemetry/).

## Sampling in Data Prepper

Data Prepper provides its own sampling processors that run after trace analytics processing. This is the recommended sampling point when using APM features.

### Aggregate processor for rate-based sampling

The `aggregate` processor can perform rate-based sampling after the service map processor has seen all traces. This ensures RED metrics and service maps are computed from the full trace data before any traces are dropped.

```yaml
pipeline:
  source:
    otel_trace_source:
      ssl: false
  processor:
    - otel_apm_service_map:
        window_duration: 180
    - aggregate:
        identification_keys: ["traceId"]
        action:
          tail_sampler:
            percent: 20
            wait_period: "10s"
            condition: '/status == "ERROR" or /durationInNanos > 5000000000'
  sink:
    - opensearch:
        hosts: ["https://opensearch:9200"]
        index_type: trace-analytics-raw
```

### Pipeline placement

Sampling processors MUST come AFTER `otel_apm_service_map` in the pipeline. The service map processor needs to see all traces to compute accurate RED metrics. Once service map data is computed, you can safely sample before writing to OpenSearch. Placing a sampling processor before the service map processor will result in incomplete service maps and inaccurate rate, error, and duration calculations.

### Full pipeline with sampling

A complete Data Prepper configuration with trace analytics and sampling:

```yaml
otel-trace-pipeline:
  source:
    otel_trace_source:
      ssl: false
  processor:
    - otel_apm_service_map:
        window_duration: 180
    - aggregate:
        identification_keys: ["traceId"]
        action:
          tail_sampler:
            percent: 20
            wait_period: "10s"
            condition: '/status == "ERROR" or /durationInNanos > 5000000000'
  sink:
    - opensearch:
        hosts: ["https://opensearch:9200"]
        index_type: trace-analytics-raw

service-map-pipeline:
  source:
    pipeline:
      name: "otel-trace-pipeline"
  processor:
    - service_map:
  sink:
    - opensearch:
        hosts: ["https://opensearch:9200"]
        index_type: trace-analytics-service-map
```

## Production Recommendations

### APM users: Sample in Data Prepper

If you use APM service maps or the Services dashboard, sample in Data Prepper rather than at the SDK or Collector level. SDK-level and Collector-level sampling will discard traces before Data Prepper can process them, leading to incomplete service maps and inaccurate RED metrics.

- Keep the SDK sampler at `always_on`
- Skip Collector-level sampling
- Let Data Prepper handle sampling after the `otel_apm_service_map` processor

### Low Traffic (< 100 rps)

Use `always_on` (the default). Keep all traces for full visibility.

```bash
export OTEL_TRACES_SAMPLER="always_on"
```

### Medium Traffic (100-1000 rps)

Use `parentbased_traceidratio` at the SDK level:

```bash
export OTEL_TRACES_SAMPLER="parentbased_traceidratio"
export OTEL_TRACES_SAMPLER_ARG="0.1"
```

### High Traffic (> 1000 rps)

Combine head-based and tail-based sampling:

1. **SDK**: Set `parentbased_traceidratio` to 0.05 (5%) to reduce Collector load
2. **Collector**: Add `tail_sampling` to keep all errors and slow traces from the 5% that reach the Collector

If you are using APM service maps, prefer Data Prepper sampling instead. Set the SDK to `always_on` and configure the `aggregate` processor in Data Prepper to sample after the service map processor has computed RED metrics.

```bash
# SDK-level
export OTEL_TRACES_SAMPLER="parentbased_traceidratio"
export OTEL_TRACES_SAMPLER_ARG="0.05"
```

```yaml
# Collector-level
processors:
  tail_sampling:
    decision_wait: 30s
    policies:
      - name: errors
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow
        type: latency
        latency:
          threshold_ms: 3000
      - name: baseline
        type: probabilistic
        probabilistic:
          sampling_percentage: 20
```

### Metrics and Logs

Sampling applies only to traces. Metrics are pre-aggregated and do not benefit from sampling. Logs can be filtered at the Collector using the `filter` processor rather than sampled.

### Choosing a sampling strategy

```
1. Do you use APM Service Maps?
   → Yes: Sample in Data Prepper (after service map processing)
   → No: Continue to step 2

2. What is your traffic volume?
   → Low (< 100 rps): Use always_on (no sampling needed)
   → Medium (100-1000 rps): Use parentbased_traceidratio at SDK level
   → High (> 1000 rps): Combine SDK ratio sampling + Collector tail sampling
```

## Related Links

- [OpenTelemetry Sampling Concepts](https://opentelemetry.io/docs/concepts/sampling/) -- Upstream OTel sampling documentation
- [OTel Collector Transforming Telemetry](https://opentelemetry.io/docs/collector/transforming-telemetry/) -- Collector processing reference
- [Collector Configuration](/docs/send-data/opentelemetry/collector/) -- Full pipeline config walkthrough
- [Auto-Instrumentation](/docs/send-data/opentelemetry/auto-instrumentation/) -- Set sampler via environment variables
- [Manual Instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/) -- Configure samplers in code
- [Data Prepper Pipeline](/docs/send-data/data-pipeline/data-prepper/) -- Data Prepper configuration
- [Send Data Overview](/docs/send-data/) -- Ingestion architecture
