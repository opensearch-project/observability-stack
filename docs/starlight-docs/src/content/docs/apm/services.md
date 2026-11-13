---
title: Services
description: Browse the service catalog, inspect service health, and drill into operations and dependencies
sidebar:
  order: 20
---

The Services page provides a catalog of all instrumented services along with their health metrics, operations, and dependencies. The catalog also lists the [external dependencies](#external-dependencies) that your services call, such as databases, message brokers, and external HTTP endpoints.

## Accessing the Services page

1. Open OpenSearch Dashboards.
2. Navigate to **Observability** > **Application Monitoring** > **Services**.

## Services home page

![Services home page showing top fault rate panels, filters sidebar, and Service Catalog table](/docs/images/apm/services-home.png)

### Top services by fault rate

A panel at the top of the page highlights the services with the highest fault rate (5xx errors), so you can quickly identify the most problematic services.

### Top dependency paths by fault rate

A second panel shows the dependency paths (service → downstream service) with the highest fault rates, helping you pinpoint where failures propagate.

### Service Catalog table

The main table lists all instrumented services and their external dependencies:

| Column | Description |
|---|---|
| **Service** | Service name with an icon. A service shows its SDK language icon. A dependency shows the icon of its system (for example, PostgreSQL, Kafka, or Redis) or a generic database, messaging, or external icon |
| **Correlations** | Three icon buttons linking to correlated spans, logs, and service attributes |
| **Avg Latency (P99)** | 99th percentile latency averaged over the selected time range |
| **Avg throughput** | Average request throughput, displayed as a bar chart |
| **Avg failure ratio** | Average failure ratio, displayed as a bar chart |
| **Environment** | The deployment environment for the service |
| **Type** | **Service**, **Database**, **Messaging**, or **External**. Appears only when the catalog contains external dependencies |

### Filters sidebar

Use the left-hand filters to narrow down the catalog:

- **Type** - filter by **Service**, **Database**, **Messaging**, or **External**. Appears only when the catalog contains external dependencies
- **Environment** - filter by deployment environment
- **Latency** - range slider to set minimum and maximum latency thresholds
- **Throughput** - range slider to set minimum and maximum throughput thresholds
- **Failure ratio** - bucket filters: < 1%, 1–5%, > 5%
- **Attributes** - filter by resource attributes such as `telemetry.sdk.language`

## Service detail view

Click a service name to open its detail view. The detail view has three tabs: **Overview**, **Operations**, and **Dependencies**.

### Overview tab

The Overview tab gives you a high-level picture of the service's health and behavior.

![Service detail Overview tab showing KPI cards, latency by dependencies, and correlated data links](/docs/images/apm/services-overview.png)

**Top dependencies by fault rate**
A panel showing which downstream dependencies have the highest fault rates for this service.

**Correlated data**
Quick links to related telemetry:
- **View service attributes** - resource attributes attached to the service
- **View correlated spans** - spans associated with this service
- **View correlated logs** - logs correlated to this service's traces

**KPI cards**
Five cards summarizing key performance indicators, each with a sparkline chart, the current value, the previous-period value, and a trend arrow:

| KPI | Description |
|---|---|
| **Throughput** | Requests per interval |
| **Fault rate (5xx)** | Percentage of requests returning 5xx status codes |
| **Error rate (4xx)** | Percentage of requests returning 4xx status codes |
| **Availability** | Percentage of successful (non-error) requests |
| **Latency (P99)** | 99th percentile response time |

**Latency by dependencies chart**
A time-series chart showing latency broken down by downstream dependency. Toggle between P99, P90, and P50 percentiles.

**Requests by operations chart**
A chart showing request volume per operation. Toggle between Top 3, Top 5, and Top 10 operations.

**Availability by operations chart**
A chart showing availability per operation. Toggle between Bottom 3, Bottom 5, and Bottom 10 operations.

### Operations tab

The Operations tab lists every operation for the service.

![Service detail Operations tab showing operations table with expandable rows and inline charts](/docs/images/apm/service-operations.png)

**Operations table**

| Column | Description |
|---|---|
| **Operation** | The operation name (e.g., `GET /api/users`) |
| **Correlations** | Icon buttons to open the correlation flyout |
| **Dependencies** | Number of downstream dependencies for this operation |
| **Latency (P99)** | 99th percentile latency |
| **Requests** | Total request count |
| **Error rate** | Percentage of requests with errors |
| **Availability** | Percentage of successful requests |

**Expandable rows**
Click a row to expand it and see inline charts:
- **Requests / Faults** - request volume and 5xx fault count over time
- **Errors / Latency** - error count and latency (P50, P90, P99) over time

**Filters sidebar**

- **Availability** - bucket filters for availability ranges
- **Operations** - search box to filter by operation name
- **Error rate** - filter by error rate range
- **Latency** - filter by latency range
- **Requests** - filter by request count range
- **Service operations** - filter to specific service-side operations
- **Remote operations** - filter to specific remote (downstream) operations

**Correlation flyout**
Click a correlation icon on any operation row to open a flyout panel. The flyout header shows the service name, environment badge, and operation filter badge. It contains two tabs:

- **Correlated spans** - a table of spans with columns for Time, Status (OK/ERROR badge), HTTP Status, Kind, Operation, and Span ID. The Span ID is a clickable link that navigates to the span in Explore Traces. A span with the `gen_ai.operation.name` attribute opens its trace in [Agent Traces](/docs/ai-observability/agent-tracing/) instead.
- **Correlated logs** - a table of log entries correlated to the selected operation.

For a service that emits GenAI spans, the **Explore Traces** button reads **View in Agent Traces** and opens the Agent Traces **Spans** tab filtered to the service. This routing applies only when Agent Traces is enabled.

![Correlation flyout showing correlated spans for the frontend service GET operation](/docs/images/apm/service-span-correlations.png)

### Dependencies tab

The Dependencies tab shows all downstream services that this service calls.

![Service detail Dependencies tab showing dependency table with expandable rows and inline charts](/docs/images/apm/service-dependencies.png)

**Dependencies table**

| Column | Description |
|---|---|
| **Dependency service** | The downstream service name |
| **Remote operation** | The operation called on the downstream service |
| **Service operation(s)** | The operation(s) on this service that call the dependency |
| **Latency (P99)** | 99th percentile latency for this dependency path |
| **Requests** | Total request count for this dependency path |
| **Error rate** | Percentage of requests with errors |
| **Availability** | Percentage of successful requests |

**Expandable rows**
Click a row to expand it and see inline charts for request volume, errors, and latency over time.

**Filters sidebar**

- **Availability** - bucket filters for availability ranges
- **Dependency service** - search box to filter by dependency name
- **Error rate** - filter by error rate range

### Chart interactions

The time-series charts on the service detail tabs support the following interactions:

- **Synced crosshair** - hover over a chart to show a vertical guide at the same timestamp on the other charts on the page.
- **Drag to zoom** - drag across a chart to set the page time range to the selected window. All charts on the page update.
- **Isolate a series** - in a chart with multiple series, select a series in the legend to hide the others. Select it again to show all series.
- **Open in Discover metrics** - select the button in the upper-right corner of a chart to open its PromQL query, Prometheus data source, and time range in [Discover Metrics](/docs/investigate/discover-metrics/) in a new browser tab.

## External dependencies

Databases, message brokers, and external endpoints (such as third-party HTTP APIs or LLM providers) don't emit their own spans. Data Prepper detects them from the CLIENT, PRODUCER, and CONSUMER spans of the services that call them and adds them to the catalog and the [Application Map](/docs/apm/service-map/) as typed dependencies. Their RED metrics come from the callers' spans.

![Services page with the Type filter set to Database and Messaging, showing kafka, postgresql, and redis dependencies in the Service Catalog with a Type column](/docs/images/apm/services-dependency-types.png)

| Type | Detected from | Example name |
|---|---|---|
| **Database** | A CLIENT span with `db.*` attributes and no child SERVER span | `postgresql:orders-db`, `redis:valkey-cart` |
| **Messaging** | PRODUCER and CONSUMER spans with `messaging.system` | `kafka:orders` |
| **External** | A CLIENT span with HTTP, RPC, or `peer.service` attributes and no child SERVER span | `api.openai.com` |

Dependency rows don't have spans and logs correlation buttons, because a dependency emits no telemetry of its own.

> **Note:** Dependency detection requires Data Prepper 2.17 or later. It's controlled by the `dependency_nodes.enabled` option of the `otel_apm_service_map` processor, which defaults to `true`. With earlier Data Prepper versions, or with `dependency_nodes.enabled: false`, the catalog shows only services and the **Type** column and filter don't appear.

### Dependency detail view

Click a dependency name to open its detail view. The page header shows the dependency's icon and name. The page shows a type badge and the following panels:

- **Metric cards** - **Throughput (req/s)**, **Latency (P99)**, **Fault rate (5xx)**, and **Error rate (4xx)**, derived from the callers' spans.
- **Charts** - **Requests**, **Latency**, **Faults (5xx)**, and **Errors (4xx)** over time. The charts support the same [interactions](#chart-interactions) as the service detail charts.
- **Callers** - the services that call the dependency, with the **Operation** they invoke and the number of **Requests**. For a message broker, a **Role** column shows whether each service is a **Producer** or a **Consumer**.
- **Spans** - recent spans from calling services that target the dependency, with **Caller**, **Operation**, **Duration**, **Status**, and **Start time** columns.

For a message broker, throughput, latency, and failures are measured on publishes, so each message counts once. If no producer is instrumented, they're measured on consumes.

## How service data is generated

Service data comes from the same Data Prepper pipeline that generates the [Application Map](/docs/apm/service-map/). The `otel_apm_service_map` processor extracts service relationships from trace spans and indexes topology data into OpenSearch. RED metrics are exported to Prometheus via remote write, where they power the time-series charts and KPI cards in the Services views.
