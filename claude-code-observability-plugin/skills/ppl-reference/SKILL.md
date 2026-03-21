---
name: ppl-reference
description: Comprehensive PPL (Piped Processing Language) reference for OpenSearch with command syntax, functions, and examples for observability queries.
allowed-tools:
  - Bash
  - curl
---

# PPL Language Reference

## Overview

This is a comprehensive reference for the Piped Processing Language (PPL) used by OpenSearch. PPL queries follow a pipe-delimited syntax starting with `source=<index>` and chaining commands with `|`. This reference covers all commands, functions, API endpoints, and usage patterns needed to construct observability queries against trace and log indices.

Grammar sourced from the `opensearch-project/sql` repository's `docs/user/ppl/` directory:
https://github.com/opensearch-project/sql

## Field Name Escaping

Field names containing dots must be enclosed in backticks to avoid parsing errors:

```
`attributes.gen_ai.operation.name`
`attributes.gen_ai.usage.input_tokens`
`status.code`
`events.attributes.exception.type`
`@timestamp`
```

This is critical for OTel attribute fields which use dotted naming conventions.

## API Endpoints

### Query Endpoint

Execute a PPL query:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() by serviceName"}'
```

Request body: `{"query": "<ppl_query>"}`

### Explain Endpoint

Retrieve the query execution plan (useful for debugging and profiling):

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl/_explain \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `status.code` = 2 | stats count() by serviceName"}'
```

### Grammar Endpoint

Retrieve PPL grammar metadata:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X GET https://localhost:9200/_plugins/_ppl/_grammar
```

---

## Commands

### Core Query Commands

#### search / source

Start a query by specifying the data source index pattern.

**Syntax**: `search source=<index-pattern>` or `source=<index-pattern>`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | head 10"}'
```

#### where

Filter results based on a condition.

**Syntax**: `where <condition>`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `status.code` = 2 | head 10"}'
```

Supports: `=`, `!=`, `<`, `>`, `<=`, `>=`, `AND`, `OR`, `NOT`, `LIKE`, `IN`, `BETWEEN`, `IS NULL`, `IS NOT NULL`.

#### fields

Select specific fields to return.

**Syntax**: `fields [+|-] <field-list>`

Use `+` to include or `-` to exclude fields.

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | fields traceId, spanId, serviceName, durationInNanos | head 10"}'
```

#### stats

Aggregate data using statistical functions.

**Syntax**: `stats <aggregation>... [by <field-list>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as span_count, avg(durationInNanos) as avg_duration by serviceName"}'
```

Supports: `count()`, `sum()`, `avg()`, `max()`, `min()`, `var_samp()`, `var_pop()`, `stddev_samp()`, `stddev_pop()`, `distinct_count()`, `percentile()`, `earliest()`, `latest()`, `list()`, `values()`, `first()`, `last()`.

#### sort

Order results by one or more fields.

**Syntax**: `sort [+|-] <field> [, ...]`

Use `+` for ascending (default), `-` for descending.

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | sort - durationInNanos | head 10"}'
```

#### head

Limit the number of results returned.

**Syntax**: `head [N]` (default N=10)

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | head 5"}'
```

#### eval

Compute new fields from expressions.

**Syntax**: `eval <new-field> = <expression> [, ...]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eval duration_ms = durationInNanos / 1000000 | fields traceId, serviceName, duration_ms | sort - duration_ms | head 10"}'
```

#### dedup

Remove duplicate results based on field values.

**Syntax**: `dedup [N] <field-list> [keepempty=<bool>] [consecutive=<bool>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | dedup serviceName | fields serviceName"}'
```

#### rename

Rename one or more fields.

**Syntax**: `rename <old-field> AS <new-field> [, ...]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | rename serviceName as service, durationInNanos as duration | fields traceId, service, duration | head 10"}'
```

#### top

Find the most frequent values for a field.

**Syntax**: `top [N] <field> [by <group-field>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | top 5 serviceName"}'
```

#### rare

Find the least frequent values for a field.

**Syntax**: `rare <field> [by <group-field>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | rare `attributes.gen_ai.operation.name`"}'
```

#### table

Display results in tabular format (alias for fields in some contexts).

