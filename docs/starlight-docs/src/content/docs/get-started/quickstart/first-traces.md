---
title: Ingest Your First Traces
description: Instrument your application to send traces to the Observability Stack
---

This guide shows how to instrument a Python application with OpenTelemetry and send traces to the Observability Stack.

## Install dependencies

```bash
pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp
```

## Configure the exporter

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

# Point to the OTel Collector
exporter = OTLPSpanExporter(endpoint="http://localhost:4317", insecure=True)

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("my-app")
```

## Create spans

```python
with tracer.start_as_current_span("handle-request") as span:
    span.set_attribute("http.method", "GET")
    span.set_attribute("http.url", "/api/users")

    with tracer.start_as_current_span("query-database") as child:
        child.set_attribute("db.system", "postgresql")
        # your database query here
```

## Verify in Dashboards

1. Open `http://localhost:5601`.
2. Go to **Observability** > **Traces**.
3. Search for your trace by name or filter by time range.
4. Click a trace to see the span tree, timing, and attributes.

## Next steps

- [Create Your First Dashboard](/docs/get-started/quickstart/first-dashboard/)
- [Send Data](/docs/send-data/) — more instrumentation options
