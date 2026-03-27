---
title: "PPL Observability Examples"
description: "Real-world PPL queries for OpenTelemetry logs, traces, and AI agent observability - with live playground links to try each query instantly."
---

import { Tabs, TabItem, Aside } from '@astrojs/starlight/components';

These examples use real OpenTelemetry data from the Observability Stack. Each query runs against the live [playground](https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)) - click "Try in playground" to run any query instantly.

<Aside type="tip">
In the Discover UI, the `source` index is set by the dataset selector, so queries start with `|`. In the examples below, we include `source = ...` for clarity - omit it when running in Discover.
</Aside>

## Index patterns

The Observability Stack uses these OpenTelemetry index patterns:

| Signal | Index Pattern | Key Fields |
|--------|--------------|------------|
| **Logs** | `logs-otel-v1*` | `time`, `body`, `severityText`, `severityNumber`, `traceId`, `spanId`, `resource.attributes.service.name` |
| **Traces** | `otel-v1-apm-span-*` | `traceId`, `spanId`, `parentSpanId`, `serviceName`, `name`, `durationInNanos`, `startTime`, `endTime`, `status.code` |
| **Service Map** | `otel-v2-apm-service-map-*` | `serviceName`, `destination.domain`, `destination.resource`, `traceGroupName` |

<Aside>
OTel attribute fields with dots in their names must be wrapped in backticks: `` `resource.attributes.service.name` ``, `` `attributes.gen_ai.operation.name` ``
</Aside>

---

## Log investigation

### Count logs by service

See which services are generating the most logs.

```sql
| stats count() as log_count by `resource.attributes.service.name`
| sort - log_count
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count()%20as%20log_count%20by%20%60resource.attributes.service.name%60%20%7C%20sort%20-%20log_count')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Find error and fatal logs

Filter for high-severity logs across all services.

```sql
| where severityText = 'ERROR' or severityText = 'FATAL'
| fields time, body, severityText, `resource.attributes.service.name`
| sort - time
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20or%20severityText%20%3D%20!%27FATAL!%27%20%7C%20fields%20time%2C%20body%2C%20severityText%2C%20%60resource.attributes.service.name%60%20%7C%20sort%20-%20time')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Error rate by service

Calculate the error percentage for each service.

```sql
| stats count() as total,
        sum(case(severityText = 'ERROR' or severityText = 'FATAL', 1 else 0)) as errors
  by `resource.attributes.service.name`
| eval error_rate = round(errors * 100.0 / total, 2)
| sort - error_rate
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count()%20as%20total%2C%20sum(case(severityText%20%3D%20!%27ERROR!%27%20or%20severityText%20%3D%20!%27FATAL!%27%2C%201%20else%200))%20as%20errors%20by%20%60resource.attributes.service.name%60%20%7C%20eval%20error_rate%20%3D%20round(errors%20*%20100.0%20%2F%20total%2C%202)%20%7C%20sort%20-%20error_rate')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Log volume over time

Time-bucketed log volume - great for spotting traffic spikes.

```sql
| stats count() as volume by span(time, 5m) as time_bucket
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count()%20as%20volume%20by%20span(time%2C%205m)%20as%20time_bucket')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Severity breakdown by service

Distribution of log levels per service.

```sql
| stats count() as cnt by `resource.attributes.service.name`, severityText
| sort `resource.attributes.service.name`, - cnt
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count()%20as%20cnt%20by%20%60resource.attributes.service.name%60%2C%20severityText%20%7C%20sort%20%60resource.attributes.service.name%60%2C%20-%20cnt')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Top log-producing services

Quick view of the noisiest services.

```sql
| top 10 `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20top%2010%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Discover log patterns

Automatically cluster similar log messages - no regex required.

```sql
| patterns body
| fields patterns_field, body
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20patterns%20body%20%7C%20fields%20patterns_field%2C%20body')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Deduplicate logs by service

Get one representative log per service.