**Syntax**: `table <field-list>`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `status.code` = 2 | table traceId, spanId, serviceName, name | head 10"}'
```

### Time-Series Commands

#### timechart

Aggregate data into time buckets for time-series visualization.

**Syntax**: `timechart span(<time-field>, <interval>) <aggregation>... [by <field>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | timechart span(startTime, 5m) count() as span_count by serviceName"}'
```

Rate functions for timechart: `per_second()`, `per_minute()`, `per_hour()`, `per_day()` — compute rate of an aggregation per time unit.

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | timechart span(startTime, 1h) per_minute(count()) as spans_per_min by serviceName"}'
```

#### chart

General charting command for aggregation over arbitrary fields.

**Syntax**: `chart <aggregation>... by <field> [span(<field>, <interval>)]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | chart avg(durationInNanos) by serviceName"}'
```

#### bin

Bucket numeric or date values into intervals.

**Syntax**: `eval <new-field> = bin(<field>, <interval>)` or used within `stats ... by span(<field>, <interval>)`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() by span(durationInNanos, 1000000000)"}'
```

#### trendline

Calculate moving averages over sorted data.

**Syntax**: `trendline [sort <field>] sma(<period>, <field>) [as <alias>]`

SMA = Simple Moving Average.

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | trendline sort startTime sma(10, durationInNanos) as avg_duration | fields startTime, durationInNanos, avg_duration | head 50"}'
```

#### streamstats

Compute running (cumulative) statistics over ordered results.

**Syntax**: `streamstats <aggregation>... [by <field>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | sort startTime | streamstats count() as running_count, sum(`attributes.gen_ai.usage.input_tokens`) as cumulative_tokens | fields startTime, running_count, cumulative_tokens | head 50"}'
```

#### eventstats

Add aggregation results as new fields to each row without collapsing rows (unlike `stats`).

**Syntax**: `eventstats <aggregation>... [by <field>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eventstats avg(durationInNanos) as avg_svc_duration by serviceName | eval deviation = durationInNanos - avg_svc_duration | fields traceId, serviceName, durationInNanos, avg_svc_duration, deviation | sort - deviation | head 20"}'
```

### Parse/Extract Commands

#### parse

Extract fields from text using a regular expression with named groups.

**Syntax**: `parse <field> '<regex-with-named-groups>'`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | parse body '\''(?P<level>\\w+): (?P<msg>.+)'\'' | fields level, msg | head 10"}'
```

#### grok

Extract fields using Grok patterns (predefined regex patterns).

**Syntax**: `grok <field> '<grok-pattern>'`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | grok body '\''%{LOGLEVEL:level} %{GREEDYDATA:message}'\'' | fields level, message | head 10"}'
```

#### rex

Extract fields using named capture groups (similar to parse but with Splunk-compatible syntax).

**Syntax**: `rex field=<field> '<regex-with-named-groups>'`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | rex field=body '\''(?<status_code>\\d{3})'\'' | fields status_code, body | head 10"}'
```

#### regex

Filter results using a regular expression match on a field.

**Syntax**: `<field> = regex '<pattern>'` (used within `where`)

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where body like '\''%error%'\'' | fields traceId, body, severityText | head 10"}'
```

#### patterns

Auto-discover log patterns by clustering similar log messages.

**Syntax**: `patterns <field> [pattern='<regex>'] [new_field=<name>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | patterns body | fields body, patterns_field | head 20"}'
```

#### spath

Extract values from structured data (JSON, XML) using path expressions.

**Syntax**: `spath input=<field> [path=<path>] [output=<field>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.tool.call.arguments` != '\'''\'' | spath input=`attributes.gen_ai.tool.call.arguments` | head 10"}'
```

### Join/Lookup Commands

#### join

Join results from two indices.

**Syntax**: `join left=<alias> right=<alias> ON <condition> <right-source>` or `join <right-source> on <field>`

Types: `inner`, `left`, `right`, `cross`.

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | join left=s right=l ON s.traceId = l.traceId otel-v1-apm-log-* | fields s.spanId, s.name, l.severityText, l.body | head 10"}'
```

#### lookup

Enrich results by looking up values from another index.

**Syntax**: `lookup <lookup-index> <match-field> [AS <alias>] [OUTPUT <field-list>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | lookup otel-v2-apm-service-map serviceName | fields serviceName, `destination.domain`, durationInNanos | head 10"}'
```

#### graphlookup

Perform graph traversal lookups for hierarchical or connected data.

**Syntax**: `graphlookup <index> connectFromField=<field> connectToField=<field> [maxDepth=<N>] [as <alias>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v2-apm-service-map | graphlookup otel-v2-apm-service-map connectFromField=`destination.domain` connectToField=serviceName maxDepth=3 as dependencies | head 10"}'
```

#### subquery

Use a nested query as a data source or filter.

**Syntax**: `where <field> IN [ source=<index> | ... | fields <field> ]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId IN [ source=otel-v1-apm-span-* | where `status.code` = 2 | fields traceId ] | fields traceId, spanId, serviceName, name | head 20"}'
```

#### append

Append results from another query to the current result set.

**Syntax**: `append [ source=<index> | ... ]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as cnt by serviceName | append [ source=otel-v1-apm-log-* | stats count() as cnt by serviceName ] | head 20"}'
```

#### appendcol

Append columns from another query to the current result set.

**Syntax**: `appendcol [ source=<index> | ... ]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as span_count | appendcol [ source=otel-v1-apm-log-* | stats count() as log_count ]"}'
```

#### appendpipe

Append the results of a sub-pipeline to the current results.

**Syntax**: `appendpipe [ <commands> ]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as cnt by serviceName | appendpipe [ stats sum(cnt) as total ]"}'
```

### Transform Commands

#### fillnull

Replace null values with a specified value.

**Syntax**: `fillnull [with <value>] [<field-list>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | fillnull with 0 `attributes.gen_ai.usage.input_tokens`, `attributes.gen_ai.usage.output_tokens` | fields traceId, `attributes.gen_ai.usage.input_tokens`, `attributes.gen_ai.usage.output_tokens` | head 10"}'
```

#### flatten

Flatten nested fields into top-level fields.

**Syntax**: `flatten <field>`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | flatten events | head 10"}'
```

#### expand

Expand multi-value or array fields into separate rows.

**Syntax**: `expand <field>`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | expand events | fields traceId, spanId, events | head 20"}'
```

#### transpose

Pivot rows into columns.

**Syntax**: `transpose [<N>] [include_null=<bool>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as cnt by serviceName | transpose"}'
```

#### convert

Convert field types (e.g., string to number).

**Syntax**: `convert <function>(<field>) [as <alias>]`

Functions: `auto()`, `num()`, `ip()`, `ctime()`, `dur2sec()`, `mktime()`, `mstime()`, `rmcomma()`, `rmunit()`, `memk()`, `none()`.

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eval duration_str = CAST(durationInNanos AS STRING) | convert num(duration_str) as duration_num | fields traceId, duration_num | head 10"}'
```

#### replace

Replace values in a field using a regex or literal match.

**Syntax**: `replace <field> '<old>' WITH '<new>'`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | replace severityText '\''ERROR'\'' WITH '\''ERR'\'' | fields severityText, body | head 10"}'
```

#### reverse

Reverse the order of results.

**Syntax**: `reverse`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | sort startTime | head 20 | reverse"}'
```

### Multi-Value Commands

#### mvexpand

Expand a multi-value field into separate rows (one row per value).

**Syntax**: `mvexpand <field>`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | mvexpand events | fields traceId, spanId, events | head 20"}'
```

#### mvcombine

Combine multiple rows with the same key into a single row with a multi-value field.

**Syntax**: `mvcombine <field>`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | fields traceId, serviceName | mvcombine serviceName | head 10"}'
```

#### nomv

Convert a multi-value field to a single-value field (takes the first value or joins with a delimiter).

**Syntax**: `nomv <field>`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | nomv events | fields traceId, events | head 10"}'
```

### Aggregation/Totals Commands

#### addcoltotals

Add a summary row at the bottom with column totals.

**Syntax**: `addcoltotals [<field-list>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as cnt by serviceName | addcoltotals"}'
```

#### addtotals

Add a new field to each row containing the sum of specified numeric fields.

**Syntax**: `addtotals [row=<bool>] [col=<bool>] [<field-list>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats sum(`attributes.gen_ai.usage.input_tokens`) as input_tok, sum(`attributes.gen_ai.usage.output_tokens`) as output_tok by serviceName | addtotals"}'
```

### ML Commands

#### ad

Anomaly detection — identify anomalous values in a numeric field using built-in ML algorithms.

**Syntax**: `ad <field> [shingle_size=<N>] [time_decay=<float>] [time_field=<field>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where durationInNanos > 0 | ad durationInNanos time_field=startTime | head 50"}'
```

#### kmeans

Cluster data points using the k-means algorithm.

**Syntax**: `kmeans <field-list> [centroids=<N>] [iterations=<N>] [distance_type=<type>]`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where durationInNanos > 0 | kmeans durationInNanos centroids=3 | fields traceId, serviceName, durationInNanos, ClusterID | head 30"}'
```

#### ml

General ML command for running machine learning algorithms on query results.

**Syntax**: `ml action=<algorithm> [parameters...]`

Supported algorithms include: `kmeans`, `ad` (anomaly detection), `rcf` (Random Cut Forest).

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where durationInNanos > 0 | ml action=rcf durationInNanos time_field=startTime | head 50"}'
```

### System Commands

#### describe

Inspect the index mapping and field types for an index.

**Syntax**: `describe <index-pattern>`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "describe otel-v1-apm-span-*"}'
```

#### explain

Show the query execution plan (used via the `_explain` API endpoint rather than as an inline command).

**Syntax**: Use the `/_plugins/_ppl/_explain` endpoint with the query body.

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl/_explain \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `status.code` = 2 | stats count() by serviceName"}'
```

