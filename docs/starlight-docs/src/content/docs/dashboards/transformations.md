---
title: "Visualization Transformations"
description: "Reshape query results with a user-defined transformation pipeline before they reach the chart"
sidebar:
  order: 20
---

The visualization editor has a **Transform** tab (next to **Query**) where you can reshape the query result before it reaches the chart — without touching the underlying query. Transformations are applied as a user-defined pipeline: each step takes the previous step's output and produces new data for the next.

![Transform tab with Filter Fields and Filter steps](https://github.com/opensearch-project/observability-stack/releases/download/v3.6.0-alpha.1/transformations.webp)

This is useful when:

- You want several panels driven by the same query, each shaped differently — line chart of timestamps + response time, bar chart of top-10 hosts, and so on.
- You want to add a derived field (success rate, ratio, normalized value) without rewriting the query.
- You want to flip between views by toggling steps on and off, instead of editing and re-running the query.

Each step is a draggable card. You can edit, hide (skip without deleting), reorder, or remove steps. Hidden steps stay in the pipeline so you can re-enable them later.

## Available transformations

| Transformation | What it does | Equivalent PPL |
|---|---|---|
| **Limit** | Keep only the first N rows. | `\| head 10` |
| **Filter** | Keep or discard rows by a field condition. Operators adapt to the field type — all fields support `equals`, `not equals`, `contains`, `not contains`; numeric fields add `>`, `>=`, `<`, `<=`; date fields add `is earlier`, `is earlier or equal`, `is later`, `is later or equal`. | `\| where status_code >= 500` |
| **Filter Fields** | Show or hide columns. **Include** keeps only the selected fields; **Exclude** removes them. | `\| fields timestamp, host, response_time_ms` |
| **Sort** | Sort rows by any field, ascending or descending. | `\| sort response_time_ms` |
| **Add Field** | Derive a new column from existing ones. **Binary** does field-vs-field or field-vs-constant arithmetic (`+`, `-`, `*`, `/`); **Unary** applies `abs`, `ceil`, `floor`, or `round` to a single field; **Cross-field** computes `total` or `mean` across multiple fields per row, or evaluates a free-form `${field}`-substituted expression. | `\| eval success_rate = successful / requests` |
| **Group By** | Group rows by a field and aggregate the others. Aggregations are type-aware — numeric fields support `total`, `mean`, `median`, `min`, `max`, `variance`, `count`, `distinct_count`, `first`/`last` (and their `*` skip-nulls variants); date fields support `min`, `max`, `count`, `distinct_count`, `first`, `last`; string fields support `count`, `distinct_count`, `first`, `last`. | `\| stats sum(response_time_ms) by host` |
| **Extract Fields** | Flatten a nested object or JSON-string field into top-level columns, with an optional column prefix. | — |
| **Convert Field Type** | Convert values to `string`, `number`, `boolean`, or `date`. | — |

## Example: top 10 slowest error requests

Starting from a base query that returns request logs, build a bar chart with this pipeline:

1. **Filter** — `status_code >= 500`
2. **Sort** — `response_time_ms` descending
3. **Limit** — 10 rows
4. **Filter Fields** — Include `host`, `response_time_ms`, `status_code`

Switch to a different question without touching the query — toggle off the **Filter** step and the same pipeline now gives you the 10 slowest requests across *all* status codes.

## When to use a transformation vs. change the query

- Use a transformation when you want **multiple views from the same query**, want to **toggle a slice on and off quickly**, or need a **derived column** that's awkward in PPL/PromQL.
- Change the query itself when the data you need isn't in the current result set, or when filtering server-side would be much cheaper than fetching everything and filtering in the browser.

## Related

- [Build a Dashboard](/docs/dashboards/build/) — adding panels and configuring chart-specific options
- [Dashboard variables](/docs/dashboards/variables/) — parameterize panels with dropdowns
- [Discover Logs](/docs/investigate/discover-logs/) — write the underlying PPL query
- [Discover Metrics](/docs/investigate/discover-metrics/) — write the underlying PromQL query
