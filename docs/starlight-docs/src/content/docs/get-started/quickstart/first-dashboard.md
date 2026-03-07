---
title: Create Your First Dashboard
description: Build your first observability dashboard in OpenSearch Dashboards
---

This guide walks you through creating a custom dashboard in OpenSearch Dashboards to visualize your observability data.

## Prerequisites

- The Observability Stack is running
- You have trace or metric data flowing (see [Ingest Your First Traces](/docs/get-started/quickstart/first-traces/))

## Step 1: Open Dashboards

Navigate to `http://localhost:5601` and go to **Dashboards** > **Create new**.

## Step 2: Add a visualization

1. Select **Add** > **Create new visualization**.
2. Choose a visualization type (line chart, bar chart, data table, etc.).
3. Select your data source:
   - For trace data: use the `otel-v1-apm-span-*` index pattern
   - For metrics: use a Prometheus data source with PromQL
4. Configure your query and axes.
5. Select **Save and return**.

## Step 3: Add more panels

Common panels for an observability dashboard:
- **Request rate**: Count of spans over time
- **Error rate**: Spans where `status.code = 2` over time
- **P99 latency**: 99th percentile of `durationInNanos`
- **Service map**: Embedded service map visualization

## Step 4: Save the dashboard

Select **Save**, give your dashboard a name, and optionally add it to an Observability workspace.

## Next steps

- [Dashboards](/docs/dashboards/) — advanced dashboard features
- [Discover Metrics](/docs/investigate/discover-metrics/) — PromQL-based metric exploration
