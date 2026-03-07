---
title: AI Observability
description: Observe and debug AI agent workflows with OpenTelemetry GenAI conventions
---

The Observability Stack provides specialized tooling for observing AI agent workflows, built on the OpenTelemetry GenAI semantic conventions.

## Capabilities

- **Agent tracing**: Visualize LLM agent execution as trace trees, DAG graphs, and timelines
- **GenAI semantic conventions**: Standard `gen_ai.*` attributes for model, tokens, tools, and conversations
- **MCP server**: Query OpenSearch from AI agents via the built-in Model Context Protocol server
- **Python and JavaScript SDKs**: Instrument your AI applications with purpose-built SDKs

## How it works

AI agent traces use the same OpenTelemetry infrastructure as service traces. Your application emits spans with `gen_ai.*` attributes, which flow through the OTel Collector and Data Prepper into OpenSearch. The Agent Traces plugin in OpenSearch Dashboards provides purpose-built views for exploring these traces.

## Getting started

- [Agent Tracing](/docs/ai-observability/agent-tracing/) — the Agent Traces UI in OpenSearch Dashboards
- [Agent Graph & Path](/docs/ai-observability/agent-tracing/graph/) — DAG visualization, trace tree, and timeline views
- [MCP Server](/docs/mcp/) — query OpenSearch from AI agents via MCP
- [Python SDK](/docs/sdks/python/) — instrument Python AI applications
- [JavaScript SDK](/docs/sdks/javascript/) — instrument JavaScript AI applications