#### showdatasources

List all configured data sources available for PPL queries.

**Syntax**: `show datasources`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "show datasources"}'
```

#### multisearch

Execute multiple PPL queries in a single request. Each query is independent.

**Syntax**: Use the `/_plugins/_ppl` endpoint with multiple queries separated by newlines (NDJSON format), or execute sequentially.

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as total_spans"}'
```

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | stats count() as total_logs"}'
```

### Display Commands

#### fieldformat

Format the display of a field's values without changing the underlying data.

**Syntax**: `fieldformat <field> = <format-expression>`

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eval duration_ms = durationInNanos / 1000000 | fieldformat duration_ms = CONCAT(CAST(duration_ms AS STRING), '\'' ms'\'') | fields traceId, serviceName, duration_ms | head 10"}'
```

---

## Span Expression Syntax

The `span()` function buckets numeric or datetime values into intervals. Used with `stats`, `timechart`, and `chart`.

**Syntax**: `span(<field>, <interval>)`

### Supported Time Units

| Unit | Description | Example |
|------|-------------|---------|
| `ms` | Milliseconds | `span(startTime, 500ms)` |
| `s` | Seconds | `span(startTime, 30s)` |
| `m` | Minutes | `span(startTime, 5m)` |
| `h` | Hours | `span(startTime, 1h)` |
| `d` | Days | `span(startTime, 1d)` |
| `w` | Weeks | `span(startTime, 1w)` |
| `M` | Months | `span(startTime, 1M)` |
| `q` | Quarters | `span(startTime, 1q)` |
| `y` | Years | `span(startTime, 1y)` |

