---
title: "trendline"
description: "Calculate moving averages - simple (SMA) and weighted (WMA) for trend analysis and smoothing."
---

import { Tabs, TabItem, Aside } from '@astrojs/starlight/components';

<Aside type="caution">
**Experimental** since OpenSearch 3.0 - syntax may change based on community feedback.
</Aside>

The `trendline` command calculates moving averages over a sorted sequence of events. It supports two types:

- **SMA (Simple Moving Average)** - all data points in the window are weighted equally.
- **WMA (Weighted Moving Average)** - more recent data points receive higher weight, making the average more responsive to recent changes.

Use `trendline` to smooth noisy time-series data, reveal underlying trends in latency or throughput, and detect gradual shifts in system behavior.

## Syntax

```sql
trendline [sort [+|-] <sort-field>]
  (sma | wma)(<number-of-datapoints>, <field>) [as <alias>]
  [(sma | wma)(<number-of-datapoints>, <field>) [as <alias>]]...
```

## Arguments

| Parameter | Required | Description |
|-----------|----------|-------------|
| `sort [+\|-] <sort-field>` | No | The field used to order data before calculating the moving average. `+` for ascending (default, nulls first), `-` for descending (nulls last). If omitted, data is processed in its current order. |
| `sma \| wma` | Yes | The type of moving average. `sma` = simple moving average (equal weight); `wma` = weighted moving average (recent values weighted more). |
| `<number-of-datapoints>` | Yes | The window size -- number of data points used to calculate each average. Must be greater than zero. |
| `<field>` | Yes | The numeric field to compute the moving average over. |
| `<alias>` | No | Name for the output column. Default: `<field>_trendline`. |

## SMA vs WMA

**Simple Moving Average (SMA):** The arithmetic mean of the last *n* values. Given values `[v1, v2, ..., vn]`, the SMA is `(v1 + v2 + ... + vn) / n`.

**Weighted Moving Average (WMA):** More recent values receive proportionally higher weight. Given values `[v1, v2, ..., vn]` where `vn` is the most recent, the WMA is `(1*v1 + 2*v2 + ... + n*vn) / (1 + 2 + ... + n)`.

WMA reacts faster to changes, making it better for detecting recent shifts. SMA is more stable and resistant to short-term noise.

## Usage notes

- **The first `n-1` rows will have `null`** for the moving average because there are not yet enough data points to fill the window.
- **Null field values cause the row to be excluded** from the trendline output.
- **Multiple trendlines** can be calculated in a single command -- for example, a short-window and long-window SMA on the same field to detect crossovers.
- **Sort your data** before applying `trendline`, or use the built-in `sort` parameter. For time-series data, sort by timestamp.

## Examples

### Simple moving average over 5 data points

Smooth span latency with a 5-point SMA:

```sql
source = otel-v1-apm-span-*
| trendline sort startTime sma(5, durationInNanos) as latency_trend
| head 50
```

### Multiple trendlines in one command

Compute both an SMA and WMA on latency simultaneously to compare smoothing behavior:

```sql
source = otel-v1-apm-span-*
| trendline sort startTime sma(5, durationInNanos) as sma_latency wma(5, durationInNanos) as wma_latency
| head 50
```

### Default alias

When no alias is specified, the output column is named `<field>_trendline`:

```sql
source = otel-v1-apm-span-*
| trendline sort startTime sma(5, durationInNanos)
| head 50
```

### Weighted moving average

WMA gives more weight to recent values, producing a trend that reacts faster:

```sql
source = otel-v1-apm-span-*
| trendline sort startTime wma(5, durationInNanos)
| head 50
```

## Extended examples

### Latency trend for trace spans

Sort spans by time and calculate a 5-span SMA of duration to smooth out latency noise:

```sql
source = otel-v1-apm-span-*
| trendline sort startTime sma(5, durationInNanos) as latency_sma wma(5, durationInNanos) as latency_wma
| eval sma_ms = latency_sma / 1000000, wma_ms = latency_wma / 1000000
| head 50
```

Both SMA and WMA are computed side by side, making it easy to compare the smoother SMA with the more reactive WMA.

### Token usage trend for AI agents

Track the moving average of token consumption over time for a generative AI service:

```sql
source = otel-v1-apm-span-*
| where `attributes.gen_ai.usage.output_tokens` > 0
| trendline sort startTime sma(10, `attributes.gen_ai.usage.output_tokens`) as token_trend
| head 100
```

## See also

- [streamstats](/docs/ppl/commands/streamstats/) - cumulative and rolling window statistics with more control
- [eventstats](/docs/ppl/commands/eventstats/) - add group-level aggregates to every event
- [stats](/docs/ppl/commands/stats/) - aggregate and collapse rows
- [Command Reference](/docs/ppl/commands/) - all PPL commands
