# Agent Evals — GenAI Observability SDK

End-to-end evaluation loop: retrieve agent traces from OpenSearch, run LLM-as-judge evaluations, and write score spans back to OpenSearch.

## Prerequisites

- [observability-stack](../../) running (`docker compose up`)
- Agent traces indexed in OpenSearch (run any example agent first)
- AWS credentials configured for Bedrock access (used by the evaluator)

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
# By conversation ID (gen_ai.conversation.id)
python main.py <conversation_id>

# By trace ID
python main.py <trace_id>
```

## How it works

1. Retrieves agent traces from OpenSearch using `OpenSearchTraceRetriever` from [genai-observability-sdk-py](https://github.com/opensearch-project/genai-observability-sdk-py)
2. Converts traces to [strands-agents/evals](https://github.com/strands-agents/evals) `Session` format
3. Runs `HelpfulnessEvaluator` (LLM-as-judge via Bedrock Claude)
4. Writes evaluation scores back to OpenSearch as OTel spans via `score()`

Score spans appear in the same trace waterfall as the original agent spans, with attributes following the [OTel GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-events/).

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `OPENSEARCH_HOST` | `https://localhost:9200` | OpenSearch endpoint |
| `OPENSEARCH_USER` | `admin` | OpenSearch username |
| `OPENSEARCH_PASS` | `My_password_123!@#` | OpenSearch password |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `localhost:4317` | OTel Collector gRPC endpoint |
| `OTEL_SERVICE_NAME` | `genai-evals` | Service name for score spans |

## Architecture

```
Agent traces (OpenSearch) → Retrieve → Evaluate (Bedrock) → Score spans → OpenSearch
```

Works with any agent framework (Strands, LangChain, CrewAI, plain OTel SDK) that emits GenAI semantic convention spans.
