---
title: "dedup"
description: "Remove duplicate documents based on field values - deduplicate results for unique combinations."
---

import { Aside } from '@astrojs/starlight/components';

The `dedup` command removes duplicate documents from search results based on the values of one or more specified fields. By default, it keeps the first occurrence of each unique combination of field values and discards subsequent duplicates.

You can retain more than one duplicate per combination by specifying a count, preserve rows that have null values with `keepempty=true`, and limit deduplication to consecutive rows only with `consecutive=true`.

## Syntax

```sql
dedup [<count>] <field-list> [keepempty=<bool>] [consecutive=<bool>]
```

## Arguments

| Argument | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `<field-list>` | Yes | Comma-delimited field names | -- | The fields used to determine uniqueness. At least one field is required. When multiple fields are specified, uniqueness is based on the combination of all field values. |
| `<count>` | No | Integer (> 0) | `1` | The number of duplicate documents to retain for each unique combination of field values. |
| `keepempty` | No | Boolean | `false` | When `true`, keeps documents where any field in the field list has a `NULL` value or is missing. When `false`, those documents are discarded. |
| `consecutive` | No | Boolean | `false` | When `true`, removes only consecutive duplicate documents rather than all duplicates. |

<Aside type="caution">
The `consecutive=true` option requires the legacy SQL engine (`plugins.calcite.enabled=false`).
</Aside>

## Usage notes

- **Operates on field combinations.** When you specify multiple fields, `dedup` considers the combination of values across all those fields. For example, `dedup service, severity` keeps one row for each unique (service, severity) pair.
- **`keepempty=true` preserves rows with null values.** By default, rows where any of the specified fields is null are removed. Set `keepempty=true` to retain them.
- **`consecutive=true` only removes adjacent duplicates.** This is useful when your data is sorted and you want to collapse runs of identical values while preserving non-adjacent duplicates.
- **Common pattern: one representative per group.** Use `dedup` to get one sample document per unique value of a field. This is faster than `stats` when you need the actual document, not just a count.

## Examples

### Deduplicate on a single field

Keep one log entry per unique severity level:

```sql
| dedup severityText
| fields severityText, body
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20dedup%20severityText%20%7C%20fields%20severityText%2C%20body')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Keep multiple duplicates per group

Keep up to 2 log entries per severity level:

```sql
| dedup 2 severityText
| fields severityText, body, `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20dedup%202%20severityText%20%7C%20fields%20severityText%2C%20body%2C%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Deduplicate on multiple fields

Keep one log entry per unique combination of service and severity:

```sql
| dedup `resource.attributes.service.name`, severityText
| fields `resource.attributes.service.name`, severityText, body
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20dedup%20%60resource.attributes.service.name%60%2C%20severityText%20%7C%20fields%20%60resource.attributes.service.name%60%2C%20severityText%2C%20body')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Preserve rows with null values

Keep one log per unique traceId, including logs that have no traceId:

```sql
| dedup traceId keepempty=true
| fields traceId, body, severityText
```

### One representative error log per OTel service

Get one sample error log from each service to quickly see what kinds of errors each service produces:

```sql
| where severityText = 'ERROR'
| dedup `resource.attributes.service.name`
| fields `resource.attributes.service.name`, body, time
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20dedup%20%60resource.attributes.service.name%60%20%7C%20fields%20%60resource.attributes.service.name%60%2C%20body%2C%20time')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## Extended examples

### Unique service-severity combinations with OTel context

Find every distinct combination of service and severity level, showing one sample log body for each. This is useful for building a quick inventory of what each service is logging:

```sql
| dedup `resource.attributes.service.name`, severityText
| fields `resource.attributes.service.name`, severityText, body
| sort `resource.attributes.service.name`, severityText
```

### Deduplicate traces to find one slow span per service

Get one representative slow span (over 1 second) from each service in your OTel trace data:

```sql
source = otel-v1-apm-span-*
| where durationInNanos > 1000000000
| dedup serviceName
| fields serviceName, name, durationInNanos, traceId
| sort - durationInNanos
```

## See also

- [top](/docs/ppl/commands/top/) - Find the most common values of a field
- [rare](/docs/ppl/commands/rare/) - Find the least common values of a field
- [stats](/docs/ppl/commands/) - Aggregate results when you need counts rather than sample documents
- [head](/docs/ppl/commands/head/) - Limit the number of results returned
- [PPL Command Reference](/docs/ppl/commands/) - All PPL commands
