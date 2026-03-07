---
title: Application Map
description: Visualize service dependencies and communication patterns
---

The Application Map is an interactive topology view of your distributed system, auto-generated from trace data by Data Prepper. It shows which services communicate, how much traffic flows between them, and where errors are occurring.

## Accessing the Application Map

1. Open OpenSearch Dashboards.
2. Navigate to **Observability** > **Application Monitoring** > **Application Map**.

The breadcrumb at the top reads **Application > Services**, reflecting the current navigation level.

![Application Map showing service topology with nodes and edges](/docs/images/apm/application-map.png)

## Map controls

The Application Map toolbar provides:

- **Search bar** — filter by service name or environment
- **Time range selector** — choose a time window, with a Refresh button
- **Zoom in / Zoom out** — adjust the map zoom level
- **Fit to screen** — reset the view to fit all nodes

## Filters panel

A filters panel on the left side lets you narrow what the map displays:

- **Group by** — select an attribute to group services (see [Group by view](#group-by-view) below)
- **Fault Rate (5xx)** — filter by fault rate buckets: < 1%, 1–5%, > 5%
- **Error Rate (4xx)** — filter by error rate buckets: < 1%, 1–5%, > 5%
- **Environment** — filter to a specific deployment environment

Applied filters appear as chips above the map (e.g., "Fault Rate (5xx): > 5% x"). Click the **x** on a chip to remove it, or click **Clear all** to reset all filters.

![Application Map filtered by Fault Rate (5xx) > 5%, showing filter chips above the map](/docs/images/apm/filter-by-error-rate.png)

## Service nodes

Each node on the map represents an instrumented service and displays:

- Service name
- Environment label
- Request count
- A **View Insights** link

Edges between nodes show the direction of communication between services.

## Clicking a service node

Click any service node to open a detail panel on the right side of the map. The panel shows:

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
- **Requests** — request volume over time
- **Latency** — P50, P90, and P99 latency lines
- **Faults (5xx)** — 5xx fault count over time
- **Errors (4xx)** — 4xx error count over time

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

## Data Prepper pipeline configuration

The Observability Stack uses a 5-pipeline architecture in Data Prepper to process OTLP data, generate the application map, and export RED metrics. Below is the full pipeline configuration from the stack's `pipelines.template.yaml`:

### 1. OTLP entry point

The main OTLP source pipeline that receives all telemetry data and routes logs and traces to their respective pipelines:

```yaml
otlp-pipeline:
  source:
    otel_trace_source:
      ssl: false
      port: 21890
  processor:
    - otel_traces:
  route:
    - logs: '/type == "log"'
    - traces: '/type == "trace"'
  sink:
    - pipeline:
        name: "otel-logs-pipeline"
        routes:
          - logs
    - pipeline:
        name: "otel-traces-pipeline"
        routes:
          - traces
```

### 2. Logs pipeline

Processes OTLP log data and writes to OpenSearch:

```yaml
otel-logs-pipeline:
  source:
    pipeline:
      name: "otlp-pipeline"
  processor:
    - otel_logs:
  sink:
    - opensearch:
        hosts: ["https://opensearch:9200"]
        index_type: log-analytics-plain
        insecure: true
        username: "${{opensearch.username}}"
        password: "${{opensearch.password}}"
```

### 3. Traces fan-out pipeline

Receives trace data from the OTLP pipeline and fans out to both the raw trace pipeline and the service map pipeline:

```yaml
otel-traces-pipeline:
  source:
    pipeline:
      name: "otlp-pipeline"
  sink:
    - pipeline:
        name: "traces-raw-pipeline"
    - pipeline:
        name: "service-map-pipeline"
```

### 4. Raw traces pipeline

Processes trace spans and writes them to the trace analytics index in OpenSearch:

```yaml
traces-raw-pipeline:
  source:
    pipeline:
      name: "otel-traces-pipeline"
  processor:
    - otel_traces:
  sink:
    - opensearch:
        hosts: ["https://opensearch:9200"]
        index_type: trace-analytics-plain-raw
        insecure: true
        username: "${{opensearch.username}}"
        password: "${{opensearch.password}}"
```

### 5. Service map pipeline

Builds the application map from trace data, groups by SDK language, and exports RED metrics to Prometheus via remote write:

```yaml
service-map-pipeline:
  source:
    pipeline:
      name: "otel-traces-pipeline"
  processor:
    - otel_apm_service_map:
        group_by_attributes:
          - telemetry.sdk.language
        window_duration: 10s
  sink:
    - opensearch:
        hosts: ["https://opensearch:9200"]
        index_type: otel-v2-apm-service-map
        insecure: true
        username: "${{opensearch.username}}"
        password: "${{opensearch.password}}"
    - prometheus_remote_write:
        endpoint: "http://prometheus:9090/api/v1/write"
```

### Pipeline data flow

```
OTLP Source (port 21890)
  └─ otlp-pipeline
       ├─ logs → otel-logs-pipeline → OpenSearch (log-analytics-plain)
       └─ traces → otel-traces-pipeline
                     ├─ traces-raw-pipeline → OpenSearch (trace-analytics-plain-raw)
                     └─ service-map-pipeline → OpenSearch (otel-v2-apm-service-map)
                                             → Prometheus (remote write)
```
