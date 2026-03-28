---
title: "fillnull"
description: "Replace null values with specified defaults - clean up missing data for analysis and visualization."
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution" title="Experimental - since 3.0">
This command is production-ready but its parameters may change based on community feedback.
</Aside>

The `fillnull` command replaces null values in one or more fields with a specified value. This is essential for cleaning up data before aggregation, visualization, or export -- null values can break charts and skew statistics.

<Aside type="note">
The `fillnull` command runs on the coordinating node, not pushed down to data nodes.
</Aside>

## Syntax

Three equivalent syntax forms are available:

```sql
fillnull with <value> [in <field-list>]
```

```sql
fillnull using <field> = <value> [, <field> = <value>]...
```

```sql
fillnull value=<value> [<field-list>]
```

## Arguments

### Required

| Argument | Description |
|----------|-------------|
| `<value>` | The replacement value for null fields. |

### Optional

| Argument | Description |
|----------|-------------|
| `<field-list>` | Fields in which to replace nulls. Comma-delimited with `with`/`using` syntax, space-delimited with `value=` syntax. When omitted, all fields are processed. |
| `<field> = <value>` | Per-field replacement values (only with `using` syntax). |

## Usage notes

- When applying the same value to all fields without specifying field names, **all fields must be of the same type**. For mixed types, use separate `fillnull` commands or specify fields explicitly.
- The replacement value type must match the field type. You cannot fill a string field with a numeric value or vice versa.
- The `using` syntax is the most flexible form because it lets you assign different default values to different fields in a single command.
- Use `fillnull` before `stats` or `timechart` to ensure null values do not create unwanted `NULL` categories in grouped results.

## Examples

### Fill missing service names with a default

Replace null service name values with `unknown`:

```sql
source = logs-otel-v1*
| fillnull with 'unknown' in `resource.attributes.service.name`
| stats count() as log_count by `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20fillnull%20with%20!%27unknown!%27%20in%20%60resource.attributes.service.name%60%20%7C%20stats%20count()%20as%20log_count%20by%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Fill multiple fields with the same value

Replace nulls in both `severityText` and `resource.attributes.service.name`:

```sql
source = logs-otel-v1*
| fillnull with 'N/A' in severityText, `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20fillnull%20with%20!%27N%2FA!%27%20in%20severityText%2C%20%60resource.attributes.service.name%60%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Per-field defaults with the using syntax

Assign different default values to different fields:

```sql
source = logs-otel-v1*
| fillnull using severityText = 'INFO', `resource.attributes.service.name` = 'unknown-service'
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20fillnull%20using%20severityText%20%3D%20!%27INFO!%27%2C%20%60resource.attributes.service.name%60%20%3D%20!%27unknown-service!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Fill all fields using the value= syntax

Replace nulls across all string fields with a placeholder:

```sql
source = logs-otel-v1*
| fillnull value='<empty>'
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20fillnull%20value%3D!%27%3Cempty%3E!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Clean data before visualization

Fill nulls before a timechart to prevent `NULL` categories from appearing in charts:

```sql
source = logs-otel-v1*
| fillnull with 'unknown' in `resource.attributes.service.name`
| timechart timefield=time span=5m count() by `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20fillnull%20with%20!%27unknown!%27%20in%20%60resource.attributes.service.name%60%20%7C%20timechart%20timefield%3Dtime%20span%3D5m%20count%28%29%20by%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## Extended examples

### Clean OTel log data for a service health dashboard

Fill multiple fields with appropriate defaults before aggregating for a dashboard panel:

```sql
source = logs-otel-v1*
| fillnull using severityText = 'UNSET', `resource.attributes.service.name` = 'unknown'
| stats count() as total,
    sum(case(severityText = 'ERROR' OR severityText = 'FATAL', 1 else 0)) as errors
  by `resource.attributes.service.name`
| eval error_rate = round(errors * 100.0 / total, 2)
| sort - error_rate
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20fillnull%20using%20severityText%20%3D%20!%27UNSET!%27%2C%20%60resource.attributes.service.name%60%20%3D%20!%27unknown!%27%20%7C%20stats%20count%28%29%20as%20total%2C%20sum%28case%28severityText%20%3D%20!%27ERROR!%27%20OR%20severityText%20%3D%20!%27FATAL!%27%2C%201%20else%200%29%29%20as%20errors%20by%20%60resource.attributes.service.name%60%20%7C%20eval%20error_rate%20%3D%20round%28errors%20%2A%20100.0%20%2F%20total%2C%202%29%20%7C%20sort%20-%20error_rate')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Fill missing trace context for log-trace correlation

When correlating logs with traces, fill missing trace IDs to identify uncorrelated logs:

```sql
source = logs-otel-v1*
| fillnull using traceId = 'no-trace', spanId = 'no-span'
| stats count() as log_count by traceId
| where traceId = 'no-trace'
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20fillnull%20using%20traceId%20%3D%20!%27no-trace!%27%2C%20spanId%20%3D%20!%27no-span!%27%20%7C%20stats%20count%28%29%20as%20log_count%20by%20traceId%20%7C%20where%20traceId%20%3D%20!%27no-trace!%27')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## See also

- [eval](/docs/ppl/commands/eval/) -- create computed fields or conditional replacements with `case()`
- [where](/docs/ppl/commands/where/) -- filter out null values with `IS NOT NULL`
- [stats](/docs/ppl/commands/stats/) -- aggregation (benefits from clean non-null data)
- [timechart](/docs/ppl/commands/timechart/) -- time-based charts (null `by` fields create `NULL` categories)
