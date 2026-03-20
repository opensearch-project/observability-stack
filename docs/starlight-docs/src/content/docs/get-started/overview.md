---
title: Platform Overview
description: Architecture and data flow overview for OpenSearch Observability Stack
---

The OpenSearch Observability Stack is built on open standards with OpenTelemetry at its core. Every component is open-source and runs in Docker containers on your machine.

## End-to-End Platform

From code to insight — the platform covers the full AI observability lifecycle:

```mermaid
flowchart LR
    subgraph instrument["1 &nbsp; Instrument"]
        direction TB
        A1["<b>GenAI SDK</b><br/>In-code instrumentation,<br/>agents, tools, one-line OTEL,<br/>SigV4 auto-detect"]
    end
    subgraph normalize["2 &nbsp; Normalize"]
        direction TB
        B1["<b>OTEL Collector</b><br/>Standardize spans &<br/>attributes, semantic<br/>conventions, enrichment"]
    end
    subgraph local["3 &nbsp; Local Tooling"]
        direction TB
        C1["<b>Agent Health & Evals</b><br/>Local debugging, scoring,<br/>evaluations, trace inspection"]
    end
    subgraph process["4 &nbsp; Process"]
        direction TB
        D1["<b>OTEL Middleware</b><br/>Metrics, topology map,<br/>service maps, trace<br/>correlation & aggregation"]
    end
    subgraph analyze["5 &nbsp; Analyze"]
        direction TB
        E1["<b>OpenSearch Analytics<br/>& Dashboards</b><br/>Logs, metrics, traces,<br/>agent traces, evals,<br/>APM, correlations"]
    end
    instrument --> normalize --> process --> analyze
    normalize --> local
    local --> process
```

## Architecture

![Architecture diagram showing microservices and infrastructure sending OTLP to the OTel Collector, which exports to Data Prepper. Data Prepper writes to OpenSearch and Prometheus, both queried by OpenSearch Dashboards.](/docs/images/apm/architecture.png)

## Data flow

1. **Instrument**: Your applications emit traces, logs, and metrics using the [GenAI SDK](/docs/send-data/ai-agents/python/) or standard OpenTelemetry instrumentation.
2. **Normalize**: The OTel Collector batches, processes, and standardizes telemetry using semantic conventions.
3. **Local Tooling**: [Agent Health](/docs/agent-health/) provides local debugging, evaluation scoring, and trace inspection during development.
4. **Process**: Data Prepper ingests trace data, builds service maps, and computes RED metrics (request rate, error rate, duration).
5. **Analyze**: OpenSearch indexes traces, logs, and evaluation results. Prometheus stores time-series metrics. OpenSearch Dashboards provides trace exploration, agent trace views, PromQL-based metric charts, and service maps.

## Key design decisions

- **OpenTelemetry-native**: All data ingestion uses OTel protocols and semantic conventions. No proprietary agents.
- **GenAI semantic conventions**: AI agent traces use the standard `gen_ai.*` OTel attributes, enabling interoperability with any OTel-compatible tool.
- **PPL and PromQL**: Query traces and logs with PPL (Piped Processing Language) and metrics with PromQL.
- **Local-first**: The entire stack runs on your machine via Docker Compose. No cloud account or external dependencies required.
