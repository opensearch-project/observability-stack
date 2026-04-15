---
title: "rename"
description: "Rename fields in search results - simplify long OTel attribute names for readability."
---

import { Tabs, TabItem, Aside } from '@astrojs/starlight/components';

<Aside type="note">
**Stable** since OpenSearch 1.0
</Aside>

The `rename` command renames one or more fields in your search results. It is especially useful for simplifying the long, dot-delimited attribute names common in OpenTelemetry data (e.g., `resource.attributes.service.name`) into shorter, readable aliases.

## Syntax

```sql
rename <source-field> AS <target-field> [, <source-field> AS <target-field>]...
```

## Arguments

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<source-field>` | Yes | The current field name. Supports wildcard patterns using `*`. |
| `<target-field>` | Yes | The new name for the field. Must contain the same number of wildcards as the source. |

## Usage notes

- **Multiple renames** can be specified in a single command, separated by commas.
- **Wildcard patterns** (`*`) match any sequence of characters. Both the source and target must have the same number of wildcards. For example, `*Name` matches `serviceName` and `traceGroupName`, and renaming to `*_name` produces `service_name` and `traceGroup_name`.
- **Renaming to an existing field** removes the original target field and replaces it with the source field's values.
- **Renaming a non-existent field to an existing field** removes the target field from results.
- **Renaming a non-existent field to a non-existent field** has no effect.
- The `rename` command executes on the coordinating node and is **not pushed down** to the query DSL.
- Literal `*` characters in field names cannot be escaped -- the asterisk is always treated as a wildcard.

## Examples

### Rename a single field

```sql
source = otel-v1-apm-span-*
| rename serviceName as service
| head 20
```

### Rename multiple fields

```sql
source = otel-v1-apm-span-*
| rename serviceName as service, durationInNanos as duration_ns
| head 20
```

### Rename with wildcards

Match all fields ending in `Name` and replace with `_name`:

```sql
source = otel-v1-apm-service-map-*
| rename *Name as *_name
| head 20
```

### Multiple wildcard patterns

Combine several wildcard renames in one command:

```sql
source = otel-v1-apm-span-*
| rename *Name as *_name, *Id as *_id
| head 20
```

### Rename an existing field to another existing field

The target field is replaced by the source field's values:

```sql
source = otel-v1-apm-span-*
| rename serviceName as name
| head 20
```

The `name` column now contains the original `serviceName` values.

## Extended examples

### Simplify OTel attribute names for log analysis

OpenTelemetry log fields have long, dot-delimited names. Rename them for readability before analysis:

```sql
source = logs-otel-v1*
| rename `resource.attributes.service.name` as service,
         `resource.attributes.telemetry.sdk.language` as language,
         `resource.attributes.host.name` as host
| where severityText = 'ERROR'
| stats count() as errors by service, language, host
| sort - errors
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20rename%20%60resource.attributes.service.name%60%20as%20service%2C%20%60resource.attributes.telemetry.sdk.language%60%20as%20language%2C%20%60resource.attributes.host.name%60%20as%20host%20%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20stats%20count%28%29%20as%20errors%20by%20service%2C%20language%2C%20host%20%7C%20sort%20-%20errors')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Rename span fields for dashboard readability

Shorten trace span attribute names for cleaner output in dashboards:

```sql
source = otel-v1-apm-span-*
| rename serviceName as service, durationInNanos as duration_ns
| eval duration_ms = duration_ns / 1000000
| sort - duration_ms
| head 20
```

## See also

- [fields](/docs/ppl/commands/fields/) - select or exclude fields
- [eval](/docs/ppl/commands/eval/) - create computed fields
- [Command Reference](/docs/ppl/commands/) - all PPL commands
