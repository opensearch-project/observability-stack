---
title: Application Map
description: Visualize service dependencies and communication patterns
sidebar:
  order: 30
---

The Application Map is an interactive topology view of your distributed system, auto-generated from trace data by Data Prepper. It shows which services communicate, which databases, message brokers, and external endpoints they depend on, how much traffic flows between them, and where errors are occurring.

## Accessing the Application Map

1. Open OpenSearch Dashboards.
2. Navigate to **Observability** > **Application Monitoring** > **Application Map**.

The breadcrumb at the top reads **Application > Services**, reflecting the current navigation level.

![Application Map showing service topology with nodes and edges](/docs/images/apm/application-map.png)

## Map controls

The Application Map toolbar provides:

- **Search bar** - filter by service name or environment
- **Time range selector** - choose a time window, with a Refresh button
- **Zoom in / Zoom out** - adjust the map zoom level
- **Fit to screen** - reset the view to fit all nodes

## Filters panel

A filters panel on the left side lets you narrow what the map displays:

- **Include external dependencies** - show or hide [dependency nodes](#dependency-nodes) and their edges. Selected by default. Appears only when the map contains dependency nodes. When cleared, a **Dependencies: Hidden** chip appears above the map
- **Group by** - select an attribute to group services (see [Group by view](#group-by-view) below)
- **Fault Rate (5xx)** - filter by fault rate buckets: < 1%, 1–5%, > 5%
- **Error Rate (4xx)** - filter by error rate buckets: < 1%, 1–5%, > 5%
- **Environment** - filter to a specific deployment environment

Applied filters appear as chips above the map (e.g., "Fault Rate (5xx): > 5% x"). Click the **x** on a chip to remove it, or click **Clear all** to reset all filters.

![Application Map filtered by Fault Rate (5xx) > 5%, showing filter chips above the map](/docs/images/apm/filter-by-error-rate.png)

## Service nodes

Each node on the map represents an instrumented service and displays:

- Service name
- Environment label
- Request count
- A **View Insights** link

Edges between nodes show the direction of communication between services.

## Dependency nodes

Databases, message brokers, and external endpoints that your services call appear on the map as typed nodes. Each dependency node shows the icon of its system (for example, PostgreSQL, Kafka, or Redis) or a generic database, messaging, or external icon, and its type (**Database**, **Messaging**, or **External**) as a subtitle. A message broker sits between its producers and consumers.

![Topology Map showing the kafka:orders Messaging dependency node between the checkout service and its consumers](/docs/images/apm/service-map-dependency-nodes.png)

Dependency nodes show RED metrics derived from the spans of the services that call them. Click a dependency node to open the same detail panel as a service node, without the spans and logs links. **View details** opens the [dependency detail view](/docs/apm/services/#dependency-detail-view).

Dependency detection requires Data Prepper 2.17 or later. For details on how dependencies are detected and named, see [External dependencies](/docs/apm/services/#external-dependencies).

On a map with more than 150 nodes, dependencies of the same type that connect to exactly the same services are grouped into stacks. A notice above the map reports how many dependencies are grouped. Expand a stack with its **+** button, or select **Show individually** to turn off grouping.

## Clicking a service node

Click any service node to open a detail panel on the right side of the map. The panel shows:

![Node details panel showing health and metrics for the selected service](/docs/images/apm/application-map-node-details.png)

**Header**
- Service name and environment label
- A **View details** link that navigates to the full [service detail view](/docs/apm/services/#service-detail-view)

**Health**
- A donut chart breaking down total traffic into:
  - **Total Requests**
  - **Total Errors (4xx)**
  - **Total Faults (5xx)**

![Service node detail panel showing health donut and metrics charts for the frontend service](/docs/images/apm/service-metrics.png)

**Metrics**
Four time-series charts for the selected time range:
- **Requests** - request volume over time
- **Latency** - P50, P90, and P99 latency lines
- **Faults (5xx)** - 5xx fault count over time
- **Errors (4xx)** - 4xx error count over time

The charts support a synced crosshair, drag to zoom (which sets the map's time range), legend isolation, and an **Open in Discover metrics** button. For details, see [Chart interactions](/docs/apm/services/#chart-interactions).

## Group by view

The **Group by** dropdown in the filters panel lists any attribute configured in Data Prepper's `group_by_attributes` for the `otel_apm_service_map` processor. For example, if your pipeline includes:

```yaml
- otel_apm_service_map:
    group_by_attributes:
      - telemetry.sdk.language
```

then "telemetry.sdk.language" appears as a Group by option.

When a group-by attribute is selected, the map switches from a topology graph to a **card grid**. Each card represents one group value and shows:

- Group value name (e.g., "python", "java")
- A donut chart icon
- **Requests** count
- **Services** count
- A **View insights** link

Clicking **View insights** on a group card drills into that group, showing only the services matching that attribute value.

![Group by telemetry.sdk.language showing cards for python, go, cpp, nodejs, rust, dotnet, java, ruby, and php](/docs/images/apm/groupby-attributes.png)

## In-context correlations

The application map integrates with APM correlations to help you navigate from the topology view to detailed telemetry data:

- **Application spans** - select a service node and choose **View traces** to see the individual trace spans associated with that service. This is useful for investigating the root cause of latency or error spikes visible on the map.
- **Application logs** - select a service node and choose **View logs** to see log entries from that service during the selected time range. Log correlations require that you have configured a [correlation](/docs/investigate/correlations/) between your trace and log datasets.

These in-context navigation paths allow you to move seamlessly from a high-level topology view to the detailed traces and logs needed for root cause analysis.

## Data Prepper pipeline configuration

The Application Map is generated by Data Prepper's `otel_apm_service_map` processor. For the complete pipeline configuration, see [Configuring Telemetry Ingestion](/docs/apm/configuring-telemetry-ingestion/#configuring-data-prepper-pipelines).

The processor draws an edge between two services only when a downstream SERVER span is a child of the caller's CLIENT span, so every service in the call path must propagate the W3C `traceparent` header. In Data Prepper 2.17 and later, calls with no child SERVER span become [dependency nodes](#dependency-nodes). To turn off dependency nodes, set `dependency_nodes.enabled: false` on the `otel_apm_service_map` processor. For services instrumented with eBPF, see [eBPF Instrumentation (OBI)](/docs/send-data/opentelemetry/ebpf-instrumentation/#turn-on-context-propagation).
