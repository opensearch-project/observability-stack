---
title: "Investigate"
description: "Explore, query, and analyze your observability data across logs, traces, and metrics using Discover"
---

Observability investigation in OpenSearch centers on the Discover experience — a consistent querying interface available across logs, traces, and metrics, each on its own dedicated page. Analysts use Discover to understand system behavior, diagnose issues, and uncover patterns.

## Discover: your investigation starting point

Discover provides three signal-specific querying experiences:

| Signal | Query language | Guide |
|---|---|---|
| Logs | Piped Processing Language (PPL) | [Discover Logs](/docs/investigate/discover-logs/) |
| Traces | Piped Processing Language (PPL) | [Discover Traces](/docs/investigate/discover-traces/) |
| Metrics | PromQL | [Discover Metrics](/docs/investigate/discover-metrics/) |

Each guide covers searching and filtering, query examples, cross-signal correlation, outlier detection, and time range comparisons for that signal type.

Logs and traces share PPL as their query language, giving analysts a consistent pipe-based syntax across both signals. Metrics uses PromQL, the industry-standard language for querying Prometheus-compatible time-series data.

## Query languages at a glance

### Piped Processing Language (PPL)

PPL uses a pipe-delimited syntax where each command transforms the result set and passes it to the next. It reads naturally from left to right.

**Log queries** (run in the Logs Discover view against `logs-otel-v1*`):

Filter error logs and count by service:
```sql
source = logs-otel-v1*
| where severityNumber >= 17
| stats count() as errorCount by `resource.attributes.service.name`
| sort - errorCount
```

Extract HTTP status codes from log bodies:
```sql
source = logs-otel-v1*
| where body LIKE '%HTTP%'
| rex field=body "HTTP/\d\.\d\"\s+(?<statusCode>\d{3})"
| stats count() as requests by statusCode
| sort statusCode
```

**Trace queries** (run in the Traces Discover view against `otel-v1-apm-span-*`):

Find the slowest traces in the last hour:
```sql
source = otel-v1-apm-span-*
| where durationInNanos > 5000000000
| fields traceId, serviceName, name, durationInNanos
| sort - durationInNanos
| head 10
```

For the full PPL command reference, see the [PPL documentation](https://github.com/opensearch-project/sql/blob/main/docs/user/ppl/index.md). For hands-on examples using OTEL data, see [Discover Logs](/docs/investigate/discover-logs/) and [Discover Traces](/docs/investigate/discover-traces/).

### PromQL

PromQL is a functional query language for selecting and aggregating time-series metrics. It supports instant queries, range queries, and built-in functions for rates, aggregations, and mathematical operations.

:::caution[Placeholder queries]
The PromQL examples below use standard OpenTelemetry metric names. Your environment may use different metric names and labels — adjust accordingly.
:::

**Sample queries:**

Request rate per service over 5 minutes:
```promql
rate(http_server_request_duration_seconds_count[5m])
```

95th percentile latency:
```promql
histogram_quantile(0.95, rate(http_server_request_duration_seconds_bucket[5m]))
```

CPU usage by container:
```promql
avg by (container) (rate(container_cpu_usage_seconds_total[5m])) * 100
```

For the full PromQL reference, see the [PromQL documentation](https://prometheus.io/docs/prometheus/latest/querying/basics/).

## Autocomplete and query assistance

Discover includes out-of-the-box autocomplete to help analysts build queries faster:

- Field name suggestions as you type
- Command and function completion for PPL and PromQL
- Previously saved queries surfaced as suggestions for quick reuse
- Syntax hints and parameter guidance inline

### AI-assisted query building

While OpenSearch does not include an embedded chat agent for query generation, there are two paths to AI-assisted querying:

- **Build your own chat agent:** OpenSearch provides APIs and extensibility points to integrate LLM-powered query assistants into your workflows. See [Building AI-powered query assistants with OpenSearch](https://opensearch.org/blog/opensearch-ai-retrospective/) for guidance on creating custom chat experiences.
- **Use your browser AI agent:** Modern AI browser agents (such as those built into browsers or available as extensions) can assist in writing PPL and PromQL queries directly in the Discover interface. Point your agent at the query bar and describe what you're looking for in natural language.

## Visualizations in Discover

After running a query against logs or traces, analysts can build visualizations directly within the Discover experience to better understand patterns and trends. The following visualization types are available:

| Visualization | Best for |
|---|---|
| Area chart | Trends over time, volume patterns |
| Bar chart | Categorical comparisons, distributions |
| Line chart | Time-series comparisons, rate changes |
| Data table | Raw tabular data, detailed breakdowns |
| Metric value | Single KPI or numeric summary |
| Pie chart | Proportional comparisons |
| Heat map | Density and distribution across two dimensions |
| Gauge chart | Progress toward thresholds or goals |
| Tag cloud | Frequency analysis of terms or categories |

Discover automatically recommends the most appropriate visualization based on your query results — for example, a single metric with a date column defaults to a line chart, while categorical columns with high cardinality trigger a heat map.

## Save to dashboard

Once you've built a visualization that tells the right story, you can save it directly to a dashboard:

1. Build your query and select a visualization type in Discover
2. Select **Save** in the toolbar
3. Choose **Save to dashboard** and either:
   - Add it to an existing dashboard
   - Create a new dashboard to house the visualization
4. The visualization is now live on the dashboard, updating as new data arrives

For more on building and managing dashboards, see the [Dashboards documentation](/docs/dashboards/).

## Save and share queries

When your investigation is complete, save your query for future use and share it with team members:

- **Save:** Preserve the query text, filters, time range, and selected fields. Access saved queries from the **Open** menu in Discover.
- **Share:** Share your saved query with team members so they can rerun the same investigation, build on your work, or use it as a starting point for their own analysis.

Saved queries become reusable building blocks — use them to standardize investigation runbooks, onboard new team members, or create a library of common diagnostic queries for your organization.

## Datasets

Datasets provide a unified way to discover and select data sources for your queries. Instead of manually typing index patterns, browse available log, trace, and metric indices from the dataset selector in Discover. See [Datasets](/docs/investigate/datasets/) for details.

## Correlations

Correlations let you jump between related signals — linking a log entry to the trace that produced it, or navigating from a slow trace to the associated logs. See [Correlations](/docs/investigate/correlations/) for details.

## Troubleshooting

When queries return unexpected results, errors, or run slowly, see the [Troubleshooting Queries](/docs/investigate/troubleshooting/) guide for techniques including browser network inspection, common syntax fixes, and performance optimization.
