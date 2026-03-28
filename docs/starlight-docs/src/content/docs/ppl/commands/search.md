---
title: "search"
description: "Retrieve documents from an index - the starting point of every PPL query."
---

## Description

The `search` command retrieves documents from an index. It is the **starting point of every PPL query** and must always be the first command in the pipeline. Every PPL query begins with `search` (or its shorthand `source=`) to specify which index to query.

The `search` keyword itself can be omitted - `source=<index>` is equivalent to `search source=<index>`. An optional boolean expression filters results at the search level before any pipeline processing occurs.

**In the Discover UI**, the dataset selector automatically sets the source index. Queries in the query bar start with a pipe character (`|`) and do not need a `source=` clause.

## Syntax

```sql
search source=[<remote-cluster>:]<index> [<boolean-expression>]
```

Shorthand (omitting the `search` keyword):

```sql
source=<index> [<boolean-expression>]
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<index>` | Yes | The name of the index to query. Supports wildcard patterns (e.g., `logs-otel-v1*`). |
| `<boolean-expression>` | No | A filter expression applied at search time. Supports field comparisons (`=`, `!=`, `>`, `<`, `>=`, `<=`), Boolean operators (`AND`, `OR`, `NOT`), `IN`, wildcards (`*`, `?`), full-text search, and time modifiers (`earliest`, `latest`). |
| `<remote-cluster>` | No | The name of a remote cluster for cross-cluster search. Prefixed to the index name with a colon (e.g., `remote:logs-otel-v1*`). |

## Usage notes

- **Always first**: `search` must be the first command in any PPL query. Exactly one `search` (or `source=`) is allowed per query.
- **Omitting the keyword**: The `search` keyword is optional. Writing `source=logs-otel-v1*` is the most common form.
- **Discover UI queries**: When using PPL in Discover, the source index is set by the dataset selector. Your query starts with `|` followed by pipeline commands (e.g., `| where severityText = 'ERROR' | fields body`).
- **Search expression vs. where**: The boolean expression in `search` is converted to an OpenSearch query string query and executes at the search layer. For more complex filtering with functions and eval expressions, use the [`where`](/docs/ppl/commands/where/) command after the pipe.
- **Cross-cluster search**: To query an index on a remote cluster, prefix the index name with the cluster name and a colon. Cross-cluster search must be configured at the OpenSearch level.
- **Full-text search**: Unquoted terms search across all fields (or the configured default field). Multiple terms are combined with `AND` by default. Use quotes for phrase matching.
- **Wildcard patterns in index names**: Index names support `*` wildcards (e.g., `source=logs-*`), which is common for querying across time-based index patterns.
- **Operator precedence**: Boolean operators in the search expression follow this precedence: `Parentheses > NOT > OR > AND`. Note that this is PPL-specific and differs from SQL and Splunk SPL, where `AND` binds tighter than `OR`. In PPL, `a OR b AND c` is evaluated as `(a OR b) AND c`, not `a OR (b AND c)`. Use explicit parentheses to avoid ambiguity.
- **`NOT` vs. `!=`**: The `!=` operator excludes documents with null or missing fields, while `NOT` includes them. See the extended examples for details.

## Basic examples

### Retrieve all documents

Fetch every document from an index with no filter. Useful for exploring data or verifying ingestion.

```sql
source=logs-otel-v1*
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Filter with a boolean expression

Return only documents where `severityText` is `ERROR`:

```sql
source=logs-otel-v1* severityText="ERROR"
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Full-text search

Search across all fields for documents containing the term `timeout`:

```sql
search timeout source=logs-otel-v1*
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20match%28body%2C%20!%27timeout!%27%29%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Multi-value match with IN

Match documents where `severityText` is one of several values:

```sql
source=logs-otel-v1* severityText IN ("ERROR", "WARN", "FATAL")
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20IN%20%28!%27ERROR!%27%2C%20!%27WARN!%27%2C%20!%27FATAL!%27%29%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Search across trace data

Query OTel trace spans with a filter to find error spans:

```sql
source=otel-v1-apm-span-* status.code=2
| head 20
```

[Try in Playground](https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%3Dotel-v1-apm-span-%2A%20status.code%3D2%0A%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

## Extended examples

### Filter OTel logs by service and severity

Find error logs from a specific service using OTel semantic convention fields. Backticks are required for dotted field names.

```sql
source=logs-otel-v1*
  severityText="ERROR"
  AND `resource.attributes.service.name`="cart"
| head 20
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20and%20%60resource.attributes.service.name%60%20%3D%20!%27cart!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Discover-style query (no source clause)

In the Discover UI, the dataset selector sets the index. Your query starts with `|`:

```sql
| where severityText = 'ERROR'
| head 50
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20%7C%20head%2050')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Cross-cluster search

Query an index on a remote cluster named `us-west`:

```sql
source=us-west:logs-otel-v1* severityText="ERROR"
| stats count() as error_count by `resource.attributes.service.name`
| sort - error_count
```

## See also

- [`where`](/docs/ppl/commands/where/) - Filter results using boolean expressions after the pipe
- [`fields`](/docs/ppl/commands/fields/) - Select or exclude specific fields from the output
- [PPL Commands](/docs/ppl/commands/) - Full command reference
