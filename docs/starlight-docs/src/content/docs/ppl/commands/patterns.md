---
title: "patterns"
description: "Automatically discover log patterns - cluster similar log messages without writing regex."
---

import { Aside } from '@astrojs/starlight/components';

The `patterns` command is one of PPL's most powerful features for log analysis. It automatically extracts patterns from unstructured text by replacing variable parts (numbers, IPs, timestamps, identifiers) with `<*>` placeholders, grouping similar log lines together. This replaces hours of manual regex writing with a single command.

<Aside type="note">
**Stable** since OpenSearch 2.4.
</Aside>

Two pattern extraction methods are available:

- **`simple_pattern`** (default): Fast, regex-based extraction that replaces alphanumeric tokens with `<*>` placeholders.
- **`brain`**: A smarter ML-based clustering algorithm that preserves semantic meaning and produces more accurate groupings.

Two output modes control how results are returned:

- **`label`** (default): Adds a `patterns_field` column to each event showing its pattern.
- **`aggregation`**: Groups events by pattern and returns `pattern_count` and `sample_logs`.

## Syntax

```sql
patterns <field> [by <byClause>]
    [method=simple_pattern|brain]
    [mode=label|aggregation]
    [max_sample_count=<int>]
    [show_numbered_token=<bool>]
    [new_field=<name>]
    [pattern=<regex>]
    [buffer_limit=<int>]
    [variable_count_threshold=<int>]
    [frequency_threshold_percentage=<decimal>]
```

## Arguments

### Common arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `<field>` | Yes | -- | The text field to analyze for log patterns. |
| `by <byClause>` | No | -- | Fields or scalar functions to group logs before pattern extraction. |
| `method` | No | `simple_pattern` | Pattern extraction method: `simple_pattern` (fast, regex-based) or `brain` (ML-based clustering). |
| `mode` | No | `label` | Output mode: `label` adds a pattern column to each event; `aggregation` groups events by pattern. |
| `max_sample_count` | No | `10` | Maximum number of sample log entries returned per pattern in `aggregation` mode. |
| `show_numbered_token` | No | `false` | When `true`, variables use numbered placeholders (`<token1>`, `<token2>`) instead of `<*>`, and aggregation mode includes a `tokens` mapping. |
| `new_field` | No | `patterns_field` | Name for the output field that contains the extracted pattern. |

### simple_pattern arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `pattern` | No | Auto-detect | A custom Java regular expression that identifies characters to replace with `<*>` placeholders. For example, `[0-9]` replaces only digits. |

### brain arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `buffer_limit` | No | `100000` | Maximum internal buffer size (minimum `50000`). |
| `variable_count_threshold` | No | `5` | Controls sensitivity to detecting constant vs. variable words. Lower values produce more general patterns. |
| `frequency_threshold_percentage` | No | `0.3` | Minimum word frequency percentage. Words below this threshold are ignored. |

## Usage notes

- The `patterns` command runs on the coordinator node, not on data nodes. It groups patterns from log messages that have already been returned.
- In **label mode**, each event gets an additional `patterns_field` column showing its pattern. Use this to visually identify similar log lines.
- In **aggregation mode**, the output contains one row per unique pattern with `pattern_count` and `sample_logs` columns. This is ideal for understanding log composition at a glance.
- The **brain method** is better at identifying which parts of a log message are variable vs. static. It produces more meaningful groupings than `simple_pattern`, especially for complex log formats.
- The `by` clause lets you discover patterns per group (e.g., per service, per severity level).
- Default cluster settings for `patterns` can be overridden with cluster settings prefixed `plugins.ppl.pattern.*`.

### When to use patterns

| Use case | Why patterns helps |
|----------|-------------------|
| Incident investigation | Quickly answer: "What log patterns appeared during the outage?" |
| Log volume reduction | Identify the noisiest patterns consuming storage and bandwidth |
| Anomaly detection | Spot new or rare patterns that were not seen before |
| Log categorization | Group thousands of unique messages into a manageable set of templates |
| Regex bootstrapping | Use discovered patterns as a starting point for `parse` or `grok` rules |

## Basic examples

### Simple pattern discovery (label mode)

Add a pattern label to each log body:

```sql
source = logs-otel-v1*
| patterns body method=simple_pattern
| fields body, patterns_field
```