### Numeric Spans

For numeric fields, the interval is a plain number:

```
stats count() by span(durationInNanos, 1000000000)
```

### Example

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as span_count, avg(durationInNanos) as avg_duration by span(startTime, 1h)"}'
```

## Timechart Rate Functions

Rate functions normalize aggregation values to a per-time-unit rate within `timechart`:

| Function | Description |
|----------|-------------|
| `per_second(<agg>)` | Aggregation value per second |
| `per_minute(<agg>)` | Aggregation value per minute |
| `per_hour(<agg>)` | Aggregation value per hour |
| `per_day(<agg>)` | Aggregation value per day |

### Example

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | timechart span(startTime, 5m) per_second(count()) as requests_per_sec"}'
```

---

## Functions

### Aggregation Functions

Used with `stats`, `eventstats`, `streamstats`, `timechart`, and `chart` commands.

| Function | Syntax | Description |
|----------|--------|-------------|
| `COUNT` | `count()` | Count of events |
| `SUM` | `sum(field)` | Sum of numeric values |
| `AVG` | `avg(field)` | Arithmetic mean |
| `MAX` | `max(field)` | Maximum value |
| `MIN` | `min(field)` | Minimum value |
| `VAR_SAMP` | `var_samp(field)` | Sample variance |
| `VAR_POP` | `var_pop(field)` | Population variance |
| `STDDEV_SAMP` | `stddev_samp(field)` | Sample standard deviation |
| `STDDEV_POP` | `stddev_pop(field)` | Population standard deviation |
| `DISTINCT_COUNT` | `distinct_count(field)` | Count of distinct values |
| `PERCENTILE` | `percentile(field, pct)` | Value at the given percentile |
| `EARLIEST` | `earliest(field)` | Earliest (first chronological) value |
| `LATEST` | `latest(field)` | Latest (most recent) value |
| `LIST` | `list(field)` | All values as a list |
| `VALUES` | `values(field)` | Distinct values as a list |
| `FIRST` | `first(field)` | First value encountered |
| `LAST` | `last(field)` | Last value encountered |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() as total, avg(durationInNanos) as avg_ns, percentile(durationInNanos, 95) as p95_ns, distinct_count(serviceName) as services"}'
```

### Collection Functions

Functions for working with multi-value fields and arrays.

| Function | Syntax | Description |
|----------|--------|-------------|
| `ARRAY` | `array(val1, val2, ...)` | Create an array from values |
| `SPLIT` | `split(field, delimiter)` | Split a string into an array |
| `MVJOIN` | `mvjoin(field, delimiter)` | Join multi-value field into a string |
| `MVCOUNT` | `mvcount(field)` | Count of values in a multi-value field |
| `MVINDEX` | `mvindex(field, index)` | Get value at index from multi-value field |
| `MVFIRST` | `mvfirst(field)` | First value of a multi-value field |
| `MVLAST` | `mvlast(field)` | Last value of a multi-value field |
| `MVAPPEND` | `mvappend(field1, field2)` | Append two multi-value fields |
| `MVDEDUP` | `mvdedup(field)` | Remove duplicates from multi-value field |
| `MVSORT` | `mvsort(field)` | Sort values in a multi-value field |
| `MVZIP` | `mvzip(field1, field2, delim)` | Zip two multi-value fields together |
| `MVRANGE` | `mvrange(start, end, step)` | Generate a range of numeric values |
| `MVFILTER` | `mvfilter(expression)` | Filter values in a multi-value field |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eval tokens = array(`attributes.gen_ai.usage.input_tokens`, `attributes.gen_ai.usage.output_tokens`) | fields traceId, tokens | head 10"}'
```

