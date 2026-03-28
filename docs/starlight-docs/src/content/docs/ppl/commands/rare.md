---
title: "rare"
description: "Find the least common values of a field - surface anomalies and unusual patterns."
---

import { Aside } from '@astrojs/starlight/components';

The `rare` command finds the least common values (or combinations of values) for the specified fields. It is the inverse of `top` -- instead of returning the most frequent values, it returns the least frequent. Results are sorted from least to most common.

`rare` is a powerful tool for anomaly surfacing. In observability data, uncommon values often signal problems: a rare error type, a service name that only appeared recently, or an unusual status code can all indicate issues that deserve investigation.

<Aside type="note">
The `rare` command is not rewritten to query DSL. It is executed on the coordinating node. The command returns up to 10 results for each distinct combination of values in the group-by fields.
</Aside>

## Syntax

```sql
rare [rare-options] <field-list> [by <group-field>]
```

## Arguments

| Argument | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `<field-list>` | Yes | Comma-delimited field names | -- | The fields to find rare values for. When multiple fields are specified, `rare` finds the least common combinations. |
| `by <group-field>` | No | Field name(s) | -- | One or more fields to group the results by. Rare values are computed separately within each group. |
| `showcount` | No | Boolean | `true` | When `true`, includes a count column showing the frequency of each value. Set to `false` for cleaner output. |
| `countfield` | No | String | `count` | The name of the count column in the output. Only applies when `showcount=true`. |

## Usage notes

- **Anomaly surfacing.** Rare values in observability data are often signals: a rare error type, a service that barely produces logs, or an unusual severity level can all indicate issues.
- **Rare error types.** Use `rare` on error message fields to find unusual errors that might be masked by high-volume common errors.
- **Rare service names.** A service that appears rarely in logs might be failing to start, experiencing intermittent connectivity, or newly deployed.
- **Rare status codes.** Uncommon HTTP status codes or gRPC error codes can reveal edge cases in your application logic.
- **Use `by` clause for per-group rare values.** Find what is unusual within each group -- for example, the rarest severity level per service.
- **Returns up to 10 results.** The `rare` command returns at most 10 results per group-by combination. Unlike `top`, there is no parameter to increase this limit.

## Examples

### Rarest severity levels

Find the least common log severity levels across all services:

```sql
| rare severityText
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20rare%20severityText')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Rarest services by log volume

Find the services that produce the fewest logs -- these may be failing or newly deployed:

```sql
| rare `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20rare%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Rare severity levels by service

Find the rarest severity levels within each service. A service that rarely produces ERROR logs suddenly showing them is noteworthy:

```sql
| rare showcount=false severityText by `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20rare%20showcount%3Dfalse%20severityText%20by%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Hide the count column

Return just the rare values without frequency counts:

```sql
| rare showcount=false severityText
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20rare%20showcount%3Dfalse%20severityText')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Rename the count column

Use a custom name for the count field:

```sql
| rare countfield='occurrences' `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20rare%20countfield%3D!%27occurrences!%27%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## Extended examples

### Rare service-severity combinations in OTel logs

Find unusual combinations of service and severity level. Combinations that appear rarely may indicate new failure modes:

```sql
| rare `resource.attributes.service.name`, severityText
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20rare%20%60resource.attributes.service.name%60%2C%20severityText')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Rare span operations per OTel service

Find the least frequently executed operations in each service from trace data. Rare operations can indicate code paths that are only hit under unusual conditions -- potential sources of untested behavior:

```sql
source = otel-v1-apm-span-*
| rare name by serviceName
```

This is especially useful after a deployment: if a new operation name appears in `rare` output that was not there before, it may indicate new functionality or an unexpected code path being triggered.

## See also

- [top](/docs/ppl/commands/top/) - The inverse of `rare`: find the most common values
- [dedup](/docs/ppl/commands/dedup/) - Deduplicate to get unique values with sample documents
- [stats](/docs/ppl/commands/stats/) - For more detailed frequency analysis with custom aggregations
- [patterns](/docs/ppl/commands/patterns/) - Automatically discover and cluster log patterns
- [PPL Command Reference](/docs/ppl/commands/) - All PPL commands
