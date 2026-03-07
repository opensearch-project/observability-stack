---
title: "Build a Dashboard"
description: "Create dashboards, add visualization panels, and arrange layouts for observability monitoring"
---

This guide walks through creating a dashboard from scratch — adding panels, choosing visualization types, configuring queries, and arranging the layout.

## Creating a new dashboard

1. Navigate to **Dashboards** in the left navigation
2. Select **Create** → **Dashboard**
3. You start with an empty canvas — add panels to populate it

Alternatively, when you're in Discover and have a visualization you like, select **Save** → **Save to dashboard** → **New dashboard** to create a dashboard seeded with that visualization.

## Adding panels

### From the dashboard editor

1. Select **Add** in the dashboard toolbar
2. Choose **Create new** to build a visualization from scratch, or **Add existing** to reuse a saved visualization
3. For a new panel:
   - Select your index pattern or data source
   - Write your query (PPL or PromQL)
   - Choose a visualization type
   - Configure axes, legends, and formatting
4. Select **Save** to add the panel to the dashboard

### From Discover

1. Build your query in Discover
2. Select a visualization type from the chart panel
3. Select **Save** → **Save to dashboard**
4. Choose an existing dashboard or create a new one
5. The visualization appears as a new panel on the dashboard

## Visualization types

Each panel supports one visualization type. Choose based on what the data needs to communicate:

| Visualization | Best for | Typical query pattern |
|---|---|---|
| Line chart | Trends over time, rate changes | `timechart`, `rate()` |
| Area chart | Volume over time, stacked comparisons | `timechart` with `by` clause |
| Bar chart | Categorical comparisons, distributions | `stats count() by field` |
| Horizontal bar | Ranked lists, top-N comparisons | `stats ... \| sort -` |
| Data table | Detailed breakdowns, raw data | Any query with `fields` |
| Metric value | Single KPI, numeric summary | `stats count()`, single PromQL value |
| Gauge | Progress toward a threshold | Error budget remaining, CPU usage |
| Pie chart | Proportional breakdown | `stats count() by category` |
| Heat map | Density across two dimensions | `bin` with two grouping fields |
| Tag cloud | Term frequency | `stats count() by keyword` |

### Choosing the right visualization

Some rules of thumb:

- Time-series data → line or area chart
- Comparing categories → bar chart
- Single number that matters → metric or gauge
- Distribution shape → heat map or histogram (bar chart with `bin`)
- Proportions of a whole → pie chart (use sparingly — bar charts are usually clearer)

## Configuring panels

### Query configuration

Each panel has a query editor where you write PPL or PromQL. The query determines what data the panel displays.

For logs and traces (PPL):
```sql
search earliest=-6h source = logs-otel-v1*
| where severityNumber >= 17
| timechart span=5m count() by `resource.attributes.service.name`
```

For metrics (PromQL — adjust metric names to match your environment):
```promql
sum by (service_name) (rate(http_server_request_duration_seconds_count[5m]))
```

### Axes and formatting

- Set axis labels and units (requests/sec, milliseconds, bytes, percentage)
- Configure Y-axis scale (linear or logarithmic) — log scale is useful when values span orders of magnitude
- Set min/max bounds to keep charts consistent across panels
- Choose color schemes that distinguish series clearly

### Legends

- Position legends at the bottom, right, or hide them for single-series panels
- Use legend values (min, max, avg, current) to add context without hovering
- For dashboards with many panels, hiding legends saves space — use panel titles instead

### Thresholds

Add horizontal threshold lines to panels to mark important boundaries:

- Error rate SLO (e.g., red line at 1%)
- Latency target (e.g., yellow line at 500ms, red at 1s)
- Capacity limits (e.g., red line at 80% CPU)

Thresholds make it immediately obvious when a metric crosses a boundary — no mental math required.

## Layout and arrangement

### Grid layout

Panels snap to a grid. Resize by dragging the bottom-right corner of a panel. Rearrange by dragging the panel header.

Layout tips:
- Put the most important panels at the top — that's what people see first
- Group related panels together (e.g., all latency panels in one row, all error panels in another)
- Use full-width panels for time-series charts that benefit from horizontal space
- Use narrow panels for metric values and gauges — they don't need much room

### Recommended dashboard layouts

**Service health overview (4–6 panels):**

| Row | Panels |
|---|---|
| Top | Request rate (line) · Error rate (line) · p95 latency (line) |
| Bottom | Error count by service (bar) · Top slow operations (table) |

**Incident response (6–8 panels):**

| Row | Panels |
|---|---|
| Top | Error rate (line) · Affected services count (metric) · Active traces with errors (metric) |
| Middle | Error logs by service (stacked bar) · Latency by service (line) |
| Bottom | Recent error logs (table) · Slow traces (table) |

**Resource utilization (4–6 panels):**

| Row | Panels |
|---|---|
| Top | CPU by service (line) · Memory by service (line) |
| Bottom | JVM heap usage (line) · GC time (line) · DB query latency (line) |

## Time range controls

The dashboard time picker in the top bar sets the time range for all panels simultaneously. This keeps everything aligned — when you're investigating a 2am incident, every panel shows the same window.

Individual panels can override the dashboard time range if needed, but use this sparingly. Mismatched time ranges across panels create confusion.

Common time range patterns:
- Real-time monitoring: last 15 minutes or last 1 hour with auto-refresh
- Incident investigation: custom range around the incident window
- Trend analysis: last 24 hours or last 7 days
- Capacity planning: last 30 days

### Auto-refresh

Enable auto-refresh to keep dashboards current. Set the interval based on the use case:
- Operational dashboards: 10–30 seconds
- Trend dashboards: 5–15 minutes
- Capacity planning: manual refresh is fine

## Building dashboards from Discover queries

The fastest way to build a dashboard is to start in Discover:

1. Write a query in Discover that answers a specific question
2. Choose the right visualization for the answer
3. Save it to a dashboard
4. Repeat for each question you want the dashboard to answer

This approach ensures every panel has a clear purpose — it answers a question you actually asked during investigation. Dashboards built this way tend to be more useful than ones designed abstractly.

## Next steps

- [Sharing Dashboards](/docs/dashboards/sharing/) — share, export, and best practices
- [Discover Logs](/docs/investigate/discover-logs/) — build log queries to power dashboard panels
- [Discover Metrics](/docs/investigate/discover-metrics/) — build PromQL queries for metrics panels