```sql
| dedup `resource.attributes.service.name`
| fields time, body, severityText, `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20dedup%20%60resource.attributes.service.name%60%20%7C%20fields%20time%2C%20body%2C%20severityText%2C%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

## Trace analysis

### Slowest traces

Find the operations with the highest latency.

```sql
source = otel-v1-apm-span-*
| eval duration_ms = durationInNanos / 1000000
| sort - duration_ms
| fields traceId, serviceName, name, duration_ms
| head 20
```

### Error spans

Find all spans with error status.

```sql
source = otel-v1-apm-span-*
| where status.code = 2
| fields traceId, serviceName, name, durationInNanos, startTime
| sort - startTime
| head 20
```

### Latency percentiles by service

P50, P95, P99 latency for each service.

```sql
source = otel-v1-apm-span-*
| stats avg(durationInNanos) as avg_ns,
        percentile(durationInNanos, 50) as p50_ns,
        percentile(durationInNanos, 95) as p95_ns,
        percentile(durationInNanos, 99) as p99_ns,
        count() as span_count
  by serviceName
| eval p50_ms = round(p50_ns / 1000000, 1),
       p95_ms = round(p95_ns / 1000000, 1),
       p99_ms = round(p99_ns / 1000000, 1)
| fields serviceName, span_count, p50_ms, p95_ms, p99_ms
| sort - p99_ms
```

### Service error rates

Error rate calculated from span status codes.

```sql
source = otel-v1-apm-span-*
| stats count() as total,
        sum(case(status.code = 2, 1 else 0)) as errors
  by serviceName
| eval error_rate = round(errors * 100.0 / total, 2)
| sort - error_rate
```

### Trace fan-out analysis

How many spans does each trace produce? High fan-out can indicate N+1 queries or excessive tool calls.

```sql
source = otel-v1-apm-span-*
| stats count() as span_count by traceId
| sort - span_count
| head 20
```

### Operations by service

What operations does each service perform?

```sql
source = otel-v1-apm-span-*
| stats count() as invocations, avg(durationInNanos) as avg_latency by serviceName, name
| sort serviceName, - invocations
```

---

## AI agent observability

These queries leverage the [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) attributes that the Observability Stack captures for AI agent telemetry.

### GenAI operations breakdown

See what types of AI operations are occurring.

```sql
| stats count() as operations by servicename, `attributes.gen_ai.operation.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count()%20as%20operations%20by%20servicename,%20%60attributes.gen_ai.operation.name%60%20')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Token usage by agent

Track LLM token consumption across agents.

```sql
source = otel-v1-apm-span-*
| where isnotnull(`attributes.gen_ai.usage.input_tokens`)
| stats sum(`attributes.gen_ai.usage.input_tokens`) as input_tokens,
        sum(`attributes.gen_ai.usage.output_tokens`) as output_tokens,
        count() as calls
  by serviceName
| eval total_tokens = input_tokens + output_tokens
| sort - total_tokens
```

### Token usage over time

Monitor token consumption trends.

```sql
source = otel-v1-apm-span-*
| where isnotnull(`attributes.gen_ai.usage.input_tokens`)
| stats sum(`attributes.gen_ai.usage.input_tokens`) as input_tokens,
        sum(`attributes.gen_ai.usage.output_tokens`) as output_tokens
  by span(startTime, 5m) as time_bucket
```

### Model usage breakdown

Which models are being used and how often?

```sql
source = otel-v1-apm-span-*
| where isnotnull(`attributes.gen_ai.request.model`)
| stats count() as requests,
        sum(`attributes.gen_ai.usage.input_tokens`) as input_tokens,
        sum(`attributes.gen_ai.usage.output_tokens`) as output_tokens
  by `attributes.gen_ai.request.model`
| sort - requests
```

### Tool execution analysis

See which tools agents are calling and their performance.

