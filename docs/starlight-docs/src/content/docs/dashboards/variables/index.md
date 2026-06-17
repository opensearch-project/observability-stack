---
title: "Dashboard Variables"
description: "Parameterize dashboards with dropdown variables that drive panel queries"
sidebar:
  order: 15
---

Variables let you parameterize a dashboard. A variable appears as a dropdown in the dashboard header; panel queries reference it by name and re-run automatically when the value changes. This means one dashboard can serve every service, environment, or region instead of being copied per target.

![Dashboard with variable dropdowns in the header](https://github.com/opensearch-project/observability-stack/releases/download/v3.6.0-alpha.1/dashboard-variables.webp)

Use dashboard variables to:

- Change query parameters without editing visualizations.
- Define values once and reference them across multiple visualizations.
- Automatically update visualizations when variable values change.
- Create cascading filters with dependent variables.
- Dynamically control grouping, aggregation, and time intervals.

## Variable types

OpenSearch Dashboards supports two variable types:

| Type | Options come from | Use when |
|---|---|---|
| **Query** | A PPL or PromQL query against a data source | Options should match what's actually in your data (services, regions, hosts) |
| **Custom** | A static list you define | You want a fixed set of choices (environments, severity levels) |

## Adding a variable

![Add variable flyout with type, query, and option preview](https://github.com/opensearch-project/observability-stack/releases/download/v3.6.0-alpha.1/add-variable.webp)

1. Open a dashboard in **Edit** mode.
2. Expand the **Variables** bar at the top of the dashboard and select **Add variable**.
3. Configure the variable:
   - **Name** — used to reference the variable in queries (letters, digits, and underscores; must start with a letter or underscore).
   - **Label** — optional display name shown above the dropdown.
   - **Type** — **Query** or **Custom**.
   - **Multi-select** — let viewers pick more than one value at a time.
   - **Include All** — adds an **All** option that selects every value at once (only with multi-select).
   - **Sort** — alphabetical or numerical, ascending or descending.
   - **Hide** — keep the variable in memory but hide its dropdown.
   - For **Query** variables: choose a data source, write the query (PPL or PromQL) that returns the option list, optionally set a **Regex** filter, and pick when to **Refresh** the options — **On dashboard load** (default) or **On time range change**.
   - For **Custom** variables: enter the static option list (up to 100 options are displayed).
4. Use the **Preview** button to check that the query returns the values you expect, then **Save**.

For detailed edit, delete, reorder, and visibility controls, see [Managing Variables](/docs/dashboards/variables/managing-variables/).

## Variable syntax

Use `$variableName` for most references:

```sql
source = logs-otel-v1*
| where `resource.attributes.service.name` = '$service'
| stats count() by span(time, 1m)
```

Use `${variableName}` when the variable name is followed by other characters without whitespace:

```sql
source = logs
| where ${env}_level = "error"
```

Braced syntax prevents `$env_level` from being interpreted as a different variable named `env_level`.

## Referencing a variable in a panel query

Use `$name` or `${name}` anywhere in a panel query:

```sql
source = logs-otel-v1*
| where `resource.attributes.service.name` = $service
| stats count() by span(time, 1m)
```

```promql
sum by (instance) (rate(http_requests_total{service=~"$service"}[5m]))
```

Use `=~` (regex match) rather than `=` so the same query works whether `$service` is a single value or a multi-select list (which expands to a regex alternation like `(api|web)`).

When the viewer changes the dropdown, every panel that references the variable re-runs.

### Multi-select interpolation

![Multi-select variable dropdown applied to a panel](https://github.com/opensearch-project/observability-stack/releases/download/v3.6.0-alpha.1/dashboard-variables-multi.webp)

When **multi-select** is on and the viewer picks several values, the substitution is formatted for the target query language automatically:

| Language | Strings | Numbers / booleans |
|---|---|---|
| PPL | `('api', 'web')` | `(1, 2)` |
| PromQL | `(api\|web)` (regex alternation) | `(1\|2)` |

PromQL values are escaped for regex (e.g. `.`, `*`, `(` are backslash-escaped); PPL string values double single quotes and escape backslashes. This means the same `$service` reference works whether the viewer picks one service or ten — typically combined with the regex match operator (e.g. `service=~"$service"` in PromQL, `service IN $service` in PPL).

## Chained (dependent) variables

A query variable can reference another variable in its query. The order matters — a variable can only reference variables defined **above** it in the variables list. When the parent variable changes, the dependent variable's options refresh automatically. This is how you build a region → cluster → host chain, where each dropdown's options depend on the level above.

## Variable storage

Variables are stored as part of the dashboard saved object in OpenSearch. Each dashboard maintains its own variables independently.

The dashboard saved object stores variable definitions in `variablesJSON`, including metadata, query or custom options, multi-select settings, sort order, visibility, and current values. Current variable values are also synchronized to the dashboard URL so you can share or bookmark a dashboard with specific variable values preselected.

## Filters vs. variables

Filters and dashboard variables both narrow data across panels, but solve different problems:

- **[Filters](/docs/dashboards/#dashboard-filters)** are field-value predicates applied to all panels — quick to add ad-hoc, easy to remove. Best when you're investigating and don't yet know what you'll keep.
- **Variables** are designed-in dropdowns at the top of the dashboard. Each panel query references the variable by name, so the same dashboard can drive different views (per-service, per-environment, per-region) without editing a single panel. Best when the dashboard is shared and you want viewers to swap context without learning the underlying query.

Use both together — variables for the parameters you expect viewers to change often, filters for one-off slicing.

| | Filter | Variable |
|---|---|---|
| Defined by | Whoever is viewing the dashboard | Dashboard author, in edit mode |
| Persists across navigation | Only when pinned | Yes — saved with the dashboard |
| Where it's referenced | Implicit (every panel) | Explicit, by `$name` in queries |
| Multi-select | Via "is one of" operator | Built-in, with optional "All" |
| Best for | Ad-hoc investigation | Reusable, parameterized views |

## Related

- [Build a Dashboard](/docs/dashboards/build/) — adding panels and configuring chart-specific options
- [Visualization transformations](/docs/dashboards/visualize/transformations/) — reshape query results before they're charted
- [Managing Variables](/docs/dashboards/variables/managing-variables/) — edit, delete, reorder, hide, and troubleshoot variables
- [Using Variables](/docs/dashboards/variables/using-variables/) — reference variables in PPL and PromQL queries
- [Discover Logs](/docs/investigate/discover-logs/) — write the underlying PPL query
- [Discover Metrics](/docs/investigate/discover-metrics/) — write the underlying PromQL query