### Condition Functions

Functions for conditional logic and null handling.

| Function | Syntax | Description |
|----------|--------|-------------|
| `ISNULL` | `isnull(field)` | Returns true if field is null |
| `ISNOTNULL` | `isnotnull(field)` | Returns true if field is not null |
| `IF` | `if(cond, true_val, false_val)` | Conditional expression |
| `IFNULL` | `ifnull(field, default)` | Return default if field is null |
| `NULLIF` | `nullif(val1, val2)` | Return null if val1 equals val2 |
| `CASE` | `case(cond1, val1, cond2, val2, ..., else_val)` | Multi-branch conditional |
| `COALESCE` | `coalesce(val1, val2, ...)` | First non-null value |
| `LIKE` | `field LIKE 'pattern'` | Wildcard pattern match (`%` and `_`) |
| `IN` | `field IN (val1, val2, ...)` | Check membership in a set |
| `BETWEEN` | `field BETWEEN val1 AND val2` | Range check (inclusive) |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eval status_label = case(`status.code` = 0, '\''UNSET'\'', `status.code` = 1, '\''OK'\'', `status.code` = 2, '\''ERROR'\'') | stats count() by status_label"}'
```

### Conversion Functions

Functions for type casting and conversion.

| Function | Syntax | Description |
|----------|--------|-------------|
| `CAST` | `cast(field AS type)` | Cast to a specified type (STRING, INT, LONG, FLOAT, DOUBLE, BOOLEAN, DATE, TIMESTAMP) |
| `TOSTRING` | `tostring(field)` | Convert to string |
| `TONUMBER` | `tonumber(field)` | Convert to number |
| `TOINT` | `toint(field)` | Convert to integer |
| `TOLONG` | `tolong(field)` | Convert to long |
| `TOFLOAT` | `tofloat(field)` | Convert to float |
| `TODOUBLE` | `todouble(field)` | Convert to double |
| `TOBOOLEAN` | `toboolean(field)` | Convert to boolean |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eval duration_ms = CAST(durationInNanos AS DOUBLE) / 1000000.0 | fields traceId, serviceName, duration_ms | sort - duration_ms | head 10"}'
```

### Cryptographic Functions

Functions for computing hash digests.

