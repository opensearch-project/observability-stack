---
title: Ingest Your First Traces
description: Instrument an application and verify traces in OpenSearch Dashboards
---

This quickstart is for an application that is already running locally. If you
are new to the stack, start with the [installation guide](/docs/get-started/installation/)
and confirm that the OTel Collector is accepting telemetry on port `4317`.

## 1. Choose an instrumentation path

For an APM workflow, start with auto-instrumentation. It creates framework and
client spans without requiring changes to application code. Use manual
instrumentation when you need custom business spans or your framework is not
supported.

### Python

```bash
pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-bootstrap -a install

export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_SERVICE_NAME="orders-service"
opentelemetry-instrument python app.py
```

### Node.js

```bash
npm install @opentelemetry/auto-instrumentations-node \
  @opentelemetry/sdk-node \
  @opentelemetry/exporter-trace-otlp-grpc

export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_SERVICE_NAME="orders-service"
node --require @opentelemetry/auto-instrumentations-node/register app.js
```

### Java

```bash
curl -L -o opentelemetry-javaagent.jar \
  https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar

export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4317"
export OTEL_SERVICE_NAME="orders-service"
java -javaagent:opentelemetry-javaagent.jar -jar app.jar
```

See [Auto-Instrumentation](/docs/send-data/opentelemetry/auto-instrumentation/)
for .NET, Ruby, Go eBPF, configuration options, and supported libraries.

## 2. Manual instrumentation (Python)

Use this smaller example when you want to see how spans are created explicitly.

```bash
pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp
```

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

exporter = OTLPSpanExporter(endpoint="http://localhost:4317", insecure=True)
provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("my-app")

with tracer.start_as_current_span("handle-request") as span:
    span.set_attribute("http.method", "GET")
    span.set_attribute("http.url", "/api/users")

    with tracer.start_as_current_span("query-database") as child:
        child.set_attribute("db.system", "postgresql")
        # your database query here
```

For manual instrumentation in other languages, see the [application guides](/docs/send-data/applications/).

## 3. Generate and verify a trace

Send at least one request to the instrumented application. For example:

```bash
curl http://localhost:8080/health
```

Then open [OpenSearch Dashboards](http://localhost:5601) and:

1. Navigate to **Observability** → **Traces**.
2. Search for your trace by name or filter by time range.
3. Click a trace to see the span tree, timing, and attributes.

If the trace does not appear within a few seconds, check the
[APM troubleshooting guide](/docs/apm/troubleshooting/) before changing your
application code.

## Next steps

- [Explore Application Monitoring](/docs/get-started/quickstart/application-monitoring/) - open the service map, services catalog, and RED metrics
- [OpenTelemetry Demo Application](/docs/get-started/quickstart/otel-demo/) - explore a realistic distributed system
- [Create Your First Dashboard](/docs/get-started/quickstart/first-dashboard/) - build custom visualizations
- [Agent Tracing](/docs/ai-observability/agent-tracing/) - trace AI agent workflows with GenAI semantic conventions
- [Send Data](/docs/send-data/) - more instrumentation options
