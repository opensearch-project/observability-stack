---
title: Quickstart
description: Send your first traces and explore them in dashboards
---

This quickstart walks you through sending trace data to the Observability Stack and viewing it in OpenSearch Dashboards.

## Prerequisites

Make sure the stack is running. If you haven't installed it yet, see [Get Started](/docs/get-started/).

## Step 1: Send traces

The fastest way to send traces is with the Python SDK:

```bash
pip install opensearch-genai-sdk-py
```

```python
from opensearch_genai_sdk_py import register, workflow, tool

register(endpoint="http://localhost:4318/v1/traces", service_name="my-app")

@tool(name="process_data")
def process_data(size: int) -> dict:
    return {"processed": size}

@workflow(name="my-first-workflow")
def run():
    return process_data(42)

run()
```

For other languages, see [Send Data](/docs/send-data/).

## Step 2: View traces

1. Open OpenSearch Dashboards at `http://localhost:5601`.
2. Navigate to **Observability** > **Traces**.
3. You should see your trace appear within a few seconds.

## Step 3: Explore the dashboard

From the Dashboards home, explore:
- **Traces**: Search and filter trace data with PPL queries.
- **Services**: View the auto-generated service map.
- **Metrics**: Query Prometheus metrics with PromQL.

## Next steps

- [Ingest Your First Traces](/docs/get-started/quickstart/first-traces/) — detailed trace instrumentation guide
- [Create Your First Dashboard](/docs/get-started/quickstart/first-dashboard/) — build custom visualizations
- [Agent Tracing](/docs/ai-observability/agent-tracing/) — trace AI agent workflows
