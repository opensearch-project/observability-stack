---
title: "Datadog"
description: "Accept Datadog agent and SDK telemetry in observability-stack"
---

Point Datadog agents, `dd-trace-*` SDKs, and DogStatsD clients at observability-stack by changing an endpoint URL or environment variable. No application code changes required.

## Which path applies to your setup?

| If you run... | Use |
|---------------|-----|
| Datadog Agent on your hosts, forwarding app traces | Reconfigure the agent (or route traffic to the compat collector on 8126). |
| Apps instrumented with a `dd-trace-*` SDK sending directly | Set `DD_AGENT_HOST` and related env vars on each app. |
| DogStatsD clients (`statsd`/`dogstatsd` libraries) | Point them at port 8125/udp. |

All three paths require the compat overlay to be enabled. See the [overview](/docs/send-data/from-vendor/).

## Protocol support

| Signal | Default port | Upstream stability |
|--------|--------------|--------------------|
| Traces | 8126/tcp | Alpha |
| Metrics | 8126/tcp | Development |
| Logs | 8126/tcp | Development |
| DogStatsD metrics | 8125/udp | Beta |

**Stability note:** "Development" is the least mature OpenTelemetry Collector stability tier. APIs and behavior may change without notice. Evaluate carefully before routing production metric or log traffic through the Datadog receiver. Traces are "Alpha" — more mature but still pre-Beta.

For current per-endpoint behavior, consult the upstream [`datadogreceiver` README](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/datadogreceiver).

## Configuration

### `dd-trace-*` SDKs

Datadog maintains tracer libraries for Python (`dd-trace-py`), Java (`dd-trace-java`), Go (`dd-trace-go`), Ruby (`dd-trace-rb`), JavaScript/Node (`dd-trace-js`), .NET (`dd-trace-dotnet`), and PHP (`dd-trace-php`). All support endpoint override via environment variables, though variable names may differ slightly by library.

Common environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DD_AGENT_HOST` | `localhost` | Agent hostname |
| `DD_TRACE_AGENT_PORT` | `8126` | Agent trace port |
| `DD_TRACE_AGENT_URL` | — | Full URL override (takes precedence) |
| `DD_SERVICE` | — | Service name (maps to OTel `service.name`) |
| `DD_ENV` | — | Environment (maps to OTel `deployment.environment`) |
| `DD_VERSION` | — | Version (maps to OTel `service.version`) |

```bash
export DD_AGENT_HOST=<observability-stack-host>
export DD_TRACE_AGENT_PORT=8126
export DD_SERVICE=my-service
export DD_ENV=prod
export DD_VERSION=1.2.3
```

Consult each library's documentation for language-specific configuration.

### Datadog Agent

If you run a Datadog Agent on your hosts, update its config to forward to observability-stack's compat collector, or change your app's `DD_AGENT_HOST` to bypass the agent entirely.

### DogStatsD clients

DogStatsD clients send UDP to port 8125. Most DogStatsD libraries accept `STATSD_HOST` / `STATSD_PORT` env vars or constructor arguments:

```bash
export STATSD_HOST=<observability-stack-host>
export STATSD_PORT=8125
```

observability-stack uses the upstream [`statsdreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/statsdreceiver), which supports DogStatsD tag extensions (`#tag1:value1,tag2:value2`).

## Canonical attribute mapping

These are the three Datadog fields with well-known, universally-used OTel equivalents — the [Datadog unified service tagging](https://docs.datadoghq.com/getting_started/tagging/unified_service_tagging/) fields.

| Datadog | OTel |
|---------|------|
| `service` | `service.name` |
| `env` | `deployment.environment` |
| `version` | `service.version` |

The receiver also performs internal translations for HTTP, database, gRPC, and AWS SDK spans that don't require user action. For all other attributes, consult the upstream [`datadogreceiver` README](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/datadogreceiver) and Datadog's [tagging documentation](https://docs.datadoghq.com/getting_started/tagging/).

## Deployment modes

1. **Greenfield** — observability-stack binds port 8126; no Datadog Agent on the host.
2. **Side-by-side** — Datadog Agent on 8126, compat collector on a remapped port. Set `COMPAT_DATADOG_APM_PORT=8127` and configure a subset of apps with `DD_TRACE_AGENT_PORT=8127`. Useful for A/B validation during migration.
3. **Full replacement** — Datadog Agent decommissioned, observability-stack on 8126.

## Verify

Send a DogStatsD metric and confirm the compat collector accepts it:

```bash
echo "test.metric:1|c|#env:test" | nc -u -w1 localhost 8125
```

For traces, point a `dd-trace-*` application at observability-stack and dispatch a request. Traces appear under **APM** or **Discover Traces** in OpenSearch Dashboards within seconds.

## Caveats

- **128-bit trace IDs** are feature-gated upstream (`receiver.datadogreceiver.Enable128BitTraceID`, off by default). Traces originating in an OpenTelemetry-instrumented service and passing through a Datadog-instrumented service may not correlate without this flag.
- **Metric temporality:** `dd-trace-*` emits delta metrics. Some backends expect cumulative. Add a [`deltatocumulativeprocessor`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/deltatocumulativeprocessor) to the pipeline if needed.

## Not covered

- Live processes, profiling, network monitoring — no open-source OpenTelemetry receivers exist for these Datadog products.
- Synthetic monitoring — not a telemetry-ingest concern.
- Datadog UI features (notebooks, SLOs, monitors) — use OpenSearch Dashboards equivalents.

## References

- [`datadogreceiver` README](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/datadogreceiver)
- [`statsdreceiver` README](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/statsdreceiver)
- [Datadog unified service tagging](https://docs.datadoghq.com/getting_started/tagging/unified_service_tagging/)
