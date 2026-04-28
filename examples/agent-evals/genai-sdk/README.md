# Agent Evals — strands-evals + OpenSearch

Run LLM-as-judge evaluations on agent traces stored in OpenSearch. Scores are written back as OTel spans and appear in the same trace waterfall as the original agent.

## How it works

1. `OpenSearchProvider` (from `strands-agents-evals`) fetches the trace by session or trace ID. It wraps `genai-observability-sdk-py` under the hood, so the same retrieval code works across CloudWatch, Langfuse, and OpenSearch backends.
2. `HelpfulnessEvaluator` runs Bedrock Claude as the judge.
3. `score()` (from `genai-observability-sdk-py`) emits the result as an OTel GenAI score span back to OpenSearch.

## Prerequisites

- observability-stack running (`docker compose up`) with trace data indexed.
- AWS credentials with Bedrock access (default: `us.anthropic.claude-sonnet-4-20250514-v1:0`).

## Setup

```bash
uv sync
```

## Usage

```bash
# By session (conversation) ID
uv run python main.py <session_id>

# By trace ID
uv run python main.py --trace-id <trace_id>
```

Score spans appear in OpenSearch Dashboards on the same trace as the agent spans, tagged with `test.suite.run.id`, `test.case.id`, and `test.case.result.status` (pass/fail).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPENSEARCH_HOST` | `https://localhost:9200` | OpenSearch endpoint |
| `OPENSEARCH_USER` / `OPENSEARCH_PASS` | `admin` / `My_password_123!@#` | Basic auth |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `localhost:4317` | OTel Collector gRPC |
| `EVAL_JUDGE_MODEL` | `us.anthropic.claude-sonnet-4-20250514-v1:0` | Bedrock model ID |

## Applies to any agent framework

Works against any agent emitting OTel GenAI semantic convention spans (Strands, LangChain, CrewAI, plain OTel SDK). `OpenSearchProvider` handles retrieval; the evaluator does not care which framework produced the traces.

## Related

- [strands-agents/evals](https://github.com/strands-agents/evals) — evaluator library + provider interfaces.
- [opensearch-project/genai-observability-sdk-py](https://github.com/opensearch-project/genai-observability-sdk-py) — retrieval (`OpenSearchTraceRetriever`) and score write-back (`score()`).
- For continuous background scoring without Bedrock, see [`docker-compose/agent-eval-canary/`](../../../docker-compose/agent-eval-canary/).
