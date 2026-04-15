---
title: "where"
description: "Filter search results using boolean expressions - the primary filtering command in PPL."
---

## Description

The `where` command filters search results to only those rows where the specified boolean expression evaluates to `true`. It is the **primary filtering command** in PPL and can appear anywhere in the pipeline after the `search` (or `source=`) command.

`where` supports all comparison operators, logical operators, pattern matching with `LIKE`, set membership with `IN`, range checks with `BETWEEN`, null testing with `IS NULL` / `IS NOT NULL`, and nested conditions with parentheses. You can also use built-in functions and `eval` expressions inline within the boolean expression.

## Syntax

```sql
where <boolean-expression>
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<boolean-expression>` | Yes | The condition used to filter results. Only rows where this evaluates to `true` are returned. |

### Supported operators

| Category | Operators |
|----------|-----------|
| **Comparison** | `=`, `!=`, `<>`, `>`, `<`, `>=`, `<=` |
| **Logical** | `AND`, `OR`, `NOT` |
| **Pattern matching** | `LIKE(field, pattern)` - `%` matches zero or more characters, `_` matches exactly one character |
| **Set membership** | `IN (value1, value2, ...)` |
| **Range** | `BETWEEN value1 AND value2` |
| **Null testing** | `IS NULL`, `IS NOT NULL`, `ISNULL(field)`, `ISNOTNULL(field)` |
| **Grouping** | Parentheses `( )` for controlling evaluation order |

## Usage notes

- **Multiple where commands**: You can chain multiple `where` commands in a single pipeline. Each successive `where` further narrows the result set, equivalent to combining them with `AND`.
- **Eval expressions inline**: You can use functions and expressions directly in the boolean condition (e.g., `where length(body) > 100` or `where LIKE(body, '%timeout%')`).
- **Null handling**: Comparisons with `null` values follow SQL semantics - a comparison involving `null` evaluates to `null` (not `true` or `false`), so the row is excluded. Use `IS NULL` or `ISNULL()` to explicitly test for null values.
- **String values**: Enclose string literals in single quotes (`'value'`). Double quotes are used for field names that contain special characters.
- **Backtick field names**: OTel fields with dots in their names (e.g., `resource.attributes.service.name`) must be enclosed in backticks to prevent them from being interpreted as nested field access.
- **Performance**: Filters applied earlier in the pipeline reduce the amount of data processed by subsequent commands. Place your most selective `where` conditions as early as possible.
- **vs. search expression**: The `search` command also supports inline boolean expressions, but `where` is more flexible - it supports functions, `LIKE`, `BETWEEN`, and computed expressions that `search` does not.

## Basic examples

### Simple comparison

Return log entries with a severity number greater than 9 (above DEBUG level):

```sql
source=logs-otel-v1*
| where severityNumber > 9
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityNumber%20%3E%209%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Combine conditions with AND / OR

Return error logs from the checkout service:

```sql
source=logs-otel-v1*
| where severityText = 'ERROR' AND `resource.attributes.service.name` = 'checkout'
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20AND%20%60resource.attributes.service.name%60%20%3D%20!%27checkout!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

Return logs that are either errors or from the payment service:

```sql
source=logs-otel-v1*
| where severityText = 'ERROR' OR `resource.attributes.service.name` = 'payment'
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20OR%20%60resource.attributes.service.name%60%20%3D%20!%27payment!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Pattern matching with LIKE

Find logs whose body contains the word `connection`:

```sql
source=logs-otel-v1*
| where LIKE(body, '%connection%')
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20LIKE%28body%2C%20!%27%25connection%25!%27%29%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

Find service names starting with `product-`:

```sql
source=logs-otel-v1*
| where LIKE(`resource.attributes.service.name`, 'product-%')
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20LIKE%28%60resource.attributes.service.name%60%2C%20!%27product-%25!%27%29%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Set membership with IN

Return logs matching specific severity levels:

```sql
source=logs-otel-v1*
| where severityText IN ('ERROR', 'WARN', 'FATAL')
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20IN%20%28!%27ERROR!%27%2C%20!%27WARN!%27%2C%20!%27FATAL!%27%29%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Filter by numeric range

Return logs with severity numbers in the error range (17 through 21) using `BETWEEN`:

```sql
source = logs-otel-v1*
| where severityNumber BETWEEN 17 AND 21
| stats count() as logs by severityText
```

[Try in Playground](https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1%2A%0A%7C%20where%20severityNumber%20BETWEEN%2017%20AND%2021%0A%7C%20stats%20count%28%29%20as%20logs%20by%20severityText')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t)))

### Null testing

Find log entries where the trace ID is empty (logs not correlated to a trace):

```sql
source=logs-otel-v1*
| where traceId = ''
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20traceId%20%3D%20!%27!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

Find log entries that have a span ID (logs correlated to a specific span):

```sql
source=logs-otel-v1*
| where ISNOTNULL(spanId)
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20ISNOTNULL%28spanId%29%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Grouped conditions

Combine multiple conditions with parentheses to control evaluation order:

```sql
source=logs-otel-v1*
| where (severityText = 'ERROR' OR severityText = 'FATAL') AND `resource.attributes.service.name` = 'weather-agent'
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20%28severityText%20%3D%20!%27ERROR!%27%20OR%20severityText%20%3D%20!%27FATAL!%27%29%20AND%20%60resource.attributes.service.name%60%20%3D%20!%27weather-agent!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## Extended examples

### Filter error logs by service

Find ERROR and FATAL logs from the weather agent service. This is a common starting point for incident triage.

```sql
source=logs-otel-v1*
| where severityText = 'ERROR' OR severityText = 'FATAL'
| where `resource.attributes.service.name` = 'weather-agent'
| head 50
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20severityText%20%3D%20!%27ERROR!%27%20OR%20severityText%20%3D%20!%27FATAL!%27%20%7C%20where%20%60resource.attributes.service.name%60%20%3D%20!%27weather-agent!%27%20%7C%20head%2050')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Compound GenAI attribute filter

Filter logs for a specific GenAI agent operation, useful for investigating AI agent invocation failures or high-latency completions.

```sql
source=logs-otel-v1*
| where `attributes.gen_ai.operation.name` = 'invoke_agent'
| where `resource.attributes.service.name` = 'weather-agent'
| where severityNumber >= 17
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20%60attributes.gen_ai.operation.name%60%20%3D%20!%27invoke_agent!%27%20%7C%20where%20%60resource.attributes.service.name%60%20%3D%20!%27weather-agent!%27%20%7C%20where%20severityNumber%20%3E%3D%2017%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Filter logs containing a keyword pattern

Find logs whose body contains the word "timeout" using `LIKE` with wildcard characters:

```sql
source=logs-otel-v1*
| where LIKE(body, '%timeout%')
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20where%20LIKE%28body%2C%20!%27%25timeout%25!%27%29%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## See also

- [`search`](/docs/ppl/commands/search/) - The starting point of every PPL query, also supports inline boolean expressions
- [`fields`](/docs/ppl/commands/fields/) - Select or exclude specific fields from the output
- [PPL Commands](/docs/ppl/commands/) - Full command reference
