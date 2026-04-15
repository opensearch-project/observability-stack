---
title: "expand"
description: "Expand nested array fields into multiple documents - one row per array element."
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution" title="Experimental - since 3.1">
This command is production-ready but its parameters may change based on community feedback.
</Aside>

The `expand` command transforms a single document containing a nested array field into multiple documents, one per array element. All other fields in the original document are duplicated across the resulting rows. This is useful for working with OTel attributes stored as arrays or nested structures.

## Syntax

```sql
expand <field> [as <alias>]
```

## Arguments

### Required

| Argument | Description |
|----------|-------------|
| `<field>` | The array field to expand. Must be a nested array type. |

### Optional

| Argument | Default | Description |
|----------|---------|-------------|
| `as <alias>` | Original field name | An alias for the expanded field in the output. |

## Usage notes

- Only **nested array** fields are supported. Primitive fields that store array-like strings cannot be expanded. For string fields containing JSON arrays, use [spath](/docs/ppl/commands/spath/) to parse them first.
- If the array field is empty (`[]`), the row is retained with the expanded field set to `null`.
- Expanding a field with N elements produces N rows. Be mindful of result set size when expanding large arrays.
- After expansion, each row contains the individual array element (or its alias), along with all other fields from the original document duplicated.
- Combine `expand` with [flatten](/docs/ppl/commands/flatten/) to first expand an array of objects, then flatten each object's fields into top-level columns.

## Examples

<Aside type="note">
In the Observability Stack, Data Prepper flattens OTel attributes into dotted field names (e.g., `resource.attributes.service.name`). The `expand` command is most useful when working with indices that store arrays or nested objects, such as custom application indices or raw OTLP data ingested without flattening.
</Aside>

### Expand an array field

Expand the `resource.attributes` array from OTel log records into individual rows, one per attribute:

```sql
source = logs-otel-v1*
| expand resource.attributes
```

### Expand with an alias

Expand and rename the expanded field for clarity:

```sql
source = logs-otel-v1*
| expand resource.attributes as attr
```

### Filter after expansion

Expand resource attributes into rows, then filter for a specific attribute key:

```sql
source = logs-otel-v1*
| expand resource.attributes as attr
| flatten attr
| where key = 'service.name'
```

## Extended examples

### Expand and flatten OTel resource attributes

OTel data often stores attributes as arrays of key-value objects. Expand the array first, then flatten each object to access individual attributes:

```sql
source = logs-otel-v1*
| expand resource.attributes as attr
| flatten attr
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20expand%20resource.attributes%20as%20attr%20%7C%20flatten%20attr%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Expand nested scope attributes for instrumentation analysis

Examine individual scope attributes from OTel log records to understand which instrumentation libraries are producing logs:

```sql
source = logs-otel-v1*
| expand instrumentationScope.attributes as scope_attr
| flatten scope_attr
| stats count() as log_count by key, value
| sort - log_count
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20expand%20instrumentationScope.attributes%20as%20scope_attr%20%7C%20flatten%20scope_attr%20%7C%20stats%20count%28%29%20as%20log_count%20by%20key%2C%20value%20%7C%20sort%20-%20log_count')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## See also

- [flatten](/docs/ppl/commands/flatten/) -- flatten struct/object fields into top-level columns
- [spath](/docs/ppl/commands/spath/) -- parse JSON strings before expanding
- [eval](/docs/ppl/commands/eval/) -- transform expanded values