| Function | Syntax | Description |
|----------|--------|-------------|
| `MD5` | `md5(field)` | MD5 hash of the value |
| `SHA1` | `sha1(field)` | SHA-1 hash of the value |
| `SHA2` | `sha2(field, numBits)` | SHA-2 hash (numBits: 224, 256, 384, 512) |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eval trace_hash = md5(traceId) | fields traceId, trace_hash | head 5"}'
```

### Datetime Functions

Functions for date and time manipulation.

| Function | Syntax | Description |
|----------|--------|-------------|
| `NOW` | `now()` | Current timestamp |
| `CURDATE` | `curdate()` | Current date |
| `CURTIME` | `curtime()` | Current time |
| `DATE_FORMAT` | `date_format(date, fmt)` | Format a date (`%Y-%m-%d %H:%i:%s`) |
| `DATE_ADD` | `date_add(date, INTERVAL n unit)` | Add interval to date |
| `DATE_SUB` | `date_sub(date, INTERVAL n unit)` | Subtract interval from date |
| `DATEDIFF` | `datediff(date1, date2)` | Difference in days between two dates |
| `DAY` | `day(date)` | Day of month (1–31) |
| `MONTH` | `month(date)` | Month (1–12) |
| `YEAR` | `year(date)` | Year |
| `HOUR` | `hour(time)` | Hour (0–23) |
| `MINUTE` | `minute(time)` | Minute (0–59) |
| `SECOND` | `second(time)` | Second (0–59) |
| `DAYOFWEEK` | `dayofweek(date)` | Day of week (1=Sun, 7=Sat) |
| `DAYOFYEAR` | `dayofyear(date)` | Day of year (1–366) |
| `WEEK` | `week(date)` | Week number of the year |
| `UNIX_TIMESTAMP` | `unix_timestamp(date)` | Convert to Unix epoch seconds |
| `FROM_UNIXTIME` | `from_unixtime(epoch)` | Convert Unix epoch to timestamp |
| `TIMESTAMPADD` | `timestampadd(unit, n, ts)` | Add interval to timestamp |
| `TIMESTAMPDIFF` | `timestampdiff(unit, ts1, ts2)` | Difference between timestamps in given unit |
| `PERIOD_ADD` | `period_add(period, n)` | Add months to a period (YYMM/YYYYMM) |
| `PERIOD_DIFF` | `period_diff(p1, p2)` | Difference in months between periods |
| `MAKETIME` | `maketime(h, m, s)` | Create a time value |
| `MAKEDATE` | `makedate(year, dayofyear)` | Create a date from year and day-of-year |
| `ADDDATE` | `adddate(date, INTERVAL n unit)` | Alias for DATE_ADD |
| `SUBDATE` | `subdate(date, INTERVAL n unit)` | Alias for DATE_SUB |
| `SYSDATE` | `sysdate()` | Current date and time (evaluated at execution) |
| `UTC_DATE` | `utc_date()` | Current UTC date |
| `UTC_TIME` | `utc_time()` | Current UTC time |
| `UTC_TIMESTAMP` | `utc_timestamp()` | Current UTC timestamp |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where startTime > DATE_SUB(NOW(), INTERVAL 1 HOUR) | stats count() as recent_spans by serviceName"}'
```

### Expressions

Operators for arithmetic, comparison, and logical expressions used in `eval`, `where`, and other commands.

#### Arithmetic Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `+` | Addition | `eval total = input_tokens + output_tokens` |
| `-` | Subtraction | `eval gap = endTime - startTime` |
| `*` | Multiplication | `eval cost = tokens * price_per_token` |
| `/` | Division | `eval duration_ms = durationInNanos / 1000000` |

#### Comparison Operators

| Operator | Description |
|----------|-------------|
| `=` | Equal to |
| `!=` or `<>` | Not equal to |
| `<` | Less than |
| `>` | Greater than |
| `<=` | Less than or equal to |
| `>=` | Greater than or equal to |

#### Logical Operators

| Operator | Description |
|----------|-------------|
| `AND` | Logical AND |
| `OR` | Logical OR |
| `NOT` | Logical NOT |
| `XOR` | Logical exclusive OR |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eval duration_ms = durationInNanos / 1000000, total_tokens = `attributes.gen_ai.usage.input_tokens` + `attributes.gen_ai.usage.output_tokens` | where duration_ms > 1000 AND total_tokens > 0 | fields traceId, serviceName, duration_ms, total_tokens | head 10"}'
```

### IP Functions

Functions for IP address operations.

| Function | Syntax | Description |
|----------|--------|-------------|
| `CIDRMATCH` | `cidrmatch(ip_field, 'cidr')` | Check if IP is within a CIDR range |
| `GEOIP` | `geoip(ip_field)` | Geo-locate an IP address (returns country, region, city, lat/lon) |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where isnotnull(`attributes.net.peer.ip`) | where cidrmatch(`attributes.net.peer.ip`, '\''10.0.0.0/8'\'') | fields traceId, `attributes.net.peer.ip`, serviceName | head 10"}'
```

