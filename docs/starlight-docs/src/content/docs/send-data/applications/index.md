---
title: "Instrument Applications"
description: "Add OpenTelemetry instrumentation to your application code to send traces, metrics, and logs to the observability stack"
---

Application instrumentation is the process of adding observability signals — traces, metrics, and logs — to your application code. The OpenSearch Observability Stack uses OpenTelemetry (OTel) as its standard instrumentation framework, giving you a vendor-neutral way to collect telemetry from any language.

## How it works

Your application uses an OpenTelemetry SDK to generate telemetry data and export it to the OTel Collector running alongside your stack:

```
Application (OTel SDK) → OTel Collector (localhost:4317/4318) → Data Prepper → OpenSearch
```

The Collector accepts data over two protocols:

| Protocol | Port | Use case |
|----------|------|----------|
| gRPC | `4317` | Server-side applications (recommended) |
| HTTP/protobuf | `4318` | Browser apps, environments where gRPC is unavailable |

## Auto vs. manual instrumentation

OpenTelemetry offers two approaches to instrumenting your code:

### Auto-instrumentation

Auto-instrumentation uses agents or require hooks to automatically capture telemetry from popular frameworks and libraries without code changes. This is the fastest way to get started.

**Best for**: Getting broad coverage quickly, standard web frameworks, database clients, HTTP libraries.

**Available for**: Python, Node.js, Java, .NET, Ruby, PHP.

### Manual instrumentation

Manual instrumentation gives you full control over what gets traced and measured. You create spans, record metrics, and emit logs explicitly in your code.

**Best for**: Custom business logic, AI/ML pipelines, agent workflows, fine-grained control.

**Available for**: All languages with an OpenTelemetry SDK.

### Combining both

Most production applications use both approaches together — auto-instrumentation for framework-level coverage and manual instrumentation for business-specific observability.

:::tip[Upstream documentation]
For a complete list of supported languages and their instrumentation status, see the [OpenTelemetry language APIs & SDKs](https://opentelemetry.io/docs/languages/).
:::

## Common environment variables

All OpenTelemetry SDKs respect a standard set of environment variables. You can configure instrumentation without code changes by setting these:

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Logical name of your service | `unknown_service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint URL | `http://localhost:4317` (gRPC) |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Export protocol (`grpc`, `http/protobuf`) | `grpc` |
| `OTEL_TRACES_EXPORTER` | Traces exporter (`otlp`, `none`) | `otlp` |
| `OTEL_METRICS_EXPORTER` | Metrics exporter (`otlp`, `none`) | `otlp` |
| `OTEL_LOGS_EXPORTER` | Logs exporter (`otlp`, `none`) | `otlp` |
| `OTEL_RESOURCE_ATTRIBUTES` | Comma-separated key=value resource attributes | — |
| `OTEL_TRACES_SAMPLER` | Sampler type (`always_on`, `traceidratio`, `parentbased_traceidratio`) | `parentbased_always_on` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampler argument (e.g., ratio `0.1`) | — |
| `OTEL_PROPAGATORS` | Context propagation formats | `tracecontext,baggage` |

Example using environment variables:

```bash
export OTEL_SERVICE_NAME="my-service"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_RESOURCE_ATTRIBUTES="deployment.environment=production,service.version=2.1.0"
```

## Resource attributes

Every telemetry signal includes resource attributes that identify the source. At minimum, set these:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `service.name` | Name of the service | `checkout-service` |
| `service.version` | Version of the service | `1.2.3` |
| `deployment.environment` | Deployment environment | `production` |

## Supported languages

Choose your language to get started:

| Language | Auto-instrumentation | Page | Upstream Docs |
|----------|---------------------|------|---------------|
| Python | Yes | [Python](/docs/send-data/applications/python/) | [OTel Python](https://opentelemetry.io/docs/languages/python/) |
| Node.js | Yes | [Node.js](/docs/send-data/applications/nodejs/) | [OTel JS](https://opentelemetry.io/docs/languages/js/) |
| Java | Yes | [Java](/docs/send-data/applications/java/) | [OTel Java](https://opentelemetry.io/docs/languages/java/) |
| Go | No (use middleware) | [Go](/docs/send-data/applications/go/) | [OTel Go](https://opentelemetry.io/docs/languages/go/) |
| .NET | Yes | [.NET](/docs/send-data/applications/dotnet/) | [OTel .NET](https://opentelemetry.io/docs/languages/dotnet/) |
| Ruby | Yes | [Ruby](/docs/send-data/applications/ruby/) | [OTel Ruby](https://opentelemetry.io/docs/languages/ruby/) |
| Browser / Frontend | Partial | [Browser](/docs/send-data/applications/browser/) | [OTel JS](https://opentelemetry.io/docs/languages/js/) |

## Related links

- [OpenTelemetry overview](/docs/send-data/opentelemetry/)
- [Auto-instrumentation](/docs/send-data/opentelemetry/auto-instrumentation/)
- [Manual instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/)
- [OTel Collector configuration](/docs/send-data/opentelemetry/collector/)
- [OpenTelemetry Language APIs & SDKs](https://opentelemetry.io/docs/languages/) -- All supported languages and instrumentation guides
