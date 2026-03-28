---
title: "head"
description: "Return the first N results from the search - limit output for exploration and top-N queries."
---

import { Aside } from '@astrojs/starlight/components';

The `head` command returns the first N results from a search result. The default number of results is 10. An optional offset skips a specified number of results before returning, enabling simple pagination.

`head` is commonly placed at the end of a pipeline after `sort` to implement top-N queries (for example, "show the 10 slowest traces"). During exploration, always use `head` to limit the volume of data scanned and returned.

<Aside type="note">
The `head` command is not rewritten to query DSL. It is executed on the coordinating node.
</Aside>

## Syntax

```sql
head [<size>] [from <offset>]
```

## Arguments

| Argument | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `<size>` | No | Integer | `10` | The number of results to return. Must be a positive integer. |
| `<offset>` | No | Integer | `0` | The number of results to skip before returning. Used with the `from` keyword. Must be a non-negative integer. |

## Usage notes

- **Always use during exploration.** Adding `head` at the end of a query prevents scanning the entire result set when you only need a sample.
- **Combine with `sort` for top-N patterns.** The idiomatic way to get "top N by some metric" in PPL is `sort - <field> | head N`.
- **Offset enables simple pagination.** Use `head <size> from <offset>` to page through results. For example, `head 10 from 20` returns results 21 through 30.
- **Order matters.** `head` operates on whatever the pipeline has produced up to that point. Placing it before `sort` limits the rows that get sorted; placing it after `sort` limits the sorted output.

## Examples

### Return the default number of results

Return the first 10 log entries (the default):

```sql
| head
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20head')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Return a specific number of results

Return the first 50 results:

```sql
| head 50
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20head%2050')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Skip results with an offset

Return 10 results starting from the 21st result (skip the first 20):

```sql
| head 10 from 20
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20head%2010%20from%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Top-N pattern: slowest traces

Combine `sort` and `head` to find the 10 slowest spans:

```sql
source = otel-v1-apm-span-*
| sort - durationInNanos
| head 10
```

[Try in Playground](https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20otel-v1-apm-span-%2A%0A%7C%20sort%20-%20durationInNanos%0A%7C%20head%2010')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### Top-N pattern: services with the most errors (OTel logs)

Count error logs per service, sort descending, and return the top 5:

```sql
| where severityText = 'ERROR'
| stats count() as error_count by `resource.attributes.service.name`
| sort - error_count
| head 5
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20stats%20count()%20as%20error_count%20by%20%60resource.attributes.service.name%60%20%7C%20sort%20-%20error_count%20%7C%20head%205')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## Extended examples

### Paginate through recent error logs

Page through error logs 20 at a time. This query returns the second page (results 21-40):

```sql
| where severityText = 'ERROR'
| sort - time
| head 20 from 20
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20sort%20-%20time%20%7C%20head%2020%20from%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Sample logs from each OTel service

Get a quick sample of 5 logs per service by combining `dedup` and `head`:

```sql
source = logs-otel-v1*
| dedup 5 `resource.attributes.service.name`
| sort - time
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20sort%20-%20time%20%7C%20head%20100')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

This is useful for initial exploration of what data each service is producing, without scanning the entire index.

## See also

- [sort](/docs/ppl/commands/sort/) - Sort results before applying `head` for top-N queries
- [dedup](/docs/ppl/commands/dedup/) - Deduplicate results for unique combinations
- [PPL Command Reference](/docs/ppl/commands/) - All PPL commands
- [Observability Examples](/docs/ppl/examples/) - Real-world OTel queries
