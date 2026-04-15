---
title: "PPL Observability Examples"
description: "Real-world PPL queries for OpenTelemetry logs, traces, and AI agent observability - with live playground links to try each query instantly."
---

import { Tabs, TabItem, Aside } from '@astrojs/starlight/components';

These examples use real OpenTelemetry data from the Observability Stack. Each query runs against the live [playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)) - click "Try in playground" to run any query instantly.

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

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count()%20as%20log_count%20by%20%60resource.attributes.service.name%60%20%7C%20sort%20-%20log_count')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Find error and fatal logs

Filter for high-severity logs across all services.

```sql
| where severityText = 'ERROR' or severityText = 'FATAL'
| sort - time
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20or%20severityText%20%3D%20!%27FATAL!%27%20%7C%20sort%20-%20time')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Error rate by service

Calculate the error percentage for each service.

```sql
| stats count() as total,
        sum(case(severityText = 'ERROR' or severityText = 'FATAL', 1 else 0)) as errors
  by `resource.attributes.service.name`
| eval error_rate = round(errors * 100.0 / total, 2)
| sort - error_rate
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query='%7C%20stats%20count()%20as%20total%2C%20sum(case(severityText%20%3D%20!%27ERROR!%27%20or%20severityText%20%3D%20!%27FATAL!%27%2C%201%20else%200))%20as%20errors%20by%20%60resource.attributes.service.name%60%20%7C%20eval%20error_rate%20%3D%20round(errors%20*%20100.0%20%2F%20total%2C%202)%20%7C%20sort%20-%20error_rate')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Log volume over time

Time-bucketed log volume - great for spotting traffic spikes.

```sql
| stats count() as volume by span(time, 5m) as time_bucket
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query='%7C%20stats%20count()%20as%20volume%20by%20span(time%2C%205m)%20as%20time_bucket')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Severity breakdown by service

Distribution of log levels per service.

```sql
| stats count() as cnt by `resource.attributes.service.name`, severityText
| sort `resource.attributes.service.name`, - cnt
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query='%7C%20stats%20count()%20as%20cnt%20by%20%60resource.attributes.service.name%60%2C%20severityText%20%7C%20sort%20%60resource.attributes.service.name%60%2C%20-%20cnt')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Top log-producing services

Quick view of the noisiest services.

```sql
| top 10 `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query='%7C%20top%2010%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Discover log patterns

Automatically cluster similar log messages - no regex required.

```sql
| patterns body
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20patterns%20body')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Deduplicate logs by service

Get one representative log per service.

```sql
| dedup `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20dedup%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

## Trace analysis

### Slowest traces

Find the operations with the highest latency.

```sql
source = otel-v1-apm-span-*
| eval duration_ms = durationInNanos / 1000000
| sort - duration_ms
| head 20
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20eval%20duration_ms%20%3D%20durationInNanos%20%2F%201000000%0A%7C%20sort%20-%20duration_ms%0A%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### Error spans

Find all spans with error status.

```sql
source = otel-v1-apm-span-*
| where status.code = 2
| sort - startTime
| head 20
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20where%20status.code%20%3D%202%0A%7C%20sort%20-%20startTime%0A%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

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
| sort - p99_ms
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20stats%20avg%28durationInNanos%29%20as%20avg_ns%2C%0A%20%20%20%20%20%20%20%20percentile%28durationInNanos%2C%2050%29%20as%20p50_ns%2C%0A%20%20%20%20%20%20%20%20percentile%28durationInNanos%2C%2095%29%20as%20p95_ns%2C%0A%20%20%20%20%20%20%20%20percentile%28durationInNanos%2C%2099%29%20as%20p99_ns%2C%0A%20%20%20%20%20%20%20%20count%28%29%20as%20span_count%0A%20%20by%20serviceName%0A%7C%20eval%20p50_ms%20%3D%20round%28p50_ns%20%2F%201000000%2C%201%29%2C%0A%20%20%20%20%20%20%20p95_ms%20%3D%20round%28p95_ns%20%2F%201000000%2C%201%29%2C%0A%20%20%20%20%20%20%20p99_ms%20%3D%20round%28p99_ns%20%2F%201000000%2C%201%29%0A%7C%20sort%20-%20p99_ms')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

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

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20stats%20count%28%29%20as%20total%2C%0A%20%20%20%20%20%20%20%20sum%28case%28status.code%20%3D%202%2C%201%20else%200%29%29%20as%20errors%0A%20%20by%20serviceName%0A%7C%20eval%20error_rate%20%3D%20round%28errors%20%2A%20100.0%20%2F%20total%2C%202%29%0A%7C%20sort%20-%20error_rate')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### Trace fan-out analysis

How many spans does each trace produce? High fan-out can indicate N+1 queries or excessive tool calls.

```sql
source = otel-v1-apm-span-*
| stats count() as span_count by traceId
| sort - span_count
| head 20
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20stats%20count%28%29%20as%20span_count%20by%20traceId%0A%7C%20sort%20-%20span_count%0A%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### Operations by service

