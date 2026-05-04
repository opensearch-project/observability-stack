---
title: "Jaeger"
description: "Migrate Jaeger-instrumented applications to observability-stack"
---

Send traces from Jaeger-instrumented applications to observability-stack by changing the OTLP endpoint (modern apps) or enabling the compat overlay (legacy `jaeger-client-*` apps). No application code changes required.

:::note
Jaeger is an open-source CNCF project rather than a proprietary vendor. This page lives in the vendor section because users migrating from Jaeger deployments typically look here.
:::

## Which path applies to your apps?

| If your apps use... | Use |
|---------------------|-----|
| OpenTelemetry SDKs (`opentelemetry-*`) with an OTLP exporter | The **OTLP path** below. No compat overlay required. |
| Archived `jaeger-client-*` libraries (jaeger-client-go, jaeger-client-java, jaeger-client-python, etc.) | The **legacy wire protocol path** below. Enable the compat overlay. |

## OTLP path

Change the OTLP exporter endpoint in your apps to observability-stack's base collector:

```bash
# gRPC
OTEL_EXPORTER_OTLP_ENDPOINT=http://<observability-stack-host>:4317

# HTTP
OTEL_EXPORTER_OTLP_ENDPOINT=http://<observability-stack-host>:4318
```

OTLP traffic arrives at the base collector's `otlp` receiver, which is a pure ingest path — no attribute translation happens here. Your apps' telemetry lands in OpenSearch exactly as your OpenTelemetry SDK produces it.

### Try it with the bundled hotrod demo

With the compat overlay enabled (see the [overview](/docs/send-data/from-vendor/)), a pre-configured Jaeger hotrod demo is available on port 8080. It emits OTLP directly to the base collector — the same path your apps will take.

```bash
curl http://localhost:8080/dispatch?customer=123
```

This produces a multi-service trace (frontend → customer → driver → route → redis → mysql) visible in OpenSearch Dashboards under **Trace Analytics**.

## Legacy wire protocol path

Applications using `jaeger-client-*` libraries send Jaeger's native wire protocol. With the compat overlay enabled, observability-stack accepts these via the upstream [`jaegerreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/jaegerreceiver), which translates to the OpenTelemetry data model using [`pkg/translator/jaeger`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/pkg/translator/jaeger).

| Protocol | Default port | Upstream stability |
|----------|--------------|--------------------|
| Thrift HTTP | 14268/tcp | Beta |
| gRPC (Jaeger protobuf) | 14250/tcp | Beta |

### Configuration

Example for `jaeger-client-go` using Thrift HTTP:

```bash
JAEGER_ENDPOINT=http://<observability-stack-host>:14268/api/traces
```

Other `jaeger-client-*` libraries expose similar endpoint overrides. Consult each library's documentation for specifics.

The `jaeger-client-*` libraries are archived upstream and no longer receive patches. The long-term migration path is to OpenTelemetry SDKs with OTLP export.

### Deployment modes

1. **Greenfield** — compat collector binds Jaeger ports 14250 and 14268.
2. **Side-by-side** — Jaeger Collector and compat collector run simultaneously via port remapping (`COMPAT_JAEGER_THRIFT_HTTP_PORT`, `COMPAT_JAEGER_GRPC_PORT`). Useful for A/B validation during migration.
3. **Full replacement** — Jaeger Collector decommissioned, compat collector on 14250/14268.

## Not covered

- Jaeger query UI — use OpenSearch Dashboards' APM and Discover Traces views.
- Jaeger-specific storage backends (Cassandra, Elasticsearch, badger) — data writes to OpenSearch via Data Prepper.
- Jaeger's dependency graph — OpenSearch Dashboards has a service map.

## References

- [`jaegerreceiver` README](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/jaegerreceiver)
- [Jaeger hotrod demo](https://github.com/jaegertracing/jaeger/tree/main/examples/hotrod)
