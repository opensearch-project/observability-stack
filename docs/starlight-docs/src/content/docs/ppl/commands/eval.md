---
title: "eval"
description: "Create computed fields by evaluating expressions - arithmetic, string operations, conditionals, and more."
---

## Description

The `eval` command evaluates an expression and appends the result as a new field to each event in the search results. If a field with the same name already exists, its value is overwritten. Use `eval` whenever you need to derive new values: unit conversions, string manipulation, conditional categorization, date arithmetic, or type casting.

`eval` supports arithmetic, string, date/time, conditional, and type conversion expressions. It is commonly paired with `stats` to prepare fields before aggregation or to compute derived metrics after aggregation.

> **Note:** The `eval` command is executed on the coordinating node and is not pushed down to the OpenSearch query DSL.

---

## Syntax

```sql
eval <field> = <expression> [, <field> = <expression>]...
```

---

## Arguments

| Parameter | Required | Description |
|-----------|----------|-------------|
| `<field>` | Yes | The name of the field to create or update. If the field does not exist, a new field is added. If it already exists, its value is overwritten. |
| `<expression>` | Yes | The expression to evaluate. Supports arithmetic operators (`+`, `-`, `*`, `/`, `%`), string functions, date functions, conditional functions (`if()`, `case()`), type casts (`CAST`), and more. |

---

## Usage notes

- **Multiple assignments in a single `eval`**: Separate them with commas. This is more efficient than chaining multiple `eval` commands.
  ```sql
  | eval duration_ms = durationInNanos / 1000000, status_label = if(`status.code` = 0, 'OK', 'Error')
  ```

- **Later assignments can reference earlier ones**: Within the same `eval`, a field defined on the left can be used by an expression on the right.
  ```sql
  | eval doubled = value * 2, quadrupled = doubled * 2
  ```

- **Overwriting existing fields**: If you assign to an existing field name, the original value is replaced for all downstream commands. The original data in the index is not modified.

- **String concatenation**: Use the `+` operator to concatenate strings. When mixing types, cast numeric values to strings first with `CAST(field AS STRING)`.

- **Conditional expressions**: Use `if(condition, true_value, false_value)` for simple two-way branching, or `case(condition1, value1, condition2, value2, ... else default)` for multi-way branching.

- **Works with all PPL functions**: Any function available in PPL (string, math, date, type conversion) can be used in an `eval` expression.

- **No aggregation functions in `eval`**: Aggregation functions like `count()` or `avg()` belong in `stats`, not `eval`. Use `eval` after `stats` to compute derived metrics from aggregated values.

---

## Basic examples

### Arithmetic -- convert nanoseconds to milliseconds

```sql
source = otel-v1-apm-span-*
| eval duration_ms = durationInNanos / 1000000
```

### String concatenation

```sql
source = logs-otel-v1*
| eval service_severity = `resource.attributes.service.name` + ' - ' + severityText
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20eval%20service_severity%20%3D%20%60resource.attributes.service.name%60%20%2B%20!%27%20-%20!%27%20%2B%20severityText%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Conditional with `if()`

```sql
source = logs-otel-v1*
| eval is_error = if(severityText = 'ERROR', 'yes', 'no')
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20eval%20is_error%20%3D%20if%28severityText%20%3D%20!%27ERROR!%27%2C%20!%27yes!%27%2C%20!%27no!%27%29%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Multi-way conditional with `case()`

```sql
source = otel-v1-apm-span-*
| eval latency_tier = case(
    durationInNanos < 100000000, 'fast',
    durationInNanos < 500000000, 'moderate',
    durationInNanos < 1000000000, 'slow'
    else 'critical')
```

### Type casting with string concatenation

```sql
source = otel-v1-apm-span-*
| eval span_info = 'Service: ' + serviceName + ', Duration (ns): ' + CAST(durationInNanos AS STRING)
```

---

## Extended examples

### OTel: Categorize log severity into alert levels

Derive an `alert_level` field from the numeric severity of log events, useful for routing alerts or filtering dashboards.

```sql
| eval alert_level = case(
    severityNumber >= 21, 'CRITICAL',
    severityNumber >= 17, 'ERROR',
    severityNumber >= 13, 'WARN',
    severityNumber >= 9,  'INFO'
    else 'DEBUG')
| stats count() as cnt by alert_level, `resource.attributes.service.name`
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20eval%20alert_level%20%3D%20case(severityNumber%20%3E%3D%2021%2C%20!%27CRITICAL!%27%2C%20severityNumber%20%3E%3D%2017%2C%20!%27ERROR!%27%2C%20severityNumber%20%3E%3D%2013%2C%20!%27WARN!%27%2C%20severityNumber%20%3E%3D%209%2C%20!%27INFO!%27%20else%20!%27DEBUG!%27)%20%7C%20stats%20count()%20as%20cnt%20by%20alert_level%2C%20%60resource.attributes.service.name%60')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### OTel: Build a composite service identifier

Combine the service name and severity into a single field for downstream grouping or display.

```sql
| eval service_status = `resource.attributes.service.name` + ' [' + severityText + ']'
| head 20
```

<a href="https://observability.playground.opensearch.org/w/AYexAG/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:'6766d4f0-3869-11f1-b2f2-5f6bda0002a3',timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'%7C%20eval%20service_status%20%3D%20%60resource.attributes.service.name%60%20%2B%20!%27%20%5B!%27%20%2B%20severityText%20%2B%20!%27%5D!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

---

## See also

- [stats](/docs/ppl/commands/stats/) -- aggregate results (often used after `eval`)
- [fields](/docs/ppl/commands/fields/) -- select which fields to display
- [where](/docs/ppl/commands/where/) -- filter results using expressions
- [sort](/docs/ppl/commands/sort/) -- order results by computed fields
