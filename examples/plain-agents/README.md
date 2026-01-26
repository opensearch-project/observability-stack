# Plain Python Agent Examples

This directory contains plain Python agent examples with OpenTelemetry instrumentation for the AgentOps observability stack.

## Examples

### Weather Agent

A weather assistant demonstrating full Gen-AI semantic convention coverage:
- Three tools: current weather, forecast, historical
- Fault injection for debugging scenarios
- OTLP traces, metrics, and logs
- Token usage metrics

[View Weather Agent →](./weather-agent/)

## Prerequisites

- Python 3.9 or higher
- [uv](https://docs.astral.sh/uv/) package manager
- AgentOps stack running (see [docker-compose README](../../docker-compose/README.md))

## Quick Start

1. Start the AgentOps stack:
```bash
cd ../../docker-compose
docker compose up -d
```

2. Run an example:
```bash
cd weather-agent
uv run python main.py
```

3. View telemetry data:
- OpenSearch Dashboards: http://localhost:5601
- Prometheus: http://localhost:9090

## Learn More

- [OpenTelemetry Python Documentation](https://opentelemetry.io/docs/languages/python/)
- [Gen-AI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [AgentOps Documentation](../../README.md)
