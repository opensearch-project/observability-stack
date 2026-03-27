---
title: "spath"
description: "Extract fields from structured JSON data - parse nested JSON within log bodies without re-indexing."
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="caution" title="Experimental - since 3.3">
This command is production-ready but its parameters may change based on community feedback.
</Aside>

The `spath` command extracts fields from structured JSON data stored in a text field. It operates in two modes:

- **Path-based mode** -- When `path` is specified, extracts a single value at the given JSON path.
- **Auto-extract mode** -- When `path` is omitted, extracts all fields from the JSON into a map.

This is ideal for semi-structured OTel log bodies that contain JSON payloads -- you can extract and query nested fields without re-indexing.

<Aside type="note">
The `spath` command runs on the coordinating node, not on data nodes. It processes data after retrieval, which can be slow on large result sets. For fields you need to filter frequently, consider indexing them directly.
</Aside>

## Syntax

```sql
spath input=<field> [output=<field>] [[path=]<json-path>]
```

## Arguments

### Required

| Argument | Description |
|----------|-------------|
| `input=<field>` | The field containing JSON data to parse. |

### Optional

| Argument | Default | Description |
|----------|---------|-------------|
| `output=<field>` | Value of `path` (path mode) or `input` (auto-extract) | Destination field for the extracted data. |
| `path=<json-path>` | -- | The JSON path identifying data to extract. When omitted, runs in auto-extract mode. The `path=` keyword is optional; you can specify the path as a positional argument. |

## JSON path syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `field` | Top-level field | `status` |
| `parent.child` | Dot notation for nested fields | `error.message` |
| `list{0}` | Array element by index | `tags{0}` |
| `list{}` | All array elements | `items{}` |
| `"['special.name']"` | Escaped field names with dots or spaces | `"['a.b.c']"` |

## Usage notes

- The `spath` command always returns extracted values as **strings**. Use `eval` with `cast()` to convert to numeric types for aggregation.
- In auto-extract mode, nested objects produce dotted keys (`user.name`), arrays produce `{}` suffix keys (`tags{}`), and all values are stringified.
- Empty JSON objects (`{}`) return an empty map. Malformed JSON returns partial results from any fields parsed before the error.
- In auto-extract mode, access individual values via dotted path navigation on the output field (e.g., `doc.user.name`). For keys containing `{}`, use backtick quoting.

## Examples

### Extract a field from a JSON body

Extract the `error.message` field from a JSON-encoded log body:

```sql
source = logs-otel-v1*
| spath input=body path=error.message output=error_msg
| where isnotnull(error_msg)
| fields time, error_msg, `resource.attributes.service.name`
```

### Extract array elements

Extract the first element and all elements from an array within JSON data:

```sql
source = logs-otel-v1*
| spath input=body output=first_tag tags{0}
| spath input=body output=all_tags tags{}
| fields body, first_tag, all_tags
```

### Extract nested object fields

Traverse multiple levels of nesting using dot notation:

```sql
source = logs-otel-v1*
| spath input=body path=request.headers.content_type output=content_type
| spath input=body path=response.status output=http_status
| fields time, content_type, http_status
```

### Cast extracted values for aggregation

Extracted values are strings. Cast them before performing numeric operations:

```sql
source = logs-otel-v1*
| spath input=body path=response.latency_ms output=latency
| eval latency = cast(latency as double)
| stats avg(latency) as avg_latency by `resource.attributes.service.name`
```

### Auto-extract all fields from JSON

Extract all fields from a JSON body into a map, then access individual values:

```sql
source = logs-otel-v1*
| spath input=body output=parsed
| fields parsed.user.name, parsed.user.id, parsed.`tags{}`
```

## Extended examples

### Parse OTel log bodies containing structured error payloads

OTel log bodies often contain JSON with error details. Extract specific fields for error analysis:

```sql
source = logs-otel-v1*
| where severityText = 'ERROR'
| spath input=body path=error.type output=error_type
| spath input=body path=error.message output=error_message
| spath input=body path=error.stack output=stack_trace
| stats count() as occurrences by error_type, error_message, `resource.attributes.service.name`
| sort - occurrences
```

### Extract and aggregate token usage from GenAI log events

Parse JSON log bodies containing LLM token usage metrics for cost analysis:

```sql
source = logs-otel-v1*
| spath input=body path=gen_ai.usage.input_tokens output=input_tokens
| spath input=body path=gen_ai.usage.output_tokens output=output_tokens
| eval input_tokens = cast(input_tokens as int), output_tokens = cast(output_tokens as int)
| where isnotnull(input_tokens)
| stats sum(input_tokens) as total_input, sum(output_tokens) as total_output by `resource.attributes.service.name`
```

## See also

- [parse](/docs/ppl/commands/#parse) -- extract fields using regex named capture groups
- [grok](/docs/ppl/commands/#grok) -- extract fields using grok patterns
- [rex](/docs/ppl/commands/#rex) -- regex extraction with sed-mode substitution
- [eval](/docs/ppl/commands/#eval) -- create computed fields and type conversions
