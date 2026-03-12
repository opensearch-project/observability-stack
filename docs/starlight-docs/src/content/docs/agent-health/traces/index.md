---
title: "Trace Visualization"
description: "Real-time trace monitoring and comparison for AI agent executions in Agent Health"
sidebar:
  order: 6
---

Agent Health provides built-in trace visualization for monitoring and debugging AI agent executions. If your agent emits OpenTelemetry traces, Agent Health can display them alongside evaluation results.

:::note
Agent Health's trace visualization is separate from the [Agent Traces](/docs/ai-observability/agent-tracing/) plugin in OpenSearch Dashboards. Agent Traces is a Dashboards plugin for exploring trace data stored in OpenSearch indices. Agent Health traces are accessed through the Agent Health UI and focus on evaluation-related trace analysis.
:::

## Live trace monitoring

Navigate to **Traces** in the sidebar for real-time trace monitoring:

- **Live tailing** — auto-refresh traces every 10 seconds with pause/resume controls
- **Agent filter** — filter traces by specific agent
- **Text search** — search span names and attributes

## View modes

Toggle between visualization modes using the view selector:

| View | Best For | Description |
|------|----------|-------------|
| **Timeline** | Detailed timing analysis | Hierarchical span tree with duration bars |
| **Flow** | DAG visualization | Graph-based view of span relationships |

Click the **Maximize** button on any trace visualization to open full-screen mode with a larger visualization area, detailed span attributes panel, and collapsible sections for complex traces.

## Trace comparison

The comparison view supports side-by-side trace analysis:

- **Aligned view** — spans from different runs aligned by similarity
- **Merged view** — combined flow visualization showing all traces
- **Horizontal/Vertical orientation** — toggle layout for your preference

## Enabling trace collection

To collect traces from your agent:

1. Set `useTraces: true` in your agent configuration:

```typescript
// agent-health.config.ts
export default {
  agents: [
    {
      key: "my-agent",
      name: "My Agent",
      endpoint: "http://localhost:8000/agent",
      connectorType: "rest",
      models: ["claude-sonnet-4"],
      useTraces: true,  // Enable trace collection
    }
  ],
};
```

2. Configure the OpenSearch traces endpoint in your `.env` file:

```bash
OPENSEARCH_LOGS_ENDPOINT=https://your-cluster.opensearch.amazonaws.com
OPENSEARCH_LOGS_TRACES_INDEX=otel-v1-apm-span-*
OPENSEARCH_LOGS_USERNAME=admin
OPENSEARCH_LOGS_PASSWORD=your_password
```

3. Run an evaluation, then navigate to **Traces** and select your agent from the filter.

:::tip
Traces may take 2-5 minutes to propagate after execution. Use the refresh button to re-fetch.
:::