### JSON Functions

Functions for working with JSON data.

| Function | Syntax | Description |
|----------|--------|-------------|
| `JSON_EXTRACT` | `json_extract(field, path)` | Extract value at JSON path |
| `JSON_KEYS` | `json_keys(field)` | Get all keys from a JSON object |
| `JSON_VALID` | `json_valid(field)` | Check if value is valid JSON |
| `JSON_ARRAY` | `json_array(val1, val2, ...)` | Create a JSON array |
| `JSON_OBJECT` | `json_object(key1, val1, ...)` | Create a JSON object |
| `JSON_ARRAY_LENGTH` | `json_array_length(field)` | Length of a JSON array |
| `JSON_EXTRACT_PATH_TEXT` | `json_extract_path_text(field, path)` | Extract value as text from JSON path |
| `TO_JSON_STRING` | `to_json_string(field)` | Convert value to JSON string |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where json_valid(`attributes.gen_ai.tool.call.arguments`) | eval tool_args = json_extract(`attributes.gen_ai.tool.call.arguments`, '\''$'\'') | fields traceId, `attributes.gen_ai.tool.name`, tool_args | head 10"}'
```

### Math Functions

Functions for mathematical operations.

| Function | Syntax | Description |
|----------|--------|-------------|
| `ABS` | `abs(val)` | Absolute value |
| `CEIL` | `ceil(val)` | Round up to nearest integer |
| `FLOOR` | `floor(val)` | Round down to nearest integer |
| `ROUND` | `round(val [, decimals])` | Round to N decimal places |
| `SQRT` | `sqrt(val)` | Square root |
| `POW` | `pow(base, exp)` | Exponentiation |
| `MOD` | `mod(a, b)` | Modulo (remainder) |
| `LOG` | `log(val)` | Natural logarithm |
| `LOG2` | `log2(val)` | Base-2 logarithm |
| `LOG10` | `log10(val)` | Base-10 logarithm |
| `LN` | `ln(val)` | Natural logarithm (alias for LOG) |
| `EXP` | `exp(val)` | e raised to the power of val |
| `SIGN` | `sign(val)` | Sign of value (-1, 0, 1) |
| `TRUNCATE` | `truncate(val, decimals)` | Truncate to N decimal places |
| `PI` | `pi()` | Value of π |
| `E` | `e()` | Value of Euler's number |
| `RAND` | `rand([seed])` | Random float between 0 and 1 |
| `ACOS` | `acos(val)` | Arc cosine |
| `ASIN` | `asin(val)` | Arc sine |
| `ATAN` | `atan(val)` | Arc tangent |
| `ATAN2` | `atan2(y, x)` | Two-argument arc tangent |
| `COS` | `cos(val)` | Cosine |
| `SIN` | `sin(val)` | Sine |
| `TAN` | `tan(val)` | Tangent |
| `COT` | `cot(val)` | Cotangent |
| `DEGREES` | `degrees(radians)` | Convert radians to degrees |
| `RADIANS` | `radians(degrees)` | Convert degrees to radians |
| `CONV` | `conv(val, from_base, to_base)` | Convert between number bases |
| `CRC32` | `crc32(val)` | CRC-32 checksum |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eval duration_ms = round(durationInNanos / 1000000.0, 2) | where duration_ms > 0 | fields traceId, serviceName, duration_ms | sort - duration_ms | head 10"}'
```

### Relevance Functions

Full-text search functions for relevance-based querying.

