---
title: "Python"
description: "Instrument Python applications with OpenTelemetry to send traces, metrics, and logs to the observability stack"
---

This guide covers adding OpenTelemetry instrumentation to Python applications. Python has mature OTel support with auto-instrumentation for popular frameworks and libraries.

## Prerequisites

- Python 3.8+
- OTel Collector running at `localhost:4317` (gRPC) or `localhost:4318` (HTTP)
- pip or poetry for package management

:::tip[Upstream documentation]
For comprehensive API reference and advanced usage, see the [official OpenTelemetry Python documentation](https://opentelemetry.io/docs/languages/python/).
:::

## Install dependencies

Install the core SDK and OTLP gRPC exporter:

```bash
pip install opentelemetry-sdk \
  opentelemetry-exporter-otlp-proto-grpc \
  opentelemetry-api
```

For auto-instrumentation, also install:

```bash
pip install opentelemetry-distro opentelemetry-instrumentation
opentelemetry-bootstrap -a install
```

The `opentelemetry-bootstrap` command detects installed libraries and installs matching instrumentation packages automatically.

## SDK setup

Configure traces, metrics, and logs in a `setup_telemetry` function called at application startup:

```python
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter

def setup_telemetry(service_name: str = "my-service"):
    resource = Resource.create({
        "service.name": service_name,
        "service.version": "1.0.0",
        "deployment.environment": "development",
    })

    # Traces
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint="localhost:4317", insecure=True)
        )
    )
    trace.set_tracer_provider(tracer_provider)

    # Metrics
    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint="localhost:4317", insecure=True),
        export_interval_millis=2000,
    )
    meter_provider = MeterProvider(
        resource=resource, metric_readers=[metric_reader]
    )
    metrics.set_meter_provider(meter_provider)

    # Logs
    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(
            OTLPLogExporter(endpoint="localhost:4317", insecure=True)
        )
    )

    return tracer_provider, meter_provider, logger_provider
```

Call `setup_telemetry()` before any other application code runs.

## Auto-instrumentation

The fastest way to instrument a Python application is with the `opentelemetry-instrument` CLI wrapper:

```bash
opentelemetry-instrument \
  --service_name my-service \
  --exporter_otlp_endpoint localhost:4317 \
  --exporter_otlp_insecure true \
  python app.py
```

This automatically patches supported libraries (requests, urllib3, Flask, Django, FastAPI, SQLAlchemy, psycopg2, redis, and more) without any code changes.

To see which instrumentations are available for your installed packages:

```bash
opentelemetry-bootstrap -a requirements
```

## Manual instrumentation

### Creating spans

```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

def process_order(order_id: str):
    with tracer.start_as_current_span("process_order") as span:
        span.set_attribute("order.id", order_id)
        span.set_attribute("order.type", "standard")

        # Child span
        with tracer.start_as_current_span("validate_payment"):
            validate_payment(order_id)

        span.add_event("order_processed", {"order.id": order_id})
```

### Recording metrics

```python
from opentelemetry import metrics

meter = metrics.get_meter(__name__)

request_counter = meter.create_counter(
    name="http.server.request_count",
    description="Number of HTTP requests",
    unit="1",
)

request_duration = meter.create_histogram(
    name="http.server.duration",
    description="HTTP request duration",
    unit="ms",
)

def handle_request():
    request_counter.add(1, {"http.method": "GET", "http.route": "/api/orders"})
    # ... handle request, then record duration
    request_duration.record(45.2, {"http.method": "GET", "http.route": "/api/orders"})
```

### Emitting logs

```python
import logging
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry._logs import set_logger_provider
from opentelemetry.instrumentation.logging import LoggingInstrumentor

# Bridge Python logging to OTel
LoggingInstrumentor().instrument(set_logging_format=True)

logger = logging.getLogger(__name__)
logger.info("Order processed", extra={"order.id": "12345"})
```

## Framework integration

### FastAPI

```python
from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

app = FastAPI()

# Auto-instrument FastAPI
FastAPIInstrumentor.instrument_app(app)

@app.get("/orders/{order_id}")
async def get_order(order_id: str):
    return {"order_id": order_id}
```

Alternatively, use the ASGI middleware directly:

```python
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware

app = FastAPI()
app = OpenTelemetryMiddleware(app)
```

### Flask

```python
from flask import Flask
from opentelemetry.instrumentation.flask import FlaskInstrumentor

app = Flask(__name__)
FlaskInstrumentor().instrument_app(app)

@app.route("/orders/<order_id>")
def get_order(order_id):
    return {"order_id": order_id}
```

### Django

```python
# settings.py
INSTALLED_APPS = [
    "opentelemetry.instrumentation.django",
    # ... other apps
]
```

Or instrument programmatically:

```python
from opentelemetry.instrumentation.django import DjangoInstrumentor
DjangoInstrumentor().instrument()
```

## Gen-AI semantic conventions

For AI/ML applications, use the OpenTelemetry semantic conventions for generative AI to capture LLM interactions.

:::tip[Use the GenAI Python SDK]
For AI agent applications, the [Python SDK](/docs/sdks/python/) (`opensearch-genai-observability-sdk-py`) provides purpose-built instrumentation with one-line setup, the `@observe` decorator for tracing agents and tools, `enrich()` for GenAI attributes, evaluation scoring, and auto-instrumentation for OpenAI, Anthropic, Bedrock, LangChain, and more. It handles all the GenAI semantic conventions automatically.
:::

If you prefer manual instrumentation:

```python
with tracer.start_as_current_span("llm.chat") as span:
    span.set_attribute("gen_ai.system", "openai")
    span.set_attribute("gen_ai.request.model", "gpt-4")
    span.set_attribute("gen_ai.request.temperature", 0.7)
    span.set_attribute("gen_ai.request.max_tokens", 1000)

    response = client.chat.completions.create(...)

    span.set_attribute("gen_ai.response.model", response.model)
    span.set_attribute("gen_ai.usage.input_tokens", response.usage.prompt_tokens)
    span.set_attribute("gen_ai.usage.output_tokens", response.usage.completion_tokens)
```

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name | `my-service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint | `http://localhost:4317` |
| `OTEL_EXPORTER_OTLP_INSECURE` | Disable TLS for gRPC | `true` |
| `OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED` | Bridge Python logs to OTel | `true` |
| `OTEL_TRACES_SAMPLER` | Sampler type | `parentbased_traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampler argument | `0.1` |
| `OTEL_PYTHON_DISABLED_INSTRUMENTATIONS` | Comma-separated list of instrumentations to skip | `flask,django` |

## Related links

- [Python SDK](/docs/sdks/python/) — purpose-built instrumentation for AI agent applications
- [Applications overview](/docs/send-data/applications/)
- [Auto-instrumentation](/docs/send-data/opentelemetry/auto-instrumentation/)
- [Manual instrumentation](/docs/send-data/opentelemetry/manual-instrumentation/)
- [Agent traces](/docs/investigate/discover-traces/)
- [OpenTelemetry Python documentation](https://opentelemetry.io/docs/languages/python/) -- Official OTel Python SDK reference
- [Python instrumentation libraries](https://opentelemetry.io/ecosystem/registry/?language=python&component=instrumentation) -- Available auto-instrumentation packages