What operations does each service perform?

```sql
source = otel-v1-apm-span-*
| stats count() as invocations, avg(durationInNanos) as avg_latency by serviceName, name
| sort serviceName, - invocations
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20stats%20count%28%29%20as%20invocations%2C%20avg%28durationInNanos%29%20as%20avg_latency%20by%20serviceName%2C%20name%0A%7C%20sort%20serviceName%2C%20-%20invocations')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

---

## AI agent observability

These queries leverage the [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) attributes that the Observability Stack captures for AI agent telemetry.

### GenAI operations breakdown

See what types of AI operations are occurring.

```sql
| stats count() as operations by `resource.attributes.service.name`, `attributes.gen_ai.operation.name`
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query='%7C%20stats%20count%28%29%20as%20operations%20by%20%60resource.attributes.service.name%60%2C%20%60attributes.gen_ai.operation.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

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

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20where%20isnotnull%28%60attributes.gen_ai.usage.input_tokens%60%29%0A%7C%20stats%20sum%28%60attributes.gen_ai.usage.input_tokens%60%29%20as%20input_tokens%2C%0A%20%20%20%20%20%20%20%20sum%28%60attributes.gen_ai.usage.output_tokens%60%29%20as%20output_tokens%2C%0A%20%20%20%20%20%20%20%20count%28%29%20as%20calls%0A%20%20by%20serviceName%0A%7C%20eval%20total_tokens%20%3D%20input_tokens%20%2B%20output_tokens%0A%7C%20sort%20-%20total_tokens')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### Token usage over time

Monitor token consumption trends.

```sql
source = otel-v1-apm-span-*
| where isnotnull(`attributes.gen_ai.usage.input_tokens`)
| stats sum(`attributes.gen_ai.usage.input_tokens`) as input_tokens,
        sum(`attributes.gen_ai.usage.output_tokens`) as output_tokens
  by span(startTime, 5m) as time_bucket
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20where%20isnotnull%28%60attributes.gen_ai.usage.input_tokens%60%29%0A%7C%20stats%20sum%28%60attributes.gen_ai.usage.input_tokens%60%29%20as%20input_tokens%2C%0A%20%20%20%20%20%20%20%20sum%28%60attributes.gen_ai.usage.output_tokens%60%29%20as%20output_tokens%0A%20%20by%20span%28startTime%2C%205m%29%20as%20time_bucket')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### AI system usage breakdown

Which AI systems are being used and how often?

```sql
source = otel-v1-apm-span-*
| where isnotnull(`attributes.gen_ai.system`)
| stats count() as requests,
        sum(`attributes.gen_ai.usage.input_tokens`) as input_tokens,
        sum(`attributes.gen_ai.usage.output_tokens`) as output_tokens
  by `attributes.gen_ai.system`
