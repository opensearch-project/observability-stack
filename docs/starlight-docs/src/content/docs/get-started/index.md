---
title: Get Started
description: Install and run the OpenSearch Observability Stack
---

The OpenSearch Observability Stack is an open-source, OpenTelemetry-native observability platform. It runs locally via Docker Compose and provides traces, logs, metrics, dashboards, service maps, and AI agent tracing out of the box.

## Prerequisites

- **Docker** and **Docker Compose** (v2.20+)
- At least 8 GB of available RAM
- macOS, Linux, or WSL2 on Windows

## Installation

Run the interactive installer:

```bash
curl -fsSL https://raw.githubusercontent.com/opensearch-project/observability-stack/main/install.sh | bash
```

The installer TUI guides you through component selection and configuration. Once complete, the stack starts automatically.

## What gets installed

| Component | Purpose |
|-----------|---------|
| OpenTelemetry Collector | Receives traces, logs, and metrics via OTLP |
| Data Prepper | Processes traces, generates service maps and RED metrics |
| OpenSearch | Stores and indexes all observability data |
| Prometheus | Scrapes and stores time-series metrics |
| OpenSearch Dashboards | Visualizes data, agent traces, and service maps |

## Next steps

- [Platform Overview](/docs/get-started/overview/) — architecture and data flow
- [Core Concepts](/docs/get-started/core-concepts/) — key terms and ideas
- [Quickstart](/docs/get-started/quickstart/) — send your first traces
