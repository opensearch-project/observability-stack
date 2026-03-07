---
title: "Auto-Instrumentation"
description: "Zero-code instrumentation for popular frameworks and languages using OpenTelemetry agents"
---

Auto-instrumentation adds observability to your application without code changes. OpenTelemetry provides language-specific agents and hooks that intercept framework calls (HTTP servers, database clients, message queues) and automatically generate traces, metrics, and logs.

This is the fastest way to start sending telemetry to the observability stack.

## Prerequisites

- The observability stack running with the OTel Collector accepting OTLP on ports 4317 (gRPC) and 4318 (HTTP)
- The target application using a supported framework

:::tip[Upstream documentation]
For a complete overview of zero-code instrumentation across all languages, see the [OpenTelemetry zero-code instrumentation documentation](https://opentelemetry.io/docs/zero-code/).
:::

## Environment Variables

All OTel auto-instrumentation agents share a common set of environment variables:

| Variable | Example | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | Collector endpoint (gRPC default) |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` | Transport protocol (`grpc` or `http/protobuf`) |
| `OTEL_SERVICE_NAME` | `payment-service` | Logical service name shown in dashboards |
| `OTEL_RESOURCE_ATTRIBUTES` | `service.version=1.2.0,deployment.environment=prod` | Comma-separated key=value resource attributes |
| `OTEL_TRACES_SAMPLER` | `parentbased_traceidratio` | Sampler type (see [Sampling](/docs/send-data/opentelemetry/sampling/)) |
| `OTEL_TRACES_SAMPLER_ARG` | `0.1` | Sampler argument (e.g., 10% sample rate) |
| `OTEL_LOGS_EXPORTER` | `otlp` | Log exporter (`otlp` or `none`) |
| `OTEL_METRICS_EXPORTER` | `otlp` | Metrics exporter (`otlp` or `none`) |

Set these variables before starting your application. They apply to every language below.

## Python

Install the OpenTelemetry Python packages and auto-instrumentation libraries:

```bash
pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-bootstrap -a install
```

The `opentelemetry-bootstrap` command detects installed libraries (Flask, Django, requests, SQLAlchemy, etc.) and installs their corresponding instrumentation packages.

Run your application with the `opentelemetry-instrument` wrapper:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_SERVICE_NAME="order-service"

opentelemetry-instrument python app.py
```

For frameworks with their own runners:

```bash
opentelemetry-instrument flask run
opentelemetry-instrument gunicorn app:app --workers 4
opentelemetry-instrument uvicorn app:app --host 0.0.0.0
```

### Supported Libraries

Common auto-instrumented Python libraries include: Flask, Django, FastAPI, requests, httpx, urllib3, SQLAlchemy, psycopg2, redis, celery, grpcio, boto3, and Kafka.

## Java

Download the OpenTelemetry Java agent JAR:

```bash
curl -L -o opentelemetry-javaagent.jar \
  https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar
```

Attach the agent using the `-javaagent` JVM flag:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_SERVICE_NAME="checkout-service"

java -javaagent:opentelemetry-javaagent.jar -jar app.jar
```

The agent automatically instruments Spring Boot, JAX-RS, JDBC, Hibernate, Kafka, gRPC, Netty, Servlet, and 100+ other libraries.

### Configuration via System Properties

Java agent settings can also be passed as system properties:

```bash
java -javaagent:opentelemetry-javaagent.jar \
  -Dotel.exporter.otlp.endpoint=http://localhost:4317 \
  -Dotel.service.name=checkout-service \
  -Dotel.resource.attributes=service.version=2.1.0 \
  -jar app.jar
```

## Node.js

Install the OpenTelemetry Node.js packages:

```bash
npm install @opentelemetry/auto-instrumentations-node \
            @opentelemetry/sdk-node \
            @opentelemetry/exporter-trace-otlp-grpc \
            @opentelemetry/exporter-metrics-otlp-grpc
```

Use the `--require` flag to load instrumentation before your application code:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_SERVICE_NAME="frontend-service"

node --require @opentelemetry/auto-instrumentations-node/register app.js
```

This instruments Express, Fastify, Koa, http/https, pg, mysql, redis, ioredis, MongoDB, gRPC, and more.

### TypeScript / ts-node

```bash
ts-node --require @opentelemetry/auto-instrumentations-node/register app.ts
```

### ESM Applications

For ES module applications, use the `--import` flag:

```bash
node --import @opentelemetry/auto-instrumentations-node/register app.mjs
```

## .NET

Install the OpenTelemetry .NET auto-instrumentation package:

```bash
# Linux / macOS
curl -L -o otel-dotnet.sh \
  https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation/releases/latest/download/otel-dotnet-auto-install.sh
sh otel-dotnet.sh
```

Configure and run:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_SERVICE_NAME="inventory-service"

# Source the environment setup script installed by the package
. $HOME/.otel-dotnet-auto/instrument.sh

dotnet run
```

The startup hook instruments ASP.NET Core, HttpClient, SqlClient, Entity Framework, gRPC, and other .NET libraries.

### Docker

For containerized .NET applications, add the agent in your Dockerfile:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0
COPY --from=otel/autoinstrumentation-dotnet:latest /autoinstrumentation /otel
ENV CORECLR_ENABLE_PROFILING=1
ENV CORECLR_PROFILER={918728DD-259F-4A6A-AC2B-B85E1B658318}
ENV CORECLR_PROFILER_PATH=/otel/linux-x64/OpenTelemetry.AutoInstrumentation.Native.so
ENV DOTNET_ADDITIONAL_DEPS=/otel/AdditionalDeps
ENV DOTNET_SHARED_STORE=/otel/store
ENV DOTNET_STARTUP_HOOKS=/otel/net/OpenTelemetry.AutoInstrumentation.StartupHook.dll
ENV OTEL_DOTNET_AUTO_HOME=/otel
```

## Go

Go auto-instrumentation uses eBPF to instrument applications at the kernel level, without modifying your binary:

```bash
# Install the Go auto-instrumentation agent
go install go.opentelemetry.io/auto/cmd/instrumentation@latest
```

Run the agent alongside your Go application:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_SERVICE_NAME="shipping-service"

# Start your Go application
./shipping-service &
APP_PID=$!

# Attach the eBPF instrumentation
sudo instrumentation -pid $APP_PID
```

The eBPF agent instruments `net/http`, `google.golang.org/grpc`, and `database/sql`. Since it operates at the kernel level, it requires elevated privileges.

For most Go applications, [manual instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/) is preferred because it provides finer control and does not require root access.

## Verifying Instrumentation

After starting your instrumented application, verify that telemetry is flowing:

1. **Check Collector logs** -- If the `debug` exporter is enabled, you should see spans, metrics, and logs in the Collector stdout.

2. **Send a test request** to your application:
   ```bash
   curl http://localhost:8080/api/health
   ```

3. **Query OpenSearch** for the trace:
   ```json
   GET otel-v1-apm-span-*/_search
   {
     "query": {
       "term": { "serviceName": "your-service-name" }
     }
   }
   ```

4. **Open OpenSearch Dashboards** and navigate to the [Services](/docs/apm/services/) view to see your application.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No spans in OpenSearch | Wrong endpoint | Verify `OTEL_EXPORTER_OTLP_ENDPOINT` points to the Collector |
| Spans appear but no metrics | Metrics exporter disabled | Set `OTEL_METRICS_EXPORTER=otlp` |
| Missing library spans | Instrumentation not installed | Run `opentelemetry-bootstrap -a install` (Python) or verify agent JAR (Java) |
| Service name shows "unknown_service" | `OTEL_SERVICE_NAME` not set | Set the environment variable before starting the app |
| gRPC connection refused | Protocol mismatch | Use port 4317 for gRPC, port 4318 for HTTP |

## Related Links

- [Manual Instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/) -- Add custom spans and metrics
- [Collector Configuration](/docs/send-data/opentelemetry/collector/) -- OTel Collector pipeline setup
- [Sampling Strategies](/docs/send-data/opentelemetry/sampling/) -- Control telemetry volume
- [Applications](/docs/send-data/applications/) -- Language-specific application guides
- [OpenTelemetry zero-code instrumentation](https://opentelemetry.io/docs/zero-code/) -- Official zero-code instrumentation guide
- [OTel instrumentation registry](https://opentelemetry.io/ecosystem/registry/?component=instrumentation) -- Browse available instrumentation packages
