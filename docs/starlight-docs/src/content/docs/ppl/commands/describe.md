---
title: "describe"
description: "Query index metadata - discover available fields, types, and schema information."
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="tip" title="Stable - since 2.1">
This command has a fixed API.
</Aside>

The `describe` command queries index metadata, returning field names, data types, and schema information. It must be used as the **first command** in a PPL query -- it cannot appear after a pipe. This is your starting point when exploring an unfamiliar index.

## Syntax

```sql
describe [<data-source>.][<schema>.]<table-name>
```

## Arguments

### Required

| Argument | Description |
|----------|-------------|
| `<table-name>` | The index or index pattern to describe. Supports wildcards (e.g., `logs-otel-v1*`). |

### Optional

| Argument | Default | Description |
|----------|---------|-------------|
| `<data-source>` | OpenSearch default | The data source to query. |
| `<schema>` | Default schema | The schema containing the table. |

## Output columns

The `describe` command returns metadata rows with the following key columns:

| Column | Description |
|--------|-------------|
| `TABLE_NAME` | Name of the index. |
| `COLUMN_NAME` | Name of the field. |
| `TYPE_NAME` | Data type of the field (e.g., `string`, `bigint`, `timestamp`, `object`, `nested`). |

Additional columns include `TABLE_CAT`, `TABLE_SCHEM`, `DATA_TYPE`, `COLUMN_SIZE`, `NULLABLE`, `ORDINAL_POSITION`, and others following JDBC metadata conventions.

## Usage notes

- `describe` must be the first command in the query. You cannot pipe data into `describe`.
- Combine `describe` with `where` and `fields` to filter and focus on specific columns or types.
- Use wildcard index patterns to describe fields across multiple indices at once.
- The output helps you discover the correct field names and types before writing more complex queries -- especially useful for OTel indices where field names follow dotted semantic conventions.

## Examples

### Describe an index

List all fields and their types in the OTel logs index:

```sql
describe logs-otel-v1*
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'describe%20logs-otel-v1*')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Find fields of a specific type

Filter for all `bigint` (long) fields:

```sql
describe logs-otel-v1*
| where TYPE_NAME = 'bigint'
| fields COLUMN_NAME, TYPE_NAME
```

### Find fields by name pattern

Search for fields containing `service` in their name:

```sql
describe logs-otel-v1*
| where like(COLUMN_NAME, '%service%')
| fields COLUMN_NAME, TYPE_NAME
```

### List all gen_ai fields

Discover GenAI semantic convention fields in your OTel index:

```sql
describe logs-otel-v1*
| where like(COLUMN_NAME, '%gen_ai%')
| fields COLUMN_NAME, TYPE_NAME
```

### Describe the trace index

Explore the span index schema to understand available trace fields:

```sql
describe otel-v1-apm-span-*
| fields COLUMN_NAME, TYPE_NAME
| sort COLUMN_NAME
```

## Extended examples

### Compare schemas across OTel signal indices

Describe both the log and trace indices to find common fields for cross-signal correlation:

```sql
describe logs-otel-v1*
| where COLUMN_NAME IN ('traceId', 'spanId', 'time', 'severityText', 'body')
| fields TABLE_NAME, COLUMN_NAME, TYPE_NAME
```

Then compare with the trace index:

```sql
describe otel-v1-apm-span-*
| where COLUMN_NAME IN ('traceId', 'spanId', 'startTime', 'endTime', 'serviceName')
| fields TABLE_NAME, COLUMN_NAME, TYPE_NAME
```

### Discover all nested object fields

Find all object and nested field types to understand the document structure:

```sql
describe logs-otel-v1*
| where TYPE_NAME = 'object' OR TYPE_NAME = 'nested'
| fields COLUMN_NAME, TYPE_NAME
| sort COLUMN_NAME
```

## See also

- [fields](/docs/ppl/commands/#fields) -- select or exclude fields from query results
- [showdatasources](/docs/ppl/commands/#showdatasources) -- list all configured data sources
- [search](/docs/ppl/commands/#search) -- retrieve documents from an index
