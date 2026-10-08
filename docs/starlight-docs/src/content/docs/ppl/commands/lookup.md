---
title: "lookup"
description: "Enrich events with data from a lookup index - add context like team names, environment labels, or cost data."
---

import { Tabs, TabItem, Aside } from '@astrojs/starlight/components';

<Aside type="caution">
**Experimental** since OpenSearch 3.0 - syntax may change based on community feedback.
</Aside>

The `lookup` command enriches your search results with fields from a second index (a "dimension table" or "lookup table"). For each row in your search results, `lookup` finds the matching row in the lookup index and copies fields from it onto your result.

Think of it as a left join tuned for enrichment: every row from your search is kept, and matched fields from the lookup index are added or overwritten. If there is no match, the added fields are `null`. Compared with the `join` command, `lookup` is simpler and better suited for attaching a static reference dataset (region names, user departments, product categories) to streaming data.

## How to read a lookup clause

A lookup clause has three parts, read left to right:

```
lookup  <lookupIndex>   <matchFields>   [<strategy> <copyFields>]
        ─────────────   ─────────────   ─────────────────────────
        which index     how to match    what to copy over
        to enrich from  rows            (optional)
```

### Match fields: `lookupField AS sourceField`

The match fields tell `lookup` how to pair a row in your results with a row in the lookup index.

> **The name on the left of `AS` is a field in the lookup index. The name on the right is the field in the search results.**

So `lookup work_information uid AS id` reads as:

> "Match each result row where **my** `id` equals `work_information`'s `uid`."

The lookup field comes first because you are describing the lookup index (`uid`) and then saying which of your own fields it lines up with (`id`). If both indexes already use the same field name, you can drop the `AS` entirely: `lookup work_information id` matches `id` to `id`.

You can match on several fields at once with a comma-separated list; a row matches only when all of them are equal. Fields without `AS` match by the same name; you can mix remapped and same-name fields:

```
lookup work_information uid AS id, name            -- match work_information.uid = worker.id AND work_information.name = worker.name
lookup work_information uid AS id, dept AS department  -- both fields remapped
```

### Copy fields: `inputField AS outputField`

After the match fields, you optionally list which fields to copy from the lookup index onto your results, and optionally rename them. This follows the same left-to-right pattern as match fields:

> **The name on the left of `AS` is a field in the LOOKUP index (the source of the value). The name on the right is the field name it has in the results.**

So `replace department AS dept` reads as "copy `work_information.department` onto my results under the name `dept`."

If you list no copy fields at all, `lookup` copies all fields from the lookup index except the ones used for matching.

### Strategy: `replace` vs. `append`

The strategy controls what happens when the output field already exists on your result row:

| Strategy | Behavior when the output field already has a value | Behavior when it is `null` / missing |
| --- | --- | --- |
| `replace` (default) | Overwrites it with the value from the lookup index (even overwriting with `null` on no match) | Fills it in from the lookup index |
| `append` | Keeps your existing value | Fills it in from the lookup index |

`replace` wins; `append` only fills gaps. If the output field does not exist on your results yet, both strategies simply add it. `output` is an accepted synonym for `replace`.

## Syntax

```sql
lookup <lookupIndex> (<lookupMappingField> [AS <sourceMappingField>])...
  [(replace | append | output) (<inputField> [AS <outputField>])...]
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<lookupIndex>` | Yes | The lookup index (dimension table) to enrich from. |
| `<lookupMappingField>` | Yes | A field in the **lookup index** used for matching. With no `as` clause, a field of the same name is expected in your search results. List several as a comma-separated set; all must match. |
| `<sourceMappingField>` | No | The field in **your search results** that `<lookupMappingField>` is matched against. Defaults to the same name as `<lookupMappingField>`. |
| `replace \| append \| output` | No | How copied values are applied. `replace` (default) overwrites; `append` fills only missing/`null` values; `output` is a synonym for `replace`. |
| `<inputField>` | No | A field in the **lookup index** whose matched value is copied onto your results. List several as a comma-separated set. If omitted, every field in the lookup index except the match fields is copied. |
| `<outputField>` | No | The field name on **your results** where the copied value lands. Defaults to `<inputField>`. `replace` can create new fields or overwrite existing ones; `append` fills existing fields only. |

<Aside type="note">
The `lookup` command requires a pre-existing lookup index (dimension table) in your cluster. The examples below assume you have created the referenced lookup indices. They are not available in the public playground.
</Aside>

## Examples

### Basic lookup - replace values

Enrich log events with team ownership from a `service_owners` reference index:

```sql
source = logs-otel-v1*
| eval service = `resource.attributes.service.name`
| LOOKUP service_owners service_name AS service REPLACE team
```

### Append missing values only

Fill in `team` where it is currently `null`, without overwriting existing values:

```sql
source = logs-otel-v1*
| eval service = `resource.attributes.service.name`
| LOOKUP service_owners service_name AS service APPEND team
```

### Lookup without specifying input fields

When no `inputField` is specified, all non-key fields from the lookup index are applied:

```sql
source = logs-otel-v1*
| eval service = `resource.attributes.service.name`
| LOOKUP service_owners service_name AS service
```

### Map to a new output field

Place matched values into a new field using `AS`:

```sql
source = otel-v1-apm-span-*
| LOOKUP environments service_name AS serviceName REPLACE env AS deploy_env
```

### Using the OUTPUT keyword

`OUTPUT` is a synonym for `REPLACE` and produces identical results:

```sql
source = logs-otel-v1*
| eval service = `resource.attributes.service.name`
| LOOKUP service_owners service_name AS service OUTPUT team
```

## Extended examples

### Enrich logs with service ownership

Assume you have a `service_owners` index mapping `service.name` to `team`, `oncall`, and `tier`. Enrich log events with ownership context:

```sql
source = logs-otel-v1*
| eval service = `resource.attributes.service.name`
| LOOKUP service_owners service.name AS service REPLACE team, oncall, tier
| head 50
```

### Add environment labels to spans

Enrich trace spans with deployment metadata from an `environments` reference index:

```sql
source = otel-v1-apm-span-*
| LOOKUP environments service_name AS serviceName REPLACE env, region, cost_center
| where env = 'production'
| sort - durationInNanos
| head 20
```

## See also

- [join](/docs/ppl/commands/join/) - full join for complex multi-field correlation
- [eval](/docs/ppl/commands/eval/) - compute new fields from expressions
- [Command Reference](/docs/ppl/commands/) - all PPL commands