| sort - requests
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20where%20isnotnull%28%60attributes.gen_ai.system%60%29%0A%7C%20stats%20count%28%29%20as%20requests%2C%0A%20%20%20%20%20%20%20%20sum%28%60attributes.gen_ai.usage.input_tokens%60%29%20as%20input_tokens%2C%0A%20%20%20%20%20%20%20%20sum%28%60attributes.gen_ai.usage.output_tokens%60%29%20as%20output_tokens%0A%20%20by%20%60attributes.gen_ai.system%60%0A%7C%20sort%20-%20requests')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

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

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20where%20%60attributes.gen_ai.operation.name%60%20%3D%20!%27execute_tool!%27%0A%7C%20stats%20count%28%29%20as%20executions%2C%0A%20%20%20%20%20%20%20%20avg%28durationInNanos%29%20as%20avg_latency%2C%0A%20%20%20%20%20%20%20%20max%28durationInNanos%29%20as%20max_latency%0A%20%20by%20%60attributes.gen_ai.tool.name%60%2C%20serviceName%0A%7C%20eval%20avg_ms%20%3D%20round%28avg_latency%20%2F%201000000%2C%201%29%0A%7C%20sort%20-%20executions')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

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

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20where%20%60attributes.gen_ai.operation.name%60%20%3D%20!%27invoke_agent!%27%0A%7C%20eval%20duration_ms%20%3D%20durationInNanos%20%2F%201000000%0A%7C%20stats%20avg%28duration_ms%29%20as%20avg_ms%2C%0A%20%20%20%20%20%20%20%20percentile%28duration_ms%2C%2095%29%20as%20p95_ms%2C%0A%20%20%20%20%20%20%20%20count%28%29%20as%20invocations%0A%20%20by%20serviceName%2C%20%60attributes.gen_ai.agent.name%60%0A%7C%20sort%20-%20p95_ms')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### Failed agent operations

Find agent operations that resulted in errors.

```sql
source = otel-v1-apm-span-*
| where isnotnull(`attributes.gen_ai.operation.name`) and status.code = 2
| sort - startTime
| head 20
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20where%20isnotnull%28%60attributes.gen_ai.operation.name%60%29%20and%20status.code%20%3D%202%0A%7C%20sort%20-%20startTime%0A%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

---

## SRE incident response

### Error rate percentage over time

Track the overall error rate trend - spot the moment things started going wrong.

```sql
| stats count() as total,
        sum(case(severityText = 'ERROR' or severityText = 'FATAL', 1 else 0)) as errors
  by span(time, 5m) as time_bucket
| eval error_pct = round(errors * 100.0 / total, 2)
| sort time_bucket
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count%28%29%20as%20total%2C%20sum%28case%28severityText%20%3D%20!%27ERROR!%27%20or%20severityText%20%3D%20!%27FATAL!%27%2C%201%20else%200%29%29%20as%20errors%20by%20span%28time%2C%205m%29%20as%20time_bucket%20%7C%20eval%20error_pct%20%3D%20round%28errors%20%2A%20100.0%20%2F%20total%2C%202%29%20%7C%20sort%20time_bucket')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### First error occurrence per service

Find when each service first started erroring - pinpoint the origin of an incident.

```sql
| where severityText = 'ERROR'
| stats earliest(time) as first_seen, count() as total_errors by `resource.attributes.service.name`
| sort first_seen
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20stats%20earliest%28time%29%20as%20first_seen%2C%20count%28%29%20as%20total_errors%20by%20%60resource.attributes.service.name%60%20%7C%20sort%20first_seen')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Error spike by service (timechart)

Visualize error spikes per service over time - the Splunk-style `timechart` equivalent.

```sql
| where severityText = 'ERROR'
| timechart span=5m count() by `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20timechart%20span%3D5m%20count%28%29%20by%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### P95 latency timeseries by service

Track latency degradation over time - the core SRE golden signal.

```sql
source = otel-v1-apm-span-*
| stats percentile(durationInNanos, 95) as p95_ns by span(startTime, 5m) as time_bucket, serviceName
| eval p95_ms = round(p95_ns / 1000000, 1)
| sort time_bucket
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20stats%20percentile%28durationInNanos%2C%2095%29%20as%20p95_ns%20by%20span%28startTime%2C%205m%29%20as%20time_bucket%2C%20serviceName%0A%7C%20eval%20p95_ms%20%3D%20round%28p95_ns%20%2F%201000000%2C%201%29%0A%7C%20sort%20time_bucket')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### Slowest operations by service

