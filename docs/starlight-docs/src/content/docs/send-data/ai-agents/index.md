---
title: "AI Agents"
description: "Instrument AI agent applications with the GenAI Observability SDKs"
---

The GenAI Observability SDKs provide purpose-built instrumentation for AI agent applications. They handle the gap between general-purpose OpenTelemetry and what agent developers actually need: tracing orchestration logic, capturing GenAI semantic attributes, and and evaluating agent quality, all through the standard OTLP pipeline.

## Why use the SDK?

General OTel instrumentation (covered in the [Python](/docs/send-data/applications/python/) and [Node.js](/docs/send-data/applications/nodejs/) guides) traces HTTP calls, database queries, and framework handlers. But it doesn't know about your agent's decision-making, tool calls, or LLM interactions.

The GenAI SDKs add:

- **One-line OTEL setup** - `register()` configures the traces and logs exporters and auto-instrumentation in one call
- **`@observe` decorator** - trace agents, tools, and LLM calls with GenAI semantic convention attributes automatically
- **`enrich()`** - set model, tokens, provider, and other GenAI attributes on the active span without manual `set_attribute()` calls
- **Auto-instrumentation** - OpenAI, Anthropic, Bedrock, LangChain, and 20+ libraries traced with zero code changes
- **Evaluations** - `score()`, `evaluate()` and `Benchmark` record `gen_ai.evaluation.result` events linked to the traces, for [Agent Evaluations](/docs/agent-evals/)
- **AWS SigV4** - production-ready signing for OpenSearch Ingestion and OpenSearch Service

## Available SDKs

| Language | Package | Status |
|---|---|---|
| Python | [`opensearch-genai-observability-sdk-py`](https://github.com/opensearch-project/genai-observability-sdk-py) | Available |
| JavaScript / TypeScript | [`@opensearch-project/genai-observability-sdk-ts`](https://github.com/opensearch-project/genai-observability-sdk-ts) | Available |

## Quick example

```python
from opensearch_genai_observability_sdk_py import Op, enrich, mark_agent_root, observe, register

register(service_name="my-agent")

@observe(op=Op.EXECUTE_TOOL)
def search(query: str) -> list:
    return search_api.query(query)

@observe(name="research_agent", op=Op.INVOKE_AGENT)
def agent(question: str, conversation_id: str) -> str:
    mark_agent_root()
    enrich(model="gpt-4o", provider="openai", session_id=conversation_id)
    results = search(question)
    return summarize(results)
```

This produces one trace per question, rooted at the agent span, with `gen_ai.operation.name`, `gen_ai.agent.name`, `gen_ai.tool.name`, input and output capture, and `gen_ai.conversation.id` for Sessions, all with standard OTel semantic conventions.

## Prompt for your coding agent

The [Python](/docs/send-data/ai-agents/python/#prompt-for-your-coding-agent) and [TypeScript](/docs/send-data/ai-agents/typescript/#prompt-for-your-coding-agent) SDK pages have a copyable prompt that instruments your agent for Agent Traces and Agent Evaluations with your coding agent.

## Next steps

- [Python SDK reference](/docs/send-data/ai-agents/python/) - full API documentation
- [TypeScript SDK reference](/docs/send-data/ai-agents/typescript/) - full API documentation
- [AI Observability - Getting Started](/docs/ai-observability/getting-started/) - end-to-end walkthrough from install to seeing traces
- [Framework integrations](/docs/send-data/ai-agents/integrations/) - Strands, LangGraph, CrewAI, OpenAI Agents, Bedrock
- [Agent Evals Quickstart](/docs/agent-evals/quickstart/) - first offline and online evaluation results
- [Evaluation & Scoring](/docs/agent-evals/evaluation/) - score traces, run test suites, compare agent versions
