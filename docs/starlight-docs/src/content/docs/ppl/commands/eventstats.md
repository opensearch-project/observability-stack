---
title: "eventstats"
description: "Add aggregation statistics as new fields to every event - enrich each row with group-level context."
---

import { Tabs, TabItem, Aside } from '@astrojs/starlight/components';

<Aside type="caution">
**Experimental** since OpenSearch 3.1 - syntax may change based on community feedback.
</Aside>

The `eventstats` command calculates summary statistics and appends them as new fields to **every** event in your results. Unlike `stats`, which collapses rows into an aggregation table, `eventstats` preserves every original event and adds the computed values alongside.

This makes `eventstats` ideal for comparing individual events against group-level context -- flagging outliers, calculating deviation from the norm, or adding percentile baselines to each row.

## Syntax

```sql
eventstats [bucket_nullable=<bool>] <function>... [by <by-clause>]
```

## Arguments

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<function>` | Yes | One or more aggregation functions (e.g., `avg(field)`, `count()`, `max(field)`). Each produces a new field in every row. |
| `bucket_nullable` | No | Whether `null` values form their own group in `by` aggregations. Default is controlled by `plugins.ppl.syntax.legacy.preferred`. |
| `<by-clause>` | No | Group results by one or more fields or expressions. Syntax: `by [span-expression,] [field,]...`. Without a `by` clause, statistics are computed across all events. |
| `span(<field>, <interval>)` | No | Split a numeric or time field into buckets. Example: `span(durationInNanos, 1000000000)` creates 1-second buckets; `span(time, 1h)` creates hourly buckets. |

### Time units for span expressions

`ms` (milliseconds), `s` (seconds), `m` (minutes), `h` (hours), `d` (days), `w` (weeks), `M` (months), `q` (quarters), `y` (years).

## Supported aggregation functions

`COUNT`, `SUM`, `AVG`, `MAX`, `MIN`, `VAR_SAMP`, `VAR_POP`, `STDDEV_SAMP`, `STDDEV_POP`, `DISTINCT_COUNT` / `DC`, `EARLIEST`, `LATEST`.

## Usage notes

- **Use `eventstats` when you need both the raw event and the aggregate.** If you only need the aggregation table, use `stats` instead -- it is faster.
- **Combine with `eval` and `where`** to calculate deviations or filter outliers. For example, compute `avg(latency)` per service with `eventstats`, then `eval deviation = latency - avg_latency` and `where deviation > threshold`.
- **Span expressions** let you bucket time or numeric fields, which is useful for comparing events within time windows.
- **`bucket_nullable=false`** excludes rows with `null` group-by values from aggregation (their aggregated field is also `null`). Use `bucket_nullable=true` to treat `null` as a valid group.

## Examples

### Average, sum, and count by group

Calculate aggregate latency statistics per service and add them to every span:

```sql
source = otel-v1-apm-span-*
| eventstats avg(durationInNanos), sum(durationInNanos), count() by serviceName
| head 50
```

Every row retains its original fields, plus new aggregate columns with the group-level values.

### Count by span and group

Count trace spans within 1-hour time buckets, grouped by service:

```sql
source = otel-v1-apm-span-*
| eventstats count() as cnt by span(startTime, 1h) as time_bucket, serviceName
| head 50
```

### Filter after enrichment

Add the service-level average latency, then keep only spans that deviate significantly:

```sql
source = otel-v1-apm-span-*
| eventstats avg(durationInNanos) as avg_duration by serviceName
| eval deviation = durationInNanos - avg_duration
| where abs(deviation) > avg_duration * 2
| sort - deviation
```

### Null bucket handling

Exclude `null` group-by values from aggregation:

```sql
source = otel-v1-apm-span-*
| eventstats bucket_nullable=false count() as cnt by `status.code`
| head 50
```

Rows where `status.code` is `null` receive `null` for `cnt`.

## Extended examples

### Add service average latency to each span

Compute per-service average latency and attach it to every span, then identify outliers:

```sql
source = otel-v1-apm-span-*
| eventstats avg(durationInNanos) as avg_duration by serviceName
| eval deviation = durationInNanos - avg_duration
| where deviation > avg_duration * 2
| sort - deviation
| head 20
```

### Flag high-severity log spikes per service

Count logs per service and severity, then flag services with unusually high error counts:

```sql
source = logs-otel-v1*
| eventstats count() as svc_error_count by `resource.attributes.service.name`, severityText
| where severityText = 'ERROR'
| eventstats avg(svc_error_count) as avg_errors
| where svc_error_count > avg_errors * 3
| dedup `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20eventstats%20count%28%29%20as%20svc_error_count%20by%20%60resource.attributes.service.name%60%2C%20severityText%20%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20eventstats%20avg%28svc_error_count%29%20as%20avg_errors%20%7C%20where%20svc_error_count%20%3E%20avg_errors%20%2A%203%20%7C%20dedup%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## See also

- [stats](/docs/ppl/commands/stats/) - aggregate and collapse rows
- [streamstats](/docs/ppl/commands/streamstats/) - cumulative and rolling window statistics
- [trendline](/docs/ppl/commands/trendline/) - moving averages
- [Command Reference](/docs/ppl/commands/) - all PPL commands