Find the most expensive operations to target for optimization.

```sql
source = otel-v1-apm-span-*
| stats avg(durationInNanos) as avg_ns, percentile(durationInNanos, 95) as p95_ns, count() as calls by serviceName, name
| eval avg_ms = round(avg_ns / 1000000, 1), p95_ms = round(p95_ns / 1000000, 1)
| sort - p95_ms
| head 20
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20stats%20avg%28durationInNanos%29%20as%20avg_ns%2C%20percentile%28durationInNanos%2C%2095%29%20as%20p95_ns%2C%20count%28%29%20as%20calls%20by%20serviceName%2C%20name%0A%7C%20eval%20avg_ms%20%3D%20round%28avg_ns%20%2F%201000000%2C%201%29%2C%20p95_ms%20%3D%20round%28p95_ns%20%2F%201000000%2C%201%29%0A%7C%20sort%20-%20p95_ms%0A%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

---

## Cross-signal correlation

### Logs for a specific trace

Jump from a trace to its associated logs using the traceId.

```sql
source = logs-otel-v1*
| where traceId = '<your-trace-id>'
| sort time
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

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query='%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20stats%20count%28%29%20as%20error_logs%20by%20%60resource.attributes.service.name%60%20%7C%20where%20error_logs%20%3E%2010%20%7C%20sort%20-%20error_logs')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

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
| sort - error_rate
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20stats%20count%28%29%20as%20total_spans%2C%0A%20%20%20%20%20%20%20%20sum%28case%28status.code%20%3D%202%2C%201%20else%200%29%29%20as%20error_spans%2C%0A%20%20%20%20%20%20%20%20avg%28durationInNanos%29%20as%20avg_latency_ns%0A%20%20by%20serviceName%0A%7C%20eval%20error_rate%20%3D%20round%28error_spans%20%2A%20100.0%20%2F%20total_spans%2C%202%29%2C%0A%20%20%20%20%20%20%20avg_latency_ms%20%3D%20round%28avg_latency_ns%20%2F%201000000%2C%201%29%0A%7C%20sort%20-%20error_rate')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### Log volume heatmap (by service and hour)

```sql
| eval hour = hour(time)
| stats count() as volume by `resource.attributes.service.name`, hour
| sort `resource.attributes.service.name`, hour
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query='%7C%20eval%20hour%20%3D%20hour%28time%29%20%7C%20stats%20count%28%29%20as%20volume%20by%20%60resource.attributes.service.name%60%2C%20hour%20%7C%20sort%20%60resource.attributes.service.name%60%2C%20hour')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Top error messages

```sql
| where severityText = 'ERROR'
| top 20 body
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query='%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20top%2020%20body')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

## Advanced analytics

### Outlier detection with eventstats

Use `eventstats` to compute per-group aggregates without collapsing rows, then flag outliers that deviate significantly from their service's baseline.

```sql
source = otel-v1-apm-span-*
| eventstats avg(durationInNanos) as svc_avg by serviceName
| eval deviation = durationInNanos - svc_avg
| where deviation > svc_avg * 2
| sort - deviation
| head 20
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20eventstats%20avg%28durationInNanos%29%20as%20svc_avg%20by%20serviceName%0A%7C%20eval%20deviation%20%3D%20durationInNanos%20-%20svc_avg%0A%7C%20where%20deviation%20%3E%20svc_avg%20%2A%202%0A%7C%20sort%20-%20deviation%0A%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

Find spans that take more than 3x the service average -- surface hidden performance outliers that percentile queries miss.

### Rolling window analysis with streamstats

Use `streamstats` to compute sliding-window aggregates over ordered events, ideal for detecting real-time latency regressions.

```sql
source = otel-v1-apm-span-*
| sort startTime
| streamstats window=20 avg(durationInNanos) as rolling_avg by serviceName
| eval current_ms = durationInNanos / 1000000, avg_ms = rolling_avg / 1000000
| where durationInNanos > rolling_avg * 3
| head 20
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20sort%20startTime%0A%7C%20streamstats%20window%3D20%20avg%28durationInNanos%29%20as%20rolling_avg%20by%20serviceName%0A%7C%20eval%20current_ms%20%3D%20durationInNanos%20%2F%201000000%2C%20avg_ms%20%3D%20rolling_avg%20%2F%201000000%0A%7C%20where%20durationInNanos%20%3E%20rolling_avg%20%2A%203%0A%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

