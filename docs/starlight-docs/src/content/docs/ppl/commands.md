---
title: "PPL Command Reference"
description: "Complete reference for all PPL commands - syntax, parameters, and examples with live playground links for OpenTelemetry observability data."
---

import { Tabs, TabItem, Aside } from '@astrojs/starlight/components';

This reference covers every PPL command available in OpenSearch. Each command includes syntax, parameters, and examples you can run against live OpenTelemetry data in the [playground](https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)).

<Aside type="tip">
Commands marked **experimental** are ready for use but parameters may change based on feedback. Commands marked **stable** have a fixed API.
</Aside>

## Query structure

Every PPL query starts with a `search` command (or just `source=`), followed by a pipeline of commands separated by the pipe character (`|`):

```sql
source = <index-pattern>
| command1
| command2
| command3
```

In the Discover UI, the `source` is set automatically by the selected dataset, so queries typically begin with `|`:

```sql
| where severityText = 'ERROR'
| stats count() as errors by `resource.attributes.service.name`
```

---

## Search and filter

### search

Retrieve documents from an index. This is always the first command in a PPL query. The `search` keyword can be omitted.

**Syntax:**
```
search source=<index> [<boolean-expression>]
source=<index> [<boolean-expression>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<index>` | Yes | Index name or pattern to query |
| `<boolean-expression>` | No | Initial filter condition |

**Example - Get all logs:**
```sql
source = logs-otel-v1*
```

**Example - Search with inline filter:**
```sql
source = logs-otel-v1* severityText = 'ERROR'
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

### where

Filter results using boolean expressions. Only rows where the expression evaluates to `true` are returned.

**Syntax:**
```
where <boolean-expression>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<boolean-expression>` | Yes | Condition that evaluates to true/false |

Supports operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `AND`, `OR`, `NOT`, `LIKE`, `IN`, `BETWEEN`, `IS NULL`, `IS NOT NULL`.

**Example - Filter error logs:**
```sql
| where severityText = 'ERROR' or severityText = 'FATAL'
```

**Example - Compound conditions:**
```sql
| where severityNumber >= 17 AND `resource.attributes.service.name` = 'travel-planner'
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20or%20severityText%20%3D%20!%27FATAL!%27')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

### regex

*(experimental, since 3.3)*

Filter results by matching field values against a regular expression pattern.

**Syntax:**
```
regex <field> = <pattern>
regex <field> != <pattern>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<field>` | Yes | Field to match against |
| `<pattern>` | Yes | Java regex pattern |

**Example - Filter services matching a pattern:**
```sql
| regex `resource.attributes.service.name` = ".*agent.*"
```

---

### subquery

*(experimental, since 3.0)*

Embed one PPL query inside another for complex filtering.

**Syntax:**
```
where <field> [not] in [ source=<index> | ... ]
where [not] exists [ source=<index> | ... ]
```

**Example - Find logs from services that have errors in traces:**
```sql
source = logs-otel-v1*
| where `resource.attributes.service.name` in [
    source = otel-v1-apm-span-*
    | where status.code = 2
    | fields serviceName
  ]
```

---

## Field selection and transformation

### fields

Keep or remove fields from search results.

**Syntax:**
```
fields [+|-] <field-list>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<field-list>` | Yes | Comma-delimited list of fields |
| `+` or `-` | No | `+` includes (default), `-` excludes |

**Example - Select specific fields:**
```sql
| fields time, body, severityText, `resource.attributes.service.name`
```

