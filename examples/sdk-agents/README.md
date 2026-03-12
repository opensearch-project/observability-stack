# SDK-Instrumented Agents

Agent examples instrumented with [`opensearch-genai-observability-sdk-py`](https://github.com/opensearch-project/genai-observability-sdk-py) — the OpenSearch GenAI observability SDK.

These are SDK-instrumented versions of the [`plain-agents`](../plain-agents/) examples, showing how `register()` + `observe()` + `enrich()` replace manual OpenTelemetry setup.

## Examples

| Example | Description |
|---------|-------------|
| [multi-agent-planner](multi-agent-planner/) | Travel planner orchestrator + events agent |

## Requirements

```bash
pip install "opensearch-genai-observability-sdk-py>=0.2.6"
```