Flag spans that exceed 3x the rolling 20-span average per service -- catch latency spikes as they happen.

### Smoothed latency trends with trendline

Use `trendline` to compute simple moving averages over sorted data, making it easy to spot sustained performance shifts versus momentary noise.

```sql
source = otel-v1-apm-span-*
| trendline sort startTime sma(5, durationInNanos) as short_trend sma(20, durationInNanos) as long_trend
| eval short_ms = short_trend / 1000000, long_ms = long_trend / 1000000
| eval trend = if(short_ms > long_ms, 'degrading', 'improving')
| head 50
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20trendline%20sort%20startTime%20sma%285%2C%20durationInNanos%29%20as%20short_trend%20sma%2820%2C%20durationInNanos%29%20as%20long_trend%0A%7C%20eval%20short_ms%20%3D%20short_trend%20%2F%201000000%2C%20long_ms%20%3D%20long_trend%20%2F%201000000%0A%7C%20eval%20trend%20%3D%20if%28short_ms%20%3E%20long_ms%2C%20!%27degrading!%27%2C%20!%27improving!%27%29%0A%7C%20head%2050')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

Compare short-term (5-span) versus long-term (20-span) moving averages to classify whether latency is degrading or improving.

---

## Masterclass pipelines

These multi-command pipelines combine several PPL features to solve real observability problems in a single query.

### Service health scorecard

A complete service health dashboard in one query -- error rates, latency percentiles, and automated health classification.

```sql
source = otel-v1-apm-span-*
| stats count() as total_spans,
        sum(case(status.code = 2, 1 else 0)) as error_spans,
        avg(durationInNanos) as avg_latency_ns,
        percentile(durationInNanos, 95) as p95_ns,
        percentile(durationInNanos, 99) as p99_ns
  by serviceName
| eval error_rate = round(error_spans * 100.0 / total_spans, 2),
       avg_ms = round(avg_latency_ns / 1000000, 1),
       p95_ms = round(p95_ns / 1000000, 1),
       p99_ms = round(p99_ns / 1000000, 1),
       health = case(
           error_rate > 5, 'CRITICAL',
           error_rate > 1, 'DEGRADED',
           p99_ms > 5000, 'SLOW'
           else 'HEALTHY')
| sort - error_rate
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20stats%20count%28%29%20as%20total_spans%2C%0A%20%20%20%20%20%20%20%20sum%28case%28status.code%20%3D%202%2C%201%20else%200%29%29%20as%20error_spans%2C%0A%20%20%20%20%20%20%20%20avg%28durationInNanos%29%20as%20avg_latency_ns%2C%0A%20%20%20%20%20%20%20%20percentile%28durationInNanos%2C%2095%29%20as%20p95_ns%2C%0A%20%20%20%20%20%20%20%20percentile%28durationInNanos%2C%2099%29%20as%20p99_ns%0A%20%20by%20serviceName%0A%7C%20eval%20error_rate%20%3D%20round%28error_spans%20%2A%20100.0%20%2F%20total_spans%2C%202%29%2C%0A%20%20%20%20%20%20%20avg_ms%20%3D%20round%28avg_latency_ns%20%2F%201000000%2C%201%29%2C%0A%20%20%20%20%20%20%20p95_ms%20%3D%20round%28p95_ns%20%2F%201000000%2C%201%29%2C%0A%20%20%20%20%20%20%20p99_ms%20%3D%20round%28p99_ns%20%2F%201000000%2C%201%29%2C%0A%20%20%20%20%20%20%20health%20%3D%20case%28%0A%20%20%20%20%20%20%20%20%20%20%20error_rate%20%3E%205%2C%20!%27CRITICAL!%27%2C%0A%20%20%20%20%20%20%20%20%20%20%20error_rate%20%3E%201%2C%20!%27DEGRADED!%27%2C%0A%20%20%20%20%20%20%20%20%20%20%20p99_ms%20%3E%205000%2C%20!%27SLOW!%27%0A%20%20%20%20%20%20%20%20%20%20%20else%20!%27HEALTHY!%27%29%0A%7C%20sort%20-%20error_rate')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