```sql
source = otel-v1-apm-span-*
| where `attributes.gen_ai.operation.name` = 'execute_tool'
| stats count() as executions,
        avg(durationInNanos) as avg_latency,
        max(durationInNanos) as max_latency
  by `attributes.gen_ai.tool.name`, serviceName
| eval avg_ms = round(avg_latency / 1000000, 1)
| sort - executions
```

### Agent invocation latency

End-to-end latency for agent invocations.

```sql
source = otel-v1-apm-span-*
| where `attributes.gen_ai.operation.name` = 'invoke_agent'
| eval duration_ms = durationInNanos / 1000000
| stats avg(duration_ms) as avg_ms,
        percentile(duration_ms, 95) as p95_ms,
        count() as invocations
  by serviceName, `attributes.gen_ai.agent.name`
| sort - p95_ms
```

### Failed agent operations

Find agent operations that resulted in errors.

```sql
source = otel-v1-apm-span-*
| where isnotnull(`attributes.gen_ai.operation.name`) and status.code = 2
| fields traceId, serviceName, `attributes.gen_ai.operation.name`, `attributes.gen_ai.agent.name`, name, startTime
| sort - startTime
| head 20
```

---

## Cross-signal correlation

### Logs for a specific trace

Jump from a trace to its associated logs using the traceId.

```sql
source = logs-otel-v1*
| where traceId = '<your-trace-id>'
| sort time
| fields time, body, severityText, spanId
```

### Services with both high error logs and slow traces

Combine log and trace signals to find the most problematic services.

```sql
source = logs-otel-v1*
| where severityText = 'ERROR'
| stats count() as error_logs by `resource.attributes.service.name`
| where error_logs > 10
| sort - error_logs
```

Then investigate trace latency for those services:

```sql
source = otel-v1-apm-span-*
| where serviceName = '<service-from-above>'
| stats percentile(durationInNanos, 95) as p95, count() as spans by name
| eval p95_ms = round(p95 / 1000000, 1)
| sort - p95_ms
```

---

## Dashboard-ready queries

These queries produce results well-suited for dashboard visualizations.

### Service health summary (data table)

```sql
source = otel-v1-apm-span-*
| stats count() as total_spans,
        sum(case(status.code = 2, 1 else 0)) as error_spans,
        avg(durationInNanos) as avg_latency_ns
  by serviceName
| eval error_rate = round(error_spans * 100.0 / total_spans, 2),
       avg_latency_ms = round(avg_latency_ns / 1000000, 1)
| fields serviceName, total_spans, error_spans, error_rate, avg_latency_ms
| sort - error_rate
```

### Log volume heatmap (by service and hour)

```sql
| eval hour = hour(time)
| stats count() as volume by `resource.attributes.service.name`, hour
| sort `resource.attributes.service.name`, hour
```

### Top error messages

```sql
| where severityText = 'ERROR'
| top 20 body
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20top%2020%20body')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

## Query tips

### Backtick field names with dots

OpenTelemetry attributes contain dots. Wrap them in backticks:

```sql
| fields `resource.attributes.service.name`, `attributes.gen_ai.operation.name`
```

### Combine stats with eval for computed metrics

```sql
| stats count() as total, sum(case(severityText = 'ERROR', 1 else 0)) as errors by service
| eval error_pct = round(errors * 100.0 / total, 2)
```

### Use span() for time bucketing

```sql
| stats count() by span(time, 1m) as minute
```

### Use head to limit during exploration

Always add `| head` while exploring to avoid scanning all data:

```sql
| where severityText = 'ERROR'
| head 50
```

### Sort with - for descending

```sql
| sort - durationInNanos
```

## Further reading

- **[PPL Language Overview](/docs/ppl/)** - Why PPL and how it compares
- **[Command Reference](/docs/ppl/commands/)** - Full syntax for all commands
- **[Function Reference](/docs/ppl/functions/)** - 200+ built-in functions
- **[Discover Logs](/docs/investigate/discover-logs/)** - Using PPL in the Logs UI
- **[Discover Traces](/docs/investigate/discover-traces/)** - Using PPL in the Traces UI