| Function | Syntax | Description |
|----------|--------|-------------|
| `MATCH` | `match(field, query)` | Full-text match on a single field |
| `MATCH_PHRASE` | `match_phrase(field, phrase)` | Exact phrase match |
| `MATCH_BOOL_PREFIX` | `match_bool_prefix(field, query)` | Boolean prefix match |
| `MATCH_PHRASE_PREFIX` | `match_phrase_prefix(field, prefix)` | Phrase prefix match |
| `MULTI_MATCH` | `multi_match([field1, field2], query)` | Match across multiple fields |
| `QUERY_STRING` | `query_string([field1, field2], query)` | Lucene query string syntax |
| `SIMPLE_QUERY_STRING` | `simple_query_string([field1, field2], query)` | Simplified query string |
| `HIGHLIGHT` | `highlight(field)` | Return highlighted matching fragments |
| `SCORE` | `score(relevance_func)` | Return relevance score |
| `SCOREQUERY` | `scorequery(relevance_func)` | Filter by relevance score |
| `MATCH_QUERY` | `match_query(field, query)` | Alias for MATCH |
| `WILDCARD_QUERY` | `wildcard_query(field, pattern)` | Wildcard pattern match (`*` and `?`) |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where match(body, '\''timeout error'\'') | fields traceId, severityText, body | head 10"}'
```

### Statistical Functions

Functions for computing statistical correlations and covariances.

| Function | Syntax | Description |
|----------|--------|-------------|
| `CORR` | `corr(field1, field2)` | Pearson correlation coefficient between two fields |
| `COVAR_POP` | `covar_pop(field1, field2)` | Population covariance |
| `COVAR_SAMP` | `covar_samp(field1, field2)` | Sample covariance |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.usage.input_tokens` > 0 | stats corr(`attributes.gen_ai.usage.input_tokens`, durationInNanos) as token_duration_corr"}'
```

### String Functions

Functions for string manipulation.

| Function | Syntax | Description |
|----------|--------|-------------|
| `CONCAT` | `concat(str1, str2, ...)` | Concatenate strings |
| `LENGTH` | `length(str)` | String length in bytes |
| `LOWER` | `lower(str)` | Convert to lowercase |
| `UPPER` | `upper(str)` | Convert to uppercase |
| `TRIM` | `trim(str)` | Remove leading/trailing whitespace |
| `LTRIM` | `ltrim(str)` | Remove leading whitespace |
| `RTRIM` | `rtrim(str)` | Remove trailing whitespace |
| `SUBSTRING` | `substring(str, start [, len])` | Extract substring |
| `LEFT` | `left(str, len)` | Leftmost N characters |
| `RIGHT` | `right(str, len)` | Rightmost N characters |
| `REPLACE` | `replace(str, from, to)` | Replace occurrences |
| `REVERSE` | `reverse(str)` | Reverse a string |
| `LOCATE` | `locate(substr, str [, pos])` | Position of substring |
| `POSITION` | `position(substr IN str)` | Position of substring |
| `ASCII` | `ascii(str)` | ASCII code of first character |
| `CHAR_LENGTH` | `char_length(str)` | Character count |
| `CHARACTER_LENGTH` | `character_length(str)` | Alias for CHAR_LENGTH |
| `OCTET_LENGTH` | `octet_length(str)` | Byte count |
| `BIT_LENGTH` | `bit_length(str)` | Bit count |
| `LPAD` | `lpad(str, len, pad)` | Left-pad to length |
| `RPAD` | `rpad(str, len, pad)` | Right-pad to length |
| `SPACE` | `space(n)` | String of N spaces |
| `REPEAT` | `repeat(str, n)` | Repeat string N times |
| `STRCMP` | `strcmp(str1, str2)` | Compare strings (-1, 0, 1) |
| `SUBSTR` | `substr(str, start [, len])` | Alias for SUBSTRING |
| `MID` | `mid(str, start, len)` | Alias for SUBSTRING |
| `FIELD` | `field(str, val1, val2, ...)` | Index of str in value list |
| `FIND_IN_SET` | `find_in_set(str, strlist)` | Position in comma-separated list |
| `FORMAT` | `format(val, decimals)` | Format number with commas and decimals |
| `INSERT` | `insert(str, pos, len, newstr)` | Insert string at position |
| `INSTR` | `instr(str, substr)` | Position of first occurrence |
| `REGEXP` | `regexp(str, pattern)` | Regex match (returns 1 or 0) |
| `REGEXP_EXTRACT` | `regexp_extract(str, pattern [, group])` | Extract regex capture group |
| `REGEXP_REPLACE` | `regexp_replace(str, pattern, replacement)` | Replace regex matches |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | eval body_lower = lower(body) | where body_lower like '\''%exception%'\'' | eval short_body = left(body, 200) | fields traceId, severityText, short_body | head 10"}'
```

### System Functions

| Function | Syntax | Description |
|----------|--------|-------------|
| `TYPEOF` | `typeof(field)` | Returns the data type of a field value |

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | eval type_of_duration = typeof(durationInNanos) | fields traceId, durationInNanos, type_of_duration | head 5"}'
```

---

## Grammar Source

This PPL reference is sourced from the `opensearch-project/sql` repository's `docs/user/ppl/` directory.

Repository: https://github.com/opensearch-project/sql

The PPL grammar is maintained as part of the OpenSearch SQL plugin. For the latest syntax additions and changes, consult the repository documentation directly.