**Example - Exclude fields:**
```sql
| fields - traceId, spanId
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20fields%20time%2C%20body%2C%20severityText%2C%20%60resource.attributes.service.name%60%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

### table

*(experimental, since 3.3)*

Alias for `fields` with enhanced syntax. Supports space-delimited field lists.

**Syntax:**
```
table [+|-] <field-list>
```

**Example:**
```sql
| table time body severityText
```

---

### rename

Rename one or more fields. Supports wildcard patterns.

**Syntax:**
```
rename <source-field> AS <target-field> [, <source-field> AS <target-field>]...
```

**Example:**
```sql
| rename `resource.attributes.service.name` as service
| fields time, body, service
```

---

### eval

Evaluate an expression and append (or overwrite) the result as a new field.

**Syntax:**
```
eval <field> = <expression> [, <field> = <expression>]...
```

**Example - Calculate duration in milliseconds:**
```sql
source = otel-v1-apm-span-*
| eval duration_ms = durationInNanos / 1000000
| fields serviceName, name, duration_ms
| sort - duration_ms
| head 10
```

**Example - Concatenate fields:**
```sql
| eval service_operation = concat(`resource.attributes.service.name`, '/', body)
```

---

### convert

*(experimental, since 3.5)*

Transform field values to numeric values using specialized conversion functions.

**Syntax:**
```
convert (auto | ctime | dur2sec | memk | mktime | mstime | num | rmcomma | rmunit) (<field>) [as <alias>] [, ...]
```

---

### replace

*(experimental, since 3.4)*

Replace text in one or more fields.

**Syntax:**
```
replace (<regex>, <replacement>) in <field> [, <field>]...
```

**Example:**
```sql
| replace ("error", "ERROR") in body
```

---

### fillnull

*(experimental, since 3.0)*

Fill null values with a specified value.

**Syntax:**
```
fillnull with <value> [in <field-list>]
fillnull using <field> = <value> [, <field> = <value>]
```

**Example:**
```sql
| fillnull with 'unknown' in `resource.attributes.service.name`
```

---

### expand

*(experimental, since 3.1)*

Expand a nested array field into multiple documents (one per array element).

**Syntax:**
```
expand <field> [as <alias>]
```

---

### flatten

*(experimental, since 3.1)*

Flatten a struct/object field into separate top-level fields.

**Syntax:**
```
flatten <field> [as (<alias-list>)]
```

---

## Aggregation and statistics

### stats

Calculate aggregations from search results. The workhorse of PPL analytics.

**Syntax:**
```
stats <aggregation>... [by <field-list>]
stats <aggregation>... [by span(<field>, <interval>) [as <alias>], <field-list>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<aggregation>` | Yes | Aggregation function (count, sum, avg, max, min, etc.) |
| `by <field-list>` | No | Group results by one or more fields |
| `span(<field>, <interval>)` | No | Create time or numeric buckets |

**Example - Count logs by service:**
```sql
| stats count() as log_count by `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count()%20as%20log_count%20by%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

**Example - Error rate by service:**
```sql
| stats count() as total,
        sum(case(severityText = 'ERROR', 1 else 0)) as errors
  by `resource.attributes.service.name`
| eval error_rate = errors * 100.0 / total
| sort - error_rate
```

**Example - Time-bucketed log volume:**
```sql
| stats count() as volume by span(time, 5m) as time_bucket
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20stats%20count()%20as%20volume%20by%20span(time%2C%205m)%20as%20time_bucket')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

### eventstats

*(experimental, since 3.1)*

Like `stats`, but appends the aggregation result as a new field to **every event** instead of collapsing rows.

**Syntax:**
```
eventstats <function>... [by <field-list>]
```

**Example - Add service-level average alongside each log:**
```sql
source = otel-v1-apm-span-*
| eventstats avg(durationInNanos) as avg_duration by serviceName
| eval deviation = durationInNanos - avg_duration
| where deviation > avg_duration * 2
| fields serviceName, name, durationInNanos, avg_duration, deviation
```

---

### streamstats

*(experimental, since 3.4)*

Calculate cumulative or rolling statistics as events are processed in order.

**Syntax:**
```
streamstats [current=<bool>] [window=<int>] <function>... [by <field-list>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `current` | No | Include current event in calculation (default: true) |
| `window` | No | Number of events for rolling window (default: 0 = all) |

**Example - Rolling average latency over last 10 spans:**
```sql
source = otel-v1-apm-span-*
| sort startTime
| streamstats window=10 avg(durationInNanos) as rolling_avg by serviceName
```

---

### bin

*(experimental, since 3.3)*

Group numeric or time values into buckets of equal intervals.

**Syntax:**
```
bin <field> [span=<interval>] [bins=<count>]
```

**Example:**
```sql
source = otel-v1-apm-span-*
| eval duration_ms = durationInNanos / 1000000
| bin duration_ms span=100
| stats count() as spans by duration_ms
```

---

### timechart

*(experimental, since 3.3)*

Create time-based aggregations - perfect for dashboards and trend analysis.

**Syntax:**
```
timechart [timefield=<field>] [span=<interval>] <aggregation> [by <field>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `timefield` | No | Time field (default: `@timestamp`) |
| `span` | No | Time interval (default: `1m`) |
| `limit` | No | Max distinct values for `by` field (default: 10) |

**Example - Log volume over time by service:**
```sql
| timechart timefield=time span=5m count() by `resource.attributes.service.name`
```

---

### chart

*(experimental, since 3.4)*

Apply statistical aggregations with row and column splits for visualization.

**Syntax:**
```
chart <aggregation> [by <row-split> <column-split>]
chart <aggregation> [over <row-split>] [by <column-split>]
```

**Example:**
```sql
| chart count() by `resource.attributes.service.name`, severityText
```

---

### trendline

*(experimental, since 3.0)*

Calculate moving averages of fields - simple moving average (SMA) or weighted moving average (WMA).

**Syntax:**
```
trendline [sort <field>] (sma|wma)(<window>, <field>) [as <alias>]
```

**Example:**
```sql
source = otel-v1-apm-span-*
| sort startTime
| trendline sma(5, durationInNanos) as latency_trend
| fields startTime, durationInNanos, latency_trend
```

---

### addtotals

*(stable, since 3.5)*

Add row and column totals to aggregation results.

**Syntax:**
```
addtotals [col=<bool>] [row=<bool>] [fieldname=<name>] [labelfield=<field>] [label=<string>] [<field-list>]
```

---

### addcoltotals

*(stable, since 3.5)*

Add a totals row at the bottom of results.

**Syntax:**
```
addcoltotals [labelfield=<field>] [label=<string>] [<field-list>]
```

---

### transpose

*(stable, since 3.5)*

Transpose rows to columns - useful for pivoting aggregation results.

**Syntax:**
```
transpose [<int>] [header_field=<field>] [include_empty=<bool>] [column_name=<string>]
```

---

## Sorting and limiting

### sort

Sort results by one or more fields.

**Syntax:**
```
sort [<count>] [+|-] <field> [, [+|-] <field>]...
sort [<count>] <field> [asc|desc] [, <field> [asc|desc]]...
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<field>` | Yes | Field to sort by |
| `+` or `asc` | No | Ascending (default) |
| `-` or `desc` | No | Descending |
| `<count>` | No | Number of results to return |

**Example - Most recent logs first:**
```sql
| sort - time
| head 20
```

**Example - Slowest traces:**
```sql
source = otel-v1-apm-span-*
| sort - durationInNanos
| fields traceId, serviceName, name, durationInNanos
| head 10
```

---

### head

Return the first N results. Default is 10.

**Syntax:**
```
head [<size>] [from <offset>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<size>` | No | Number of results (default: 10) |
| `<offset>` | No | Number of results to skip |

**Example:**
```sql
| sort - time
| head 50
```

---

### reverse

*(experimental, since 3.2)*

Reverse the display order of results.

**Syntax:**
```
reverse
```

---

## Deduplication and ranking

### dedup

Remove duplicate documents based on field values.

**Syntax:**
```
dedup [<count>] <field-list> [keepempty=<bool>] [consecutive=<bool>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<field-list>` | Yes | Fields that define uniqueness |
| `<count>` | No | Number of duplicates to keep per group (default: 1) |
| `keepempty` | No | Keep documents with null values (default: false) |
| `consecutive` | No | Only remove consecutive duplicates (default: false) |

**Example - One log per unique service:**
```sql
| dedup `resource.attributes.service.name`
| fields `resource.attributes.service.name`, body
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20dedup%20%60resource.attributes.service.name%60%20%7C%20fields%20%60resource.attributes.service.name%60%2C%20body')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

### top

Find the most common values of a field.

**Syntax:**
```
top [<N>] <field-list> [by <group-field>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<N>` | No | Number of top values (default: 10) |
| `<field-list>` | Yes | Fields to find top values for |

**Example - Top services by log volume:**
```sql
| top 5 `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20top%205%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

### rare

Find the least common values of a field - useful for spotting anomalies.

**Syntax:**
```
rare <field-list> [by <group-field>]
```

**Example - Rarest severity levels:**
```sql
| rare severityText
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20rare%20severityText')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

## Text extraction and pattern matching

### parse

Extract fields from text using regular expressions with named capture groups.

**Syntax:**
```
parse <field> <regex-pattern>
```

**Example - Extract HTTP status codes from log bodies:**
```sql
| parse body 'HTTP/\d\.\d"\s+(?<statusCode>\d{3})'
| stats count() as requests by statusCode
```

---

### grok

*(stable, since 2.4)*

Extract fields using grok patterns - a higher-level abstraction over regex using predefined patterns like `%{IP}`, `%{NUMBER}`, `%{GREEDYDATA}`.

**Syntax:**
```
grok <field> <grok-pattern>
```

**Example - Parse structured log lines:**
```sql
| grok body '%{IP:client_ip} - %{DATA:user} \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{DATA:url}"'
| fields client_ip, method, url
```

---

### rex

*(experimental, since 3.3)*

Extract fields from text using regex named capture groups, with additional options for sed-mode text substitution.

**Syntax:**
```
rex [mode=<extract|sed>] field=<field> <pattern> [max_match=<int>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `field` | Yes | Source field |
| `<pattern>` | Yes | Regex with named groups `(?<name>...)` |
| `mode` | No | `extract` (default) or `sed` for substitution |
| `max_match` | No | Max matches to extract (default: 1) |

**Example - Extract key-value pairs from logs:**
```sql
| rex field=body "status=(?<status>\w+)\s+latency=(?<latency>\d+)"
| fields status, latency
```

---

### spath

*(experimental, since 3.3)*

Extract fields from structured JSON data within a text field.

**Syntax:**
```
spath input=<field> [output=<field>] [path=<json-path>]
```

**Example:**
```sql
| spath input=body path=error.message output=error_msg
| where isnotnull(error_msg)
```

---

### patterns

*(stable, since 2.4)*

Automatically discover log patterns by extracting and clustering similar log lines. This is one of PPL's most powerful observability features - it replaces hours of manual regex work with a single command.

**Syntax:**
```
patterns <field> [method=simple_pattern|brain] [mode=label|aggregation] [max_sample_count=<int>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<field>` | Yes | Text field to analyze |
| `method` | No | `simple_pattern` (default) or `brain` for smarter clustering |
| `mode` | No | `label` adds pattern field, `aggregation` groups by pattern |
| `max_sample_count` | No | Sample logs per pattern (default: 10) |

**Example - Discover log patterns:**
```sql
| patterns body method=simple_pattern mode=aggregation
| fields patterns_field, pattern_count, sample_logs
```

---

## Data combination and enrichment

### join

*(stable, since 3.0)*

Combine two datasets together. Supports inner, left, right, full, semi, anti, and cross joins.

**Syntax:**
```
[joinType] join [left=<alias>] [right=<alias>] on <condition> <right-dataset>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `joinType` | No | `inner` (default), `left`, `right`, `full`, `semi`, `anti`, `cross` |
| `on <condition>` | Yes | Join condition |
| `<right-dataset>` | Yes | Index name or subsearch |

**Example - Correlate logs with trace data:**
```sql
source = logs-otel-v1*
| left join on traceId = traceId [
    source = otel-v1-apm-span-*
    | fields traceId, serviceName, durationInNanos
  ]
| fields time, body, serviceName, durationInNanos
```

---

### lookup

*(experimental, since 3.0)*

Enrich data by looking up values from a reference index.

**Syntax:**
```
lookup <lookupIndex> <lookupKey> [as <sourceKey>] [replace|append <field-list>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<lookupIndex>` | Yes | Reference index to look up from |
| `<lookupKey>` | Yes | Key field in the lookup index |
| `replace` or `append` | No | `replace` overwrites, `append` fills nulls only |

---

### append

*(experimental, since 3.3)*

Append results of a subsearch to the bottom of the main search results.

**Syntax:**
```
append [<subsearch>]
```

**Example - Combine log stats with trace stats:**
```sql
source = logs-otel-v1*
| stats count() as log_count by `resource.attributes.service.name`
| append [
    source = otel-v1-apm-span-*
    | stats count() as log_count by serviceName as `resource.attributes.service.name`
  ]
```

---

### appendcol

*(experimental, since 3.1)*

Append subsearch results as additional columns alongside the main results.

**Syntax:**
```
appendcol [override=<bool>] [<subsearch>]
```

---

### multisearch

*(experimental, since 3.4)*

Execute multiple search queries and combine results.

**Syntax:**
```
multisearch [<subsearch>] [, <subsearch>]...
```

---

## Multivalue fields

### mvcombine

*(stable, since 3.4)*

Combine values of a field across rows into a multivalue array.

**Syntax:**
```
mvcombine <field>
```

---

### nomv

*(stable, since 3.6)*

Convert a multivalue field to a single string by joining elements with newlines.

**Syntax:**
```
nomv <field>
```

---

### mvexpand

*(stable, since 3.6)*

Expand a multi-valued field into separate documents (one per value).

**Syntax:**
```
mvexpand <field> [limit=<int>]
```

---

## Machine learning

### ml

*(stable, since 2.5)*

Apply machine learning algorithms directly in your query pipeline.

**Syntax (Anomaly Detection - RCF):**
```
ml action='train' algorithm='rcf' [time_field=<field>] [anomaly_rate=<float>]
```

**Syntax (Clustering - K-Means):**
```
ml action='train' algorithm='kmeans' [centroids=<int>] [iterations=<int>] [distance_type=<type>]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `algorithm` | Yes | `rcf` (Random Cut Forest) or `kmeans` |
| `time_field` | Yes (RCF time-series) | Timestamp field for time-series anomaly detection |
| `centroids` | No | Number of clusters for kmeans (default: 2) |
| `anomaly_rate` | No | Expected anomaly rate for RCF (default: 0.005) |

**Example - Anomaly detection on time-series data:**
```sql
source = otel-v1-apm-span-*
| stats avg(durationInNanos) as avg_latency by span(startTime, 1m) as minute
| ml action='train' algorithm='rcf' time_field='minute'
| where is_anomaly = 1
```

---

### kmeans

*(stable, since 1.3)*

Apply k-means clustering directly on query results.

**Syntax:**
```
kmeans [centroids=<int>] [iterations=<int>] [distance_type=COSINE|L1|EUCLIDEAN]
```

---

## Metadata and debugging

### describe

*(stable, since 2.1)*

Query the metadata (field names, types) of an index.

**Syntax:**
```
describe <table-name>
```

**Example:**
```sql
describe logs-otel-v1*
```

---

### explain

*(stable, since 3.1)*

Show the execution plan of a query - useful for debugging and optimization.

**Syntax:**
```
explain [simple|standard|cost|extended] <query>
```

---

### showdatasources

*(stable, since 2.4)*

List all configured data sources in the PPL engine.

**Syntax:**
```
show datasources
```

---

## Graph traversal

### graphlookup

*(experimental, since 3.6)*

Perform recursive graph traversal on a collection using BFS - useful for tracing service dependency chains.

**Syntax:**
```
graphlookup source=<index> connectFromField=<field> connectToField=<field> as <alias> [maxDepth=<int>] [depthField=<field>]
```

---

## All commands at a glance

| Command | Since | Status | Description |
|---------|-------|--------|-------------|
| [search](#search) | 1.0 | stable | Retrieve documents from an index |
| [where](#where) | 1.0 | stable | Filter with boolean expressions |
| [fields](#fields) | 1.0 | stable | Keep or remove fields |
| [table](#table) | 3.3 | experimental | Alias for fields with enhanced syntax |
| [rename](#rename) | 1.0 | stable | Rename fields |
| [eval](#eval) | 1.0 | stable | Evaluate expressions, create fields |
| [convert](#convert) | 3.5 | experimental | Convert field values to numeric |
| [replace](#replace) | 3.4 | experimental | Replace text in fields |
| [fillnull](#fillnull) | 3.0 | experimental | Fill null values |
| [expand](#expand) | 3.1 | experimental | Expand nested arrays |
| [flatten](#flatten) | 3.1 | experimental | Flatten struct fields |
| [stats](#stats) | 1.0 | stable | Aggregation and grouping |
| [eventstats](#eventstats) | 3.1 | experimental | Aggregation appended to each event |
| [streamstats](#streamstats) | 3.4 | experimental | Cumulative/rolling statistics |
| [bin](#bin) | 3.3 | experimental | Group into numeric/time buckets |
| [timechart](#timechart) | 3.3 | experimental | Time-based charts |
| [chart](#chart) | 3.4 | experimental | Aggregation with row/column splits |
| [trendline](#trendline) | 3.0 | experimental | Moving averages |
| [addtotals](#addtotals) | 3.5 | stable | Row and column totals |
| [addcoltotals](#addcoltotals) | 3.5 | stable | Column totals |
| [transpose](#transpose) | 3.5 | stable | Transpose rows to columns |
| [sort](#sort) | 1.0 | stable | Sort results |
| [reverse](#reverse) | 3.2 | experimental | Reverse result order |
| [head](#head) | 1.0 | stable | Return first N results |
| [dedup](#dedup) | 1.0 | stable | Remove duplicates |
| [top](#top) | 1.0 | stable | Most common values |
| [rare](#rare) | 1.0 | stable | Least common values |
| [parse](#parse) | 1.3 | stable | Regex field extraction |
| [grok](#grok) | 2.4 | stable | Grok pattern extraction |
| [rex](#rex) | 3.3 | experimental | Regex extraction with options |
| [regex](#regex) | 3.3 | experimental | Regex-based filtering |
| [spath](#spath) | 3.3 | experimental | JSON field extraction |
| [patterns](#patterns) | 2.4 | stable | Log pattern discovery |
| [join](#join) | 3.0 | stable | Combine datasets |
| [append](#append) | 3.3 | experimental | Append subsearch results |
| [appendcol](#appendcol) | 3.1 | experimental | Append as columns |
| [lookup](#lookup) | 3.0 | experimental | Enrich from lookup index |
| [multisearch](#multisearch) | 3.4 | experimental | Multi-query combination |
| [subquery](#subquery) | 3.0 | experimental | Nested query filtering |
| [ml](#ml) | 2.5 | stable | Machine learning algorithms |
| [kmeans](#kmeans) | 1.3 | stable | K-means clustering |
| [mvcombine](#mvcombine) | 3.4 | stable | Combine multivalue fields |
| [nomv](#nomv) | 3.6 | stable | Multivalue to string |
| [mvexpand](#mvexpand) | 3.6 | stable | Expand multivalue fields |
| [graphlookup](#graphlookup) | 3.6 | experimental | Recursive graph traversal |
| [describe](#describe) | 2.1 | stable | Index metadata |
| [explain](#explain) | 3.1 | stable | Query execution plan |
| [showdatasources](#showdatasources) | 2.4 | stable | List data sources |

## Syntax conventions

| Notation | Meaning |
|----------|---------|
| `<placeholder>` | Replace with actual value |
| `[optional]` | Can be omitted |
| `(a \| b)` | Required choice between options |
| `[a \| b]` | Optional choice between options |
| `...` | Preceding element can repeat |

## Further reading

- **[Function Reference](/docs/ppl/functions/)** - 200+ built-in functions
- **[Observability Examples](/docs/ppl/examples/)** - Real-world OTel queries
- **[PPL source documentation](https://github.com/opensearch-project/sql/tree/main/docs/user/ppl)** - Upstream PPL docs in the OpenSearch SQL plugin
