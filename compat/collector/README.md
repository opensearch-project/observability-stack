# Compat Collector

Developer notes for `otel-collector-compat` and [`config.compat.yaml`](./config.compat.yaml).

For migration guides and usage, see the public docs: https://observability.opensearch.org/docs/send-data/from-vendor/

## Role

Accepts vendor wire protocols on their native ports, translates to the OpenTelemetry data model via upstream [`opentelemetry-collector-contrib`](https://github.com/open-telemetry/opentelemetry-collector-contrib) receivers, and forwards OTLP to the base collector. All enrichment, filtering, and downstream routing (Data Prepper, Prometheus) happens in the base collector config.

```
vendor apps ──▶ otel-collector-compat ──OTLP──▶ otel-collector (base)
                [config.compat.yaml]            [unchanged]
```

The compat config contains only receivers, the `batch` processor, and an OTLP exporter pointed at the base collector. No transforms.

## Receivers

| Receiver | Upstream |
|----------|----------|
| `datadog` | [`datadogreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/datadogreceiver) |
| `statsd` | [`statsdreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/statsdreceiver) |
| `jaeger` | [`jaegerreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/jaegerreceiver) |
| `splunk_hec` | [`splunkhecreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/splunkhecreceiver) |

Pipeline wiring lives in [`config.compat.yaml`](./config.compat.yaml) under `service.pipelines`.

## Local dev workflow

Edit `config.compat.yaml`, then:

```bash
docker compose restart otel-collector-compat
docker compose logs -f otel-collector-compat
```

The `debug` exporter is wired into every pipeline. To see what's flowing through, bump its verbosity to `detailed`:

```yaml
exporters:
  debug:
    verbosity: detailed
```

## Resource limits

Default memory limit: 256MB (`COMPAT_COLLECTOR_MEMORY_LIMIT`). Idle usage is typically under 100MB.
