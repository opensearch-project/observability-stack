---
title: "stats"
description: "Calculate aggregate statistics over search results - counts, averages, percentiles, and more with grouping."
---

## Description

The `stats` command is the primary aggregation command in PPL. It calculates statistics such as `count`, `sum`, `avg`, `min`, `max`, `percentile`, and more across your search results. Use it whenever you need to summarize data -- whether that means counting error logs per service, computing average response latency, tracking token usage over time, or building the numbers behind a dashboard panel.

Results can be grouped using the `by` clause with one or more fields, and time-series bucketing is supported through the `span()` expression. When no `by` clause is provided, `stats` returns a single row representing the aggregation over the entire result set.

`stats` is the workhorse command for dashboards, alerting thresholds, and investigative queries.

---

## Syntax

```sql
stats [bucket_nullable=<bool>] <aggregation> [, <aggregation>]... [by <span-expression>, <field-list>]
```

---

## Arguments

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<aggregation>` | Yes | One or more aggregation functions (see table below). Multiple aggregations are comma-separated. Use `as` to alias the output field name. |
| `by <field-list>` | No | Groups results by one or more fields. Without a `by` clause, stats returns one row aggregating all results. |
| `by <span-expression>` | No | Splits a field into time or numeric buckets. Syntax: `span(field, interval)`. At most one span expression per query. The span is always treated as the first grouping key regardless of position. |
| `bucket_nullable` | No | When `false`, excludes records where the group-by field is null, improving performance. Default depends on `plugins.ppl.syntax.legacy.preferred`. |

### Supported aggregation functions

| Function | Description |
|----------|-------------|
| `count()` | Count of all events (including nulls). Alias: `c()`. |
| `count(<field>)` | Count of events where field is not null. |
| `sum(<field>)` | Sum of numeric values. |
| `avg(<field>)` | Average of numeric values. |
| `max(<field>)` | Maximum value. |
| `min(<field>)` | Minimum value. |
| `var_samp(<field>)` | Sample variance. |
| `var_pop(<field>)` | Population variance. |
| `stddev_samp(<field>)` | Sample standard deviation. |
| `stddev_pop(<field>)` | Population standard deviation. |
| `distinct_count(<field>)` | Approximate count of distinct values. Alias: `dc()`. |
| `percentile(<field>, <percent>)` | Percentile value (e.g. `percentile(duration, 95)`). Alias: `percentile_approx()`. |
| `median(<field>)` | 50th percentile (shorthand for `percentile(field, 50)`). |
| `first(<field>)` | First non-null value encountered. |
| `last(<field>)` | Last non-null value encountered. |
| `list(<field>)` | Collects all values into an array, preserving duplicates and order. |
| `values(<field>)` | Collects unique values into a sorted array (duplicates removed). |
| `take(<field>, <n>)` | Returns a list of up to `n` original values. |
| `earliest(<field>)` | Earliest value by timestamp. |
| `latest(<field>)` | Latest value by timestamp. |

---

## Usage notes

- **Multiple aggregations in a single `stats`**: Separate them with commas. Each produces its own output column.
  ```sql
  | stats count() as total, avg(duration) as avg_dur, max(duration) as max_dur by service
  ```

- **Naming output fields with `as`**: Without an alias, the column name is the function call itself (e.g. `avg(severityNumber)`). Always alias for readability.

- **`count()` vs `count(field)`**: `count()` counts all events including those where a field is null. `count(field)` only counts events where `field` is non-null.

- **Span intervals -- numeric**: `span(severityNumber, 4)` creates buckets of width 4 (1, 5, 9, 13, ...).

- **Span intervals -- time**: `span(time, 1h)` creates hourly buckets. Valid time units: `ms` (millisecond), `s` (second), `m` (minute), `h` (hour), `d` (day), `w` (week), `M` (month), `q` (quarter), `y` (year).

- **Span is always the first grouping key**: Even if you write `by severityText, span(time, 5m)`, the span is promoted to the first position in the output.

- **Null handling in group-by**: By default, null values in group-by fields produce a null bucket. Set `bucket_nullable=false` to exclude null groups for cleaner output and faster performance.

- **Eval expressions inside aggregations**: You can embed expressions directly, e.g. `sum(durationInNanos / 1000000)`.

- **High-cardinality fields**: Aggregations over fields with many distinct values (like URLs or trace IDs) use approximate bucket counts. Results may be approximate for the long tail.

- **Ascending doc_count sort caveat**: When sorting by count in ascending order on high-cardinality fields, globally rare terms may be missed due to shard-level approximation.

---

## Basic examples

### Count all log events

```sql
source = logs-otel-v1*
| stats count()
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count%28%29%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Average severity by service

```sql
source = logs-otel-v1*
| stats avg(severityNumber) by `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20avg%28severityNumber%29%20by%20%60resource.attributes.service.name%60%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Multiple aggregations

```sql
source = logs-otel-v1*
| stats avg(severityNumber) as avg_severity, max(severityNumber) as max_severity, count() as cnt by `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20avg%28severityNumber%29%20as%20avg_severity%2C%20max%28severityNumber%29%20as%20max_severity%2C%20count%28%29%20as%20cnt%20by%20%60resource.attributes.service.name%60%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Time bucketing with span

```sql
source = logs-otel-v1*
| stats count() as log_count by span(time, 10m) as time_bucket
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count%28%29%20as%20log_count%20by%20span%28time%2C%2010m%29%20as%20time_bucket%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Percentile calculation

```sql
source = otel-v1-apm-span-*
| stats percentile(durationInNanos, 90) as p90 by serviceName
```

[Try in Playground](https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20stats%20percentile%28durationInNanos%2C%2090%29%20as%20p90%20by%20serviceName')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### First and last occurrence

Find the first and last error timestamp per service, along with the total error count:

```sql
source = logs-otel-v1*
| where severityText = 'ERROR'
| stats earliest(time) as first_error, latest(time) as last_error, count() as total by `resource.attributes.service.name`
| sort first_error
```

[Try in Playground](https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1%2A%0A%7C%20where%20severityText%20%3D%20!%27ERROR!%27%0A%7C%20stats%20earliest%28time%29%20as%20first_error%2C%20latest%28time%29%20as%20last_error%2C%20count%28%29%20as%20total%20by%20%60resource.attributes.service.name%60%0A%7C%20sort%20first_error')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

---

## Extended examples

### OTel: Error rate by service

Calculate the error rate per service by comparing error-severity log counts to total log counts.

```sql
| stats count() as total,
        sum(case(severityText = 'ERROR' or severityText = 'FATAL', 1 else 0)) as errors
    by `resource.attributes.service.name`
| eval error_rate = errors * 100.0 / total
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count()%20as%20total%2C%20sum(case(severityText%20%3D%20!%27ERROR!%27%20or%20severityText%20%3D%20!%27FATAL!%27%2C%201%20else%200))%20as%20errors%20by%20%60resource.attributes.service.name%60%20%7C%20eval%20error_rate%20%3D%20errors%20*%20100.0%20%2F%20total')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### OTel: Log volume over time

Track how many log events arrive per 5-minute window, broken down by severity.

```sql
| stats count() as log_count by span(time, 5m) as time_bucket, severityText
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count()%20as%20log_count%20by%20span(time%2C%205m)%20as%20time_bucket%2C%20severityText')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

## See also

- [eval](/docs/ppl/commands/eval/) -- create computed fields from aggregation results
- [sort](/docs/ppl/commands/sort/) -- order aggregated results
- [where](/docs/ppl/commands/where/) -- filter before aggregating
- [head](/docs/ppl/commands/head/) -- limit output rows