Combines `stats`, `eval`, and `case` to produce a single-query health scorecard across all services. Use this as a starting point for service-level dashboards.

### GenAI agent cost and performance analysis

Complete GenAI observability: latency, token usage, failure rate, and per-operation breakdown across all AI agents.

```sql
source = otel-v1-apm-span-*
| where isnotnull(`attributes.gen_ai.operation.name`)
| eval duration_ms = durationInNanos / 1000000,
       input_tokens = `attributes.gen_ai.usage.input_tokens`,
       output_tokens = `attributes.gen_ai.usage.output_tokens`,
       total_tokens = input_tokens + output_tokens
| stats count() as operations,
        avg(duration_ms) as avg_latency_ms,
        percentile(duration_ms, 95) as p95_ms,
        sum(total_tokens) as total_tokens,
        sum(case(status.code = 2, 1 else 0)) as failures
  by serviceName, `attributes.gen_ai.operation.name`, `attributes.gen_ai.system`
| eval failure_rate = round(failures * 100.0 / operations, 2),
       tokens_per_op = round(total_tokens / operations, 0)
| sort - total_tokens
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20where%20isnotnull%28%60attributes.gen_ai.operation.name%60%29%0A%7C%20eval%20duration_ms%20%3D%20durationInNanos%20%2F%201000000%2C%0A%20%20%20%20%20%20%20input_tokens%20%3D%20%60attributes.gen_ai.usage.input_tokens%60%2C%0A%20%20%20%20%20%20%20output_tokens%20%3D%20%60attributes.gen_ai.usage.output_tokens%60%2C%0A%20%20%20%20%20%20%20total_tokens%20%3D%20input_tokens%20%2B%20output_tokens%0A%7C%20stats%20count%28%29%20as%20operations%2C%0A%20%20%20%20%20%20%20%20avg%28duration_ms%29%20as%20avg_latency_ms%2C%0A%20%20%20%20%20%20%20%20percentile%28duration_ms%2C%2095%29%20as%20p95_ms%2C%0A%20%20%20%20%20%20%20%20sum%28total_tokens%29%20as%20total_tokens%2C%0A%20%20%20%20%20%20%20%20sum%28case%28status.code%20%3D%202%2C%201%20else%200%29%29%20as%20failures%0A%20%20by%20serviceName%2C%20%60attributes.gen_ai.operation.name%60%2C%20%60attributes.gen_ai.system%60%0A%7C%20eval%20failure_rate%20%3D%20round%28failures%20%2A%20100.0%20%2F%20operations%2C%202%29%2C%0A%20%20%20%20%20%20%20tokens_per_op%20%3D%20round%28total_tokens%20%2F%20operations%2C%200%29%0A%7C%20sort%20-%20total_tokens')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

Breaks down every GenAI operation by service, operation type, and AI system. Use this to track cost drivers, identify high-failure operations, and compare AI provider performance.

### Envoy access log analysis

Parse raw Envoy access logs into an API traffic dashboard -- method, path, and status class breakdown.

```sql
source = logs-otel-v1*
| where `resource.attributes.service.name` = 'frontend-proxy'
| grok body '\[%{GREEDYDATA:timestamp}\] "%{WORD:method} %{URIPATH:path} HTTP/%{NUMBER}" %{POSINT:status}'
| where isnotnull(method)
| eval status_class = case(
       cast(status as int) < 200, '1xx',
       cast(status as int) < 300, '2xx',
       cast(status as int) < 400, '3xx',
       cast(status as int) < 500, '4xx'
       else '5xx')