| body | patterns_field |
|------|----------------|
| 10.0.1.55 - GET /api/v1/agents 200 1234ms | \<*\>.\<*\>.\<*\>.\<*\> - \<*\> /\<*\>/\<*\>/\<*\> \<*\> \<*\>\<*\> |
| 192.168.1.10 - POST /api/v1/invoke 201 567ms | \<*\>.\<*\>.\<*\>.\<*\> - \<*\> /\<*\>/\<*\>/\<*\> \<*\> \<*\>\<*\> |
| 172.16.0.42 - GET /health 200 12ms | \<*\>.\<*\>.\<*\>.\<*\> - \<*\> /\<*\> \<*\> \<*\>\<*\> |

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1*%20%7C%20patterns%20body%20method%3Dsimple_pattern%20%7C%20fields%20body%2C%20patterns_field')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Aggregation mode -- group by pattern

Count how many log entries match each pattern:

```sql
source = logs-otel-v1*
| patterns body method=simple_pattern mode=aggregation
| fields patterns_field, pattern_count, sample_logs
```

This returns one row per unique pattern with the count and up to 10 sample log lines.

### Brain method -- smarter clustering

The brain method preserves more semantic meaning than simple_pattern:

```sql
source = logs-otel-v1*
| patterns body method=brain
| fields body, patterns_field
```

The brain algorithm identifies that HTTP methods (GET, POST, etc.), URL paths, and status codes are variable while structural elements (brackets, dashes, quotes) are constant, producing cleaner patterns like:

```
<*IP*> - <*> [<*>/<*>/<*>:<*>:<*>:<*> <*>] "<*> <*> HTTP/<*>" <*> <*>
```

### Custom regex pattern

Replace only digits, preserving all other characters:

```sql
source = logs-otel-v1*
| patterns body method=simple_pattern new_field='no_numbers' pattern='[0-9]'
| fields body, no_numbers
```

### Aggregation with numbered tokens

Enable numbered tokens to see exactly which parts of the pattern are variable:

```sql
source = logs-otel-v1*
| patterns body method=simple_pattern mode=aggregation show_numbered_token=true
| fields patterns_field, pattern_count, tokens
| head 1
```

The output includes a `tokens` map showing what each `<tokenN>` placeholder matched, e.g. `{'<token1>': ['200'], '<token2>': ['404'], ...}`.

## Extended examples

### Discover patterns in OTel log bodies

Find the dominant log patterns across all services in your OpenTelemetry data:

```sql
source = logs-otel-v1*
| patterns body method=brain mode=aggregation
| sort - pattern_count
| head 20
```

This reveals the most common log message shapes across your entire system. The `pattern_count` column shows which patterns dominate your log volume -- often a small number of patterns account for the vast majority of log entries.

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1*%20%7C%20patterns%20body%20method%3Dbrain%20mode%3Daggregation%20%7C%20sort%20-%20pattern_count%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Find dominant patterns per service

Use the `by` clause to discover patterns grouped by the originating service:

```sql
source = logs-otel-v1*
| patterns body method=brain mode=aggregation by `resource.attributes.service.name`
| sort - pattern_count
| head 30
```

This helps answer questions like: "Which service produces the most repetitive log patterns?" and "Are there services emitting unique patterns that might indicate errors?"

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1*%20%7C%20patterns%20body%20method%3Dbrain%20mode%3Daggregation%20by%20%60resource.attributes.service.name%60%20%7C%20sort%20-%20pattern_count%20%7C%20head%2030')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

<Aside type="tip">
**Incident investigation workflow**: During an outage, run `patterns` in aggregation mode on the error logs from the affected time window. New or rare patterns that were not present before the incident often point directly to the root cause.
</Aside>

## Configuring defaults

Override the default `patterns` settings at the cluster level:

```json
PUT _cluster/settings
{
  "persistent": {
    "plugins.ppl.pattern.method": "brain",
    "plugins.ppl.pattern.mode": "aggregation",
    "plugins.ppl.pattern.max.sample.count": 5,
    "plugins.ppl.pattern.buffer.limit": 50000,
    "plugins.ppl.pattern.show.numbered.token": true
  }
}
```

## See also

- [parse](/docs/ppl/commands/parse/) -- extract specific fields using Java regex when you know the pattern
- [grok](/docs/ppl/commands/grok/) -- extract fields using predefined grok patterns for known log formats
- [rex](/docs/ppl/commands/rex/) -- regex extraction with sed mode and multiple match support
