---
title: "top"
description: "Find the most common values of a field - quickly identify dominant patterns in your data."
---

import { Aside } from '@astrojs/starlight/components';

The `top` command finds the most common values (or combinations of values) for the specified fields. It automatically counts occurrences and returns results sorted from most to least frequent. An optional `by` clause groups the results so you can find the top values within each group.

`top` is a fast way to profile your data and answer questions like "which services produce the most logs?" or "what are the most common error messages?"

<Aside type="note">
The `top` command is not rewritten to query DSL. It is executed on the coordinating node. The command returns up to 10 results by default.
</Aside>

## Syntax

```sql
top [<N>] [top-options] <field-list> [by <group-field>]
```

## Arguments

| Argument | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `<N>` | No | Integer | `10` | The number of most-frequent values to return. |
| `<field-list>` | Yes | Comma-delimited field names | -- | The fields to find top values for. When multiple fields are specified, `top` finds the most common combinations. |
| `by <group-field>` | No | Field name(s) | -- | One or more fields to group the results by. Top values are computed separately within each group. |
| `showcount` | No | Boolean | `true` | When `true`, includes a count column showing the frequency of each value. Set to `false` for cleaner output when counts are not needed. |
| `countfield` | No | String | `count` | The name of the count column in the output. Only applies when `showcount=true`. |

## Usage notes

- **Fast data profiling.** `top` is the quickest way to understand the distribution of values in a field. Use it early in an investigation to orient yourself.
- **`showcount=false` for clean output.** When you only need the values and not the frequencies, use `showcount=false` to remove the count column.
- **Multiple fields find top combinations.** Specifying more than one field returns the most common value tuples. For example, `top service, severity` returns the most frequent (service, severity) pairs.
- **Use `by` clause for per-group analysis.** The `by` clause is powerful for comparative profiling, such as finding the top error message for each service.
- **`countfield` renames the count column.** Use `countfield='frequency'` or similar to give the count column a descriptive name for downstream processing.

## Examples

### Top services by log volume

Find the services producing the most logs:

```sql
| top `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20top%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Top 5 severity levels

Return only the 5 most common severity levels:

```sql
| top 5 severityText
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20top%205%20severityText')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Top severity by service

Find the most common severity level for each service:

```sql
| top 1 showcount=false severityText by `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20top%201%20showcount%3Dfalse%20severityText%20by%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Hide the count column

Return just the values without frequency counts:

```sql
| top showcount=false severityText
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20top%20showcount%3Dfalse%20severityText')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Rename the count column

Use a custom name for the count field:

```sql
| top countfield='frequency' `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20top%20countfield%3D!%27frequency!%27%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## Extended examples

### Top service-severity combinations in OTel logs

Find the most common combinations of service and severity. This reveals which services are noisiest and at what severity level:

```sql
| top 10 `resource.attributes.service.name`, severityText
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20top%2010%20%60resource.attributes.service.name%60%2C%20severityText')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Top span operations per OTel service

Find the most frequently executed operations in each service from trace data:

```sql
source = otel-v1-apm-span-*
| top 3 name by serviceName
```

This helps identify hot paths in your microservices architecture -- the operations that execute most frequently are often the best candidates for optimization.

## See also

- [rare](/docs/ppl/commands/rare/) - The inverse of `top`: find the least common values
- [stats](/docs/ppl/commands/stats/) - For more complex aggregations beyond simple frequency counts
- [dedup](/docs/ppl/commands/dedup/) - Deduplicate to get unique values with sample documents
- [head](/docs/ppl/commands/head/) - Limit the number of results returned
- [PPL Command Reference](/docs/ppl/commands/) - All PPL commands
