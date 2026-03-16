# Agent Evals — GenAI Observability SDK

End-to-end evaluation loop: retrieve agent traces from OpenSearch, run LLM-as-judge evaluations, and write score spans back to OpenSearch.

## Prerequisites

- [observability-stack](../../) running (`docker compose up`)
- Agent traces indexed in OpenSearch (run any example agent first)
- AWS credentials configured for Bedrock access (only for LLM-as-judge mode, not needed with `--mock`)

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
# LLM-as-judge using Bedrock Claude (requires AWS credentials)
python main.py <conversation_id>

# Target a specific trace ID
python main.py --trace-id <trace_id>

# Mock evaluator (no AWS credentials needed, for testing the pipeline)
python main.py --mock <conversation_id>
python main.py --mock --trace-id <trace_id>
```

### Quick start (no AWS needed)

```bash
# 1. Run the observability-stack with example agents
cd ../.. && docker compose up -d

# 2. Wait for canary to generate traces, then grab a trace ID from Dashboards

# 3. Run mock eval against that trace
python main.py --mock --trace-id <trace_id>

# 4. Check OpenSearch Dashboards — the score span appears in the same trace
```

### LLM-as-judge (Bedrock)

Requires AWS credentials with Bedrock access (`aws configure` or env vars).

```bash
# Evaluate by conversation ID
python main.py conv_abc123

# Evaluate by trace ID
python main.py --trace-id d4479d70ec2aa787775b58cc65e77b88
```

Uses `HelpfulnessEvaluator` from [strands-agents/evals](https://github.com/strands-agents/evals) with Claude on Bedrock.

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