| stats count() as requests by method, path, status_class
| sort - requests
| head 30
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1%2A%0A%7C%20where%20%60resource.attributes.service.name%60%20%3D%20!%27frontend-proxy!%27%0A%7C%20grok%20body%20!%27%5C%5B%25%7BGREEDYDATA%3Atimestamp%7D%5C%5D%20%22%25%7BWORD%3Amethod%7D%20%25%7BURIPATH%3Apath%7D%20HTTP%2F%25%7BNUMBER%7D%22%20%25%7BPOSINT%3Astatus%7D!%27%0A%7C%20where%20isnotnull%28method%29%0A%7C%20eval%20status_class%20%3D%20case%28%0A%20%20%20%20%20%20%20cast%28status%20as%20int%29%20%3C%20200%2C%20!%271xx!%27%2C%0A%20%20%20%20%20%20%20cast%28status%20as%20int%29%20%3C%20300%2C%20!%272xx!%27%2C%0A%20%20%20%20%20%20%20cast%28status%20as%20int%29%20%3C%20400%2C%20!%273xx!%27%2C%0A%20%20%20%20%20%20%20cast%28status%20as%20int%29%20%3C%20500%2C%20!%274xx!%27%0A%20%20%20%20%20%20%20else%20!%275xx!%27%29%0A%7C%20stats%20count%28%29%20as%20requests%20by%20method%2C%20path%2C%20status_class%0A%7C%20sort%20-%20requests%0A%7C%20head%2030')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

Uses `grok` to extract structured fields from unstructured proxy logs, then aggregates into an API traffic summary. Adapt the grok pattern for other log formats.

### Automatic error pattern discovery

Cluster error messages into patterns per service with zero regex -- PPL's killer feature for incident triage.

```sql
source = logs-otel-v1*
| where severityText = 'ERROR'
| patterns body method=brain mode=aggregation by `resource.attributes.service.name`
| sort - pattern_count
| head 20
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1%2A%0A%7C%20where%20severityText%20%3D%20!%27ERROR!%27%0A%7C%20patterns%20body%20method%3Dbrain%20mode%3Daggregation%20by%20%60resource.attributes.service.name%60%0A%7C%20sort%20-%20pattern_count%0A%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

The `patterns` command with `method=brain` uses ML-based clustering to group similar error messages. During an incident, run this first to see the shape of the problem without writing a single regex.

### Cross-signal correlation: logs meet traces

Correlate error logs with error spans across indices -- find which trace operations cause which log errors.

```sql
source = logs-otel-v1*
| where severityText = 'ERROR'
| where traceId != ''
| left join left=l right=r on l.traceId = r.traceId [
    source = otel-v1-apm-span-*
    | where status.code = 2
    | eval span_duration_ms = durationInNanos / 1000000
    | sort - span_duration_ms
    | head 1000
  ]
| where isnotnull(r.serviceName)
| stats count() as correlated_errors by l.`resource.attributes.service.name`, r.serviceName, r.name
| sort - correlated_errors
| head 20
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1%2A%0A%7C%20where%20severityText%20%3D%20!%27ERROR!%27%0A%7C%20where%20traceId%20%21%3D%20!%27!%27%0A%7C%20left%20join%20left%3Dl%20right%3Dr%20on%20l.traceId%20%3D%20r.traceId%20%5B%0A%20%20%20%20source%20%3D%20otel-v1-apm-span-%2A%0A%20%20%20%20%7C%20where%20status.code%20%3D%202%0A%20%20%20%20%7C%20eval%20span_duration_ms%20%3D%20durationInNanos%20%2F%201000000%0A%20%20%20%20%7C%20sort%20-%20span_duration_ms%0A%20%20%20%20%7C%20head%201000%0A%20%20%5D%0A%7C%20where%20isnotnull%28r.serviceName%29%0A%7C%20stats%20count%28%29%20as%20correlated_errors%20by%20l.%60resource.attributes.service.name%60%2C%20r.serviceName%2C%20r.name%0A%7C%20sort%20-%20correlated_errors%0A%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

Joins error logs with error spans using `traceId` to reveal which span operations are responsible for which log errors. This cross-index join is one of PPL's most powerful capabilities for root cause analysis.

---

## Query tips

### Backtick field names with dots

OpenTelemetry attributes contain dots. Wrap them in backticks:

```sql
| where isnotnull(`resource.attributes.service.name`)
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
