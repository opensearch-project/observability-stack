---
title: "streamstats"
description: "Calculate cumulative and rolling window statistics - running totals, moving averages, and trend detection."
---

import { Tabs, TabItem, Aside } from '@astrojs/starlight/components';

<Aside type="caution">
**Experimental** since OpenSearch 3.4 - syntax may change based on community feedback.
</Aside>

The `streamstats` command calculates cumulative or rolling statistics as events are processed in order. Unlike `stats` (which collapses to an aggregation table) or `eventstats` (which computes over the entire dataset at once), `streamstats` processes events incrementally -- each row's statistics reflect only the events seen so far.

This makes `streamstats` ideal for running totals, moving averages, trend detection, and any analysis that depends on the sequence of events.

## Syntax

```sql
streamstats [bucket_nullable=<bool>] [current=<bool>] [window=<int>] [global=<bool>]
  [reset_before="(<eval-expression>)"] [reset_after="(<eval-expression>)"]
  <function>... [by <by-clause>]
```

## Arguments

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<function>` | Yes | One or more aggregation functions (e.g., `avg(field)`, `sum(field)`, `count()`). |
| `current` | No | Include the current event in the calculation. Default: `true`. Set to `false` to use only previous events. |
| `window` | No | Number of events in the sliding window. Default: `0` (all previous and current events). |
| `global` | No | When `window` is set, determines whether a single window is used across all rows (`true`) or separate windows per `by` group (`false`). Default: `true`. |
| `reset_before` | No | Reset all accumulated statistics **before** processing an event when the expression evaluates to `true`. Syntax: `reset_before="(<eval-expression>)"`. |
| `reset_after` | No | Reset all accumulated statistics **after** processing an event when the expression evaluates to `true`. The expression can reference fields produced by `streamstats`. Syntax: `reset_after="(<eval-expression>)"`. |
| `bucket_nullable` | No | Whether `null` values form their own group in `by` aggregations. Default is controlled by `plugins.ppl.syntax.legacy.preferred`. |
| `<by-clause>` | No | Group results by one or more fields. Each group gets its own running calculation. Syntax: `by [span-expression,] [field,]...`. |

## Comparing stats, eventstats, and streamstats

| Aspect | `stats` | `eventstats` | `streamstats` |
|--------|---------|--------------|---------------|
| Output | Aggregation table only | Original events + aggregate fields | Original events + running aggregate fields |
| Scope | All events (or per group) | All events (or per group), result added to every row | Incremental -- each row reflects events seen so far |
| Use case | Summary reports | Compare individual events to group totals | Running totals, moving averages, trend detection |

## Supported aggregation functions

`COUNT`, `SUM`, `AVG`, `MAX`, `MIN`, `VAR_SAMP`, `VAR_POP`, `STDDEV_SAMP`, `STDDEV_POP`, `DISTINCT_COUNT` / `DC`, `EARLIEST`, `LATEST`.

## Usage notes

- **Sort your data first.** `streamstats` processes events in the order they arrive. For time-series analysis, pipe through `sort` before `streamstats`.
- **`window` controls the sliding window size.** Use `window=10` to compute statistics over the last 10 events. Without `window`, statistics accumulate over all events seen so far.
- **`current=false`** excludes the current event from the calculation, so the first row always has `null` statistics. This is useful for comparing each event to the state *before* it arrived.
- **`global=true` vs `global=false`** matters when combining `window` with `by`. With `global=true`, the window slides across all rows but aggregation is per-group. With `global=false`, each group gets its own independent window.
- **Reset conditions** let you restart accumulation based on data patterns -- useful for session boundaries or partition changes.

## Examples

### Running average, sum, and count by group

```sql
source = otel-v1-apm-span-*
| sort startTime
| streamstats avg(durationInNanos) as running_avg, sum(durationInNanos) as running_sum, count() as running_count by serviceName
| head 50
```

Each row shows the running statistics computed from spans seen so far within its service group.

### Rolling maximum over a 2-row window

Compute the maximum latency from the previous 2 spans (excluding the current span):

```sql
source = otel-v1-apm-span-*
| sort startTime
| streamstats current=false window=2 max(durationInNanos) as prev_max_latency
| head 50
```

The first row has `null` because no previous events exist.

### Global vs group-specific windows

With `global=true`, the window slides across all rows but aggregation respects the `by` group:

```sql
source = otel-v1-apm-span-*
| sort startTime
| streamstats window=5 global=true avg(durationInNanos) as running_avg by serviceName
| head 50
```

With `global=false`, each `by` group gets its own independent window:

```sql
source = otel-v1-apm-span-*
| sort startTime
| streamstats window=5 global=false avg(durationInNanos) as running_avg by serviceName
| head 50
```

The difference is visible when services are interleaved. With `global=false`, each service's window only counts spans from that service.

### Conditional reset

Reset running statistics when latency crosses a threshold:

```sql
source = otel-v1-apm-span-*
| sort startTime
| streamstats current=false reset_before="(durationInNanos > 10000000000)" reset_after="(durationInNanos < 1000000)" avg(durationInNanos) as avg_latency by serviceName
| head 50
```

Statistics reset **before** processing any span with latency above 10 seconds, and **after** processing any span with latency below 1 millisecond.

## Extended examples

### Rolling average latency per service

Sort spans by time, then compute a 10-span rolling average latency for each service:

```sql
source = otel-v1-apm-span-*
| sort startTime
| streamstats window=10 avg(durationInNanos) as rolling_avg_latency by serviceName
| eval rolling_avg_ms = rolling_avg_latency / 1000000
| head 50
```

### Cumulative error count per service

Track the running count of error logs per service over time:

```sql
source = logs-otel-v1*
| where severityText = 'ERROR'
| sort time
| streamstats count() as cumulative_errors by `resource.attributes.service.name`
| head 100
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20sort%20time%20%7C%20streamstats%20count%28%29%20as%20cumulative_errors%20by%20%60resource.attributes.service.name%60%20%7C%20head%20100')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## See also

- [eventstats](/docs/ppl/commands/eventstats/) - add group-level statistics to every event
- [trendline](/docs/ppl/commands/trendline/) - simple and weighted moving averages
- [stats](/docs/ppl/commands/stats/) - aggregate and collapse rows
- [Command Reference](/docs/ppl/commands/) - all PPL commands
