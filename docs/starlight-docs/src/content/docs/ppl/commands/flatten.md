---
title: "flatten"
description: "Flatten struct or object fields into separate top-level fields - simplify nested data structures."
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution" title="Experimental - since 3.1">
This command is production-ready but its parameters may change based on community feedback.
</Aside>

The `flatten` command converts a struct or object field into individual top-level fields within a document. Each key in the struct becomes its own column. The resulting fields are ordered **lexicographically** by their original key names.

## Syntax

```sql
flatten <field> [as (<alias-list>)]
```

## Arguments

### Required

| Argument | Description |
|----------|-------------|
| `<field>` | The struct or object field to flatten. Only object and nested field types are supported. |

### Optional

| Argument | Default | Description |
|----------|---------|-------------|
| `as (<alias-list>)` | Original key names | Comma-separated aliases for the flattened fields. Must be enclosed in parentheses if more than one alias. The number of aliases must match the number of keys, and they map in **lexicographic order** of the original keys. |

## Usage notes

- Do **not** apply `flatten` to array fields. Use [expand](/docs/ppl/commands/expand/) to split arrays into rows first, then `flatten` each resulting object.
- When a field contains a nested array, only the first element of the array is flattened.
- The `flatten` command may not work as expected if flattened fields are hidden. For example, `source=my-index | fields message | flatten message` fails because sub-fields like `message.info` are hidden after `fields message`. Instead, use `source=my-index | flatten message`.
- Aliases must follow the lexicographic order of original keys. For a struct with keys `b`, `c`, `Z`, provide aliases in the order `Z`, `b`, `c` (uppercase sorts before lowercase).

## Examples

### Flatten an object field

Flatten a `message` object into its component fields:

```sql
source = my-index
| flatten message
| fields myNum, author, dayOfWeek, info
```

### Flatten with aliases

Rename flattened fields using aliases (in lexicographic order of original keys: `author`, `dayOfWeek`, `info`):

```sql
source = my-index
| flatten message as (creator, dow, details)
```

### Flatten after filtering

Filter first, then flatten to reduce the data volume before restructuring:

```sql
source = my-index
| where myNum > 1
| flatten message
| fields author, info
```

## Extended examples

### Flatten OTel span attributes for analysis

OTel span documents store HTTP metadata in nested objects. Flatten them for easier querying:

```sql
source = otel-v1-apm-span-*
| flatten attributes
| fields serviceName, name, `http.method`, `http.status_code`, `http.url`
| where `http.status_code` >= 400
| stats count() as error_count by serviceName, `http.status_code`
```

### Expand and flatten a nested array of objects

Combine `expand` and `flatten` to work with arrays of structured objects. First expand the array into rows, then flatten each object:

```sql
source = my-index
| expand events as event
| flatten event
| fields timestamp, event_type, details
| sort - timestamp
```

## See also

- [expand](/docs/ppl/commands/expand/) -- expand array fields into multiple rows (use before `flatten` for arrays of objects)
- [spath](/docs/ppl/commands/spath/) -- extract fields from JSON strings
- [fields](/docs/ppl/commands/#fields) -- select or exclude fields from results
