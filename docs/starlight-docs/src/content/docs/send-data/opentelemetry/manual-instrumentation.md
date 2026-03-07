---
title: "Manual Instrumentation"
description: "Add custom spans, metrics, and logs with the OpenTelemetry SDK"
---

Manual instrumentation gives you full control over what telemetry your application produces. Use it to add custom spans for business logic, record application-specific metrics, and emit structured logs with trace correlation.

Manual instrumentation complements [auto-instrumentation](/docs/send-data/opentelemetry/auto-instrumentation/). Auto-instrumentation covers framework-level operations (HTTP handlers, database calls), while manual instrumentation covers your domain logic.

## When to Use Manual Instrumentation

- Tracking business operations (order placement, payment processing, AI agent invocations)
- Adding custom attributes to spans (user ID, tenant, feature flags)
- Recording application-specific metrics (queue depth, cache hit ratio, token usage)
- Emitting structured logs correlated with the active trace
- Instrumenting code that auto-instrumentation does not cover

## Prerequisites

- OTel SDK installed for your language
- The observability stack running with the OTel Collector on ports 4317/4318

:::tip[Upstream documentation]
For language-specific manual instrumentation guides, see the [OpenTelemetry manual instrumentation documentation](https://opentelemetry.io/docs/concepts/instrumentation/manual/).
:::

## Provider Setup

Before creating telemetry, configure the three provider types. This example uses Python with OTLP gRPC exporters:

```python
from opentelemetry import trace, metrics, _logs
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter

# Shared resource identifies this service
resource = Resource.create({
    "service.name": "weather-agent",
    "service.version": "1.0.0",
    "deployment.environment": "production",
})

# Traces
tracer_provider = TracerProvider(resource=resource)
tracer_provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter())
)
trace.set_tracer_provider(tracer_provider)

# Metrics
metric_reader = PeriodicExportingMetricReader(
    OTLPMetricExporter(),
    export_interval_millis=10000,
)
meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
metrics.set_meter_provider(meter_provider)

# Logs
logger_provider = LoggerProvider(resource=resource)
logger_provider.add_log_record_processor(
    BatchLogRecordProcessor(OTLPLogExporter())
)
_logs.set_logger_provider(logger_provider)
```

The `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable configures the exporter endpoint. If not set, it defaults to `http://localhost:4317`.

## Creating Spans

Spans represent units of work. Every span has a name, start/end time, status, and optional attributes.

### Basic Span

```python
tracer = trace.get_tracer("my-app", "1.0.0")

with tracer.start_as_current_span("process-order") as span:
    span.set_attribute("order.id", order_id)
    span.set_attribute("order.total", total_amount)
    result = process_order(order_id)
    span.set_attribute("order.status", result.status)
```

### Nested Spans

Child spans automatically inherit the parent context:

```python
with tracer.start_as_current_span("handle-request"):
    # This span is a child of "handle-request"
    with tracer.start_as_current_span("validate-input"):
        validate(request)

    with tracer.start_as_current_span("execute-query"):
        results = db.query(sql)
```

### Span Kinds

Set the span kind to describe the role of the operation:

```python
from opentelemetry.trace import SpanKind

# Client calling an external service
with tracer.start_as_current_span("call-payment-api", kind=SpanKind.CLIENT) as span:
    span.set_attribute("rpc.system", "http")
    response = http_client.post(payment_url, data=payload)

# Internal processing (default)
with tracer.start_as_current_span("compute-discount", kind=SpanKind.INTERNAL):
    discount = calculate_discount(user)
```

| Kind | Use Case |
|------|----------|
| `SERVER` | Handling an incoming request |
| `CLIENT` | Making an outgoing request |
| `PRODUCER` | Enqueueing a message |
| `CONSUMER` | Processing a message from a queue |
| `INTERNAL` | Internal operation (default) |

### Error Recording

```python
from opentelemetry.trace import StatusCode

with tracer.start_as_current_span("risky-operation") as span:
    try:
        result = do_something()
    except Exception as e:
        span.set_status(StatusCode.ERROR, str(e))
        span.record_exception(e)
        raise
```

## Recording Metrics

Metrics capture numerical measurements over time.

```python
meter = metrics.get_meter("my-app", "1.0.0")

# Counter: monotonically increasing value
request_counter = meter.create_counter(
    name="http.server.request.count",
    description="Number of HTTP requests",
    unit="1",
)

# Histogram: distribution of values
latency_histogram = meter.create_histogram(
    name="http.server.request.duration",
    description="Request latency",
    unit="ms",
)

# Up-down counter: value that can increase and decrease
active_connections = meter.create_up_down_counter(
    name="http.server.active_requests",
    description="Number of active requests",
    unit="1",
)

# Record values with attributes
request_counter.add(1, {"http.request.method": "GET", "http.route": "/api/orders"})
latency_histogram.record(42.5, {"http.request.method": "GET", "http.route": "/api/orders"})
active_connections.add(1)
```

### Observable Gauges

For metrics that are read on demand (e.g., system stats, queue depth):

```python
def get_queue_depth(options):
    yield metrics.Observation(value=queue.size(), attributes={"queue.name": "orders"})

meter.create_observable_gauge(
    name="queue.depth",
    callbacks=[get_queue_depth],
    description="Current queue depth",
    unit="1",
)
```

## Structured Logging with Trace Correlation

OTel logs bridge your existing logging framework with the telemetry pipeline, adding trace and span IDs automatically.

### Python (logging module)

```python
import logging
from opentelemetry.instrumentation.logging import LoggingInstrumentor

# Enable trace context injection into log records
LoggingInstrumentor().instrument(set_logging_format=True)

logger = logging.getLogger(__name__)

with tracer.start_as_current_span("process-payment"):
    logger.info("Processing payment for order %s", order_id)
    # Log record automatically includes traceId, spanId, traceFlags
```

### Direct OTel Log Emission

```python
from opentelemetry._logs import get_logger, SeverityNumber

otel_logger = get_logger("my-app", "1.0.0")

otel_logger.emit(
    _logs.LogRecord(
        severity_number=SeverityNumber.INFO,
        body="Payment processed successfully",
        attributes={"order.id": order_id, "payment.method": "card"},
    )
)
```

## Gen-AI Semantic Conventions

For AI/LLM agent applications, OpenTelemetry defines [Gen-AI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) that the stack's Agent Traces UI relies on.

### Key Span Patterns

```python
# Top-level agent invocation (SpanKind.CLIENT)
with tracer.start_as_current_span("invoke_agent", kind=SpanKind.CLIENT) as span:
    span.set_attribute("gen_ai.system", "openai")
    span.set_attribute("gen_ai.request.model", "gpt-4o")

    # Tool execution within the agent (SpanKind.INTERNAL)
    with tracer.start_as_current_span("execute_tool", kind=SpanKind.INTERNAL) as tool_span:
        tool_span.set_attribute("gen_ai.tool.name", "get_weather")
        tool_span.set_attribute("gen_ai.tool.call.id", call_id)
        result = get_weather(location)
```

### Gen-AI Attribute Reference

| Attribute | Type | Description |
|-----------|------|-------------|
| `gen_ai.system` | string | AI provider (`openai`, `anthropic`, `bedrock`) |
| `gen_ai.request.model` | string | Model identifier (`gpt-4o`, `claude-sonnet-4-20250514`) |
| `gen_ai.response.model` | string | Actual model used in response |
| `gen_ai.request.temperature` | float | Sampling temperature |
| `gen_ai.request.max_tokens` | int | Maximum tokens requested |
| `gen_ai.usage.input_tokens` | int | Tokens in the prompt |
| `gen_ai.usage.output_tokens` | int | Tokens in the completion |
| `gen_ai.tool.name` | string | Name of the tool/function called |
| `gen_ai.tool.call.id` | string | Unique identifier for the tool call |
| `gen_ai.prompt` | string | The prompt sent (use with caution in production) |
| `gen_ai.completion` | string | The completion returned (use with caution in production) |

### Metrics for AI Applications

```python
meter = metrics.get_meter("ai-agent", "1.0.0")

token_counter = meter.create_counter(
    name="gen_ai.client.token.usage",
    description="Token usage by model",
    unit="token",
)

token_counter.add(
    prompt_tokens,
    {"gen_ai.system": "openai", "gen_ai.request.model": "gpt-4o", "gen_ai.token.type": "input"},
)
token_counter.add(
    completion_tokens,
    {"gen_ai.system": "openai", "gen_ai.request.model": "gpt-4o", "gen_ai.token.type": "output"},
)
```

## Graceful Shutdown

Always flush pending telemetry before your application exits:

```python
tracer_provider.shutdown()
meter_provider.shutdown()
logger_provider.shutdown()
```

For long-running services, register these in a shutdown hook (e.g., `atexit`, signal handler, or framework shutdown event).

## Related Links

- [Auto-Instrumentation](/docs/send-data/opentelemetry/auto-instrumentation/) -- Zero-code instrumentation setup
- [Collector Configuration](/docs/send-data/opentelemetry/collector/) -- Pipeline processing and export
- [Agent Traces](/docs/ai-observability/agent-tracing/) -- Visualize AI agent traces
- [Sampling Strategies](/docs/send-data/opentelemetry/sampling/) -- Control data volume
- [OpenTelemetry manual instrumentation](https://opentelemetry.io/docs/concepts/instrumentation/manual/) -- Official manual instrumentation concepts
- [OpenTelemetry API reference](https://opentelemetry.io/docs/specs/otel/) -- OTel specification and API reference
