# Examples

Instrumented agent examples for the Observability Stack. Each demonstrates OpenTelemetry tracing with [Gen-AI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/). Follow the README in each folder to try the example agents, which are fully instrumented with OpenTelemetry so you can explore agent traces and telemetry data in OpenSearch Dashboards.

## Examples

| Example | Framework | Description |
|---------|-----------|-------------|
| [plain-agents/weather-agent](./plain-agents/weather-agent/) | OpenTelemetry SDK | Standalone weather assistant with fault injection, OTLP traces/metrics/logs |
| [plain-agents/multi-agent-planner](./plain-agents/multi-agent-planner/) | OpenTelemetry SDK | Distributed travel planner with trace context propagation across sub-agents |
| [strands/code-assistant](./strands/code-assistant/) | Strands SDK | AI coding assistant with auto-instrumented GenAI spans |
| [langchain/bedrock-financial-assistant](./langchain/bedrock-financial-assistant/) | LangChain | Financial assistant using Bedrock Claude with automatic LangChain tracing |

## Prerequisites

- Python 3.9+, [uv](https://docs.astral.sh/uv/)
- Observability Stack running (`docker compose up -d` from repo root)

## Quick Start

The `plain-agents` examples run automatically with the stack. For standalone examples:

```bash
cd <example-dir>
uv run python main.py
```

View telemetry at:
- **OpenSearch Dashboards**: http://localhost:5601
- **Prometheus**: http://localhost:9090

## OTLP Endpoints

| Port | Protocol | Use With |
|------|----------|----------|
| 4317 | gRPC | OpenTelemetry SDK (`OTLPSpanExporter`) |
| 4318 | HTTP/protobuf | Strands SDK (`setup_otlp_exporter()`) |
