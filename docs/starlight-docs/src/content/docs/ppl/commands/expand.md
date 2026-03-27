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

### Expand an array field

Expand a nested array of addresses into individual rows:

```sql
source = my-index
| expand address
```

### Expand with an alias

Expand and rename the expanded field:

```sql
source = my-index
| expand address as addr
| fields name, age, addr
```

### Filter after expansion

Expand an array and then filter for specific elements:

```sql
source = my-index
| expand tags as tag
| where tag = 'production'
| fields name, tag
```

## Extended examples

### Expand and flatten OTel resource attributes

OTel data often stores attributes as arrays of key-value objects. Expand the array first, then flatten each object to access individual attributes:

```sql
source = logs-otel-v1*
| expand resource.attributes as attr
| flatten attr
| fields time, key, value, body
```

### Expand nested scope attributes for instrumentation analysis

Examine individual scope attributes from OTel log records to understand which instrumentation libraries are producing logs:

```sql
source = logs-otel-v1*
| expand instrumentationScope.attributes as scope_attr
| flatten scope_attr
| stats count() as log_count by key, value
| sort - log_count
```

## See also

- [flatten](/docs/ppl/commands/flatten/) -- flatten struct/object fields into top-level columns
- [spath](/docs/ppl/commands/spath/) -- parse JSON strings before expanding
- [eval](/docs/ppl/commands/#eval) -- transform expanded values
