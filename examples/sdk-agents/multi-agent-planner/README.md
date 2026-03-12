# Multi-Agent Travel Planner — SDK Instrumented

This is the SDK-instrumented version of [`plain-agents/multi-agent-planner`](../../plain-agents/multi-agent-planner/). It uses [`opensearch-genai-observability-sdk-py`](https://github.com/opensearch-project/genai-observability-sdk-py) to replace manual OpenTelemetry setup with three primitives:

- **`register()`** — one-line OTel pipeline setup (TracerProvider, exporter, auto-instrumentation)
- **`observe()`** — decorator + context manager for creating traced spans
- **`enrich()`** — add GenAI attributes to the active span

## What Changed

### Setup: 30 lines → 1 line

**Before (manual OTel):**
```python
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource

resource = Resource.create({
    "service.name": "travel-planner",
    "service.version": "1.0.0",
    "gen_ai.agent.id": AGENT_ID,
    "gen_ai.agent.name": AGENT_NAME,
})
tracer_provider = TracerProvider(resource=resource)
tracer_provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True))
)
trace.set_tracer_provider(tracer_provider)
tracer = trace.get_tracer("travel-planner")
```

**After (SDK):**
```python
from opensearch_genai_observability_sdk_py import register
register(endpoint="http://localhost:4318/v1/traces", service_name="travel-planner")
```

### Span creation: 10 lines → 2 lines

**Before:**
```python
with tracer.start_as_current_span("chat", kind=SpanKind.INTERNAL) as chat_span:
    chat_span.set_attribute("gen_ai.operation.name", "chat")
    chat_span.set_attribute("gen_ai.system", provider)
    chat_span.set_attribute("gen_ai.request.model", model)
    chat_span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
    chat_span.set_attribute("gen_ai.usage.output_tokens", output_tokens)
    chat_span.set_attribute("gen_ai.response.finish_reasons", ["tool_calls"])
```

**After:**
```python
with observe("planning", op=Op.CHAT):
    enrich(provider=provider, model=model, input_tokens=1500, output_tokens=300, finish_reason="tool_calls")
```

## Trace Compatibility

The SDK produces identical `gen_ai.*` attributes as the manual version. Verified by capturing JSON spans from both and diffing:

- **50 identical attributes** across 9 spans
- **0 value differences**
- **8 additional attributes** (SDK auto-captures function input/output and sets `gen_ai.agent.name` on chat spans)

## Requirements

```bash
pip install "opensearch-genai-observability-sdk-py>=0.2.6"
```

## Files

| File | Description | Replaces |
|------|-------------|----------|
| `orchestrator.py` | Travel planner orchestrator | `plain-agents/.../orchestrator/main.py` |
| `events_agent.py` | Events sub-agent | `plain-agents/.../events-agent/main.py` |

> Note: The MCP server (`mcp-server/main.py`) is unchanged — it's infrastructure, not agent code.
> The weather agent from `plain-agents/weather-agent/` can be instrumented the same way.
