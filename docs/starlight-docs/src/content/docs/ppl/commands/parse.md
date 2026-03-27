---
title: "parse"
description: "Extract fields from text using regular expressions - turn unstructured log data into structured fields."
---

import { Aside } from '@astrojs/starlight/components';

The `parse` command extracts new fields from a text field using a Java regular expression with named capture groups. Each named group in the pattern creates a new string field appended to the search results. The original field is preserved.

<Aside type="note">
**Stable** since OpenSearch 2.4.
</Aside>

## Syntax

```sql
parse <field> <regex-pattern>
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<field>` | Yes | The text field to parse. |
| `<regex-pattern>` | Yes | A Java regular expression containing one or more named capture groups using `(?<name>pattern)` syntax. Each named group creates a new string field. If a field with the same name already exists, its values are overwritten. |

## Usage notes

- Named capture groups in the regex pattern become new fields. For example, `(?<host>.+)` creates a field called `host`.
- If a named group matches a field that already exists, the existing field is overwritten with the extracted value.
- Parsed fields are available for use in all subsequent pipe commands (`where`, `stats`, `sort`, `eval`, etc.).
- The pattern uses [Java regular expression syntax](https://docs.oracle.com/javase/8/docs/api/java/util/regex/Pattern.html).
- When parsing a null field, the result is an empty string.
- Fields created by `parse` cannot be re-parsed by another `parse` command.
- The source field used by `parse` cannot be overridden by `eval` and still produce correct results.

**Common regex patterns:**

| Pattern | Matches |
|---------|---------|
| `(?<ip>\d+\.\d+\.\d+\.\d+)` | IPv4 addresses |
| `(?<status>\d{3})` | HTTP status codes |
| `(?<key>\w+)=(?<value>[^\s]+)` | Key-value pairs |
| `(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})` | ISO timestamps |
| `(?<method>GET\|POST\|PUT\|DELETE)` | HTTP methods |
| `(?<path>/[^\s]+)` | URL paths |

## Basic examples

### Extract HTTP method and path from log bodies

Parse the HTTP method and request path from log messages:

```sql
source = logs-otel-v1*
| parse body '(?<method>GET|POST|PUT|DELETE|PATCH|HEAD) (?<path>/[^\s]+)'
| fields body, method, path
```

| body | method | path |
|------|--------|------|
| GET /api/v1/agents HTTP/1.1 200 | GET | /api/v1/agents |
| POST /api/v1/invoke HTTP/1.1 201 | POST | /api/v1/invoke |
| DELETE /api/v1/sessions/abc123 HTTP/1.1 204 | DELETE | /api/v1/sessions/abc123 |

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1*%20%7C%20parse%20body%20!%27(%3F%3Cmethod%3EGET%7CPOST%7CPUT%7CDELETE%7CPATCH%7CHEAD)%20(%3F%3Cpath%3E%2F%5B%5E%5Cs%5D%2B)!%27%20%7C%20fields%20body%2C%20method%2C%20path')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Extract IP address and status code from log lines

Split a log body into its IP and status code components, then filter and sort:

```sql
source = logs-otel-v1*
| parse body '(?<clientip>\d+\.\d+\.\d+\.\d+).*\s(?<status>\d{3})\s'
| where cast(status as int) >= 400
| sort status
| fields clientip, status
```

| clientip | status |
|----------|--------|
| 10.0.1.55 | 400 |
| 192.168.1.10 | 404 |
| 172.16.0.42 | 500 |

### Override an existing field

Replace the `body` field with only the message portion after the timestamp by using the same field name in the capture group:

```sql
source = logs-otel-v1*
| parse body '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\S*\s+(?<body>.+)'
| fields body
```

| body |
|------|
| Connection refused to upstream service |
| Request completed successfully |
| Timeout waiting for response |
| Agent invocation started |

### Extract request metrics from structured log bodies

Parse structured log messages to pull out the HTTP method and request path:

```sql
source = logs-otel-v1*
| parse body '"(?<method>GET|POST|PUT|DELETE|PATCH|HEAD) (?<path>[^\s]+) HTTP'
| stats count() by method, path
| sort - count()
```

## Extended examples

### Parse structured fields from OTel log bodies

OpenTelemetry log bodies often contain semi-structured text. Use `parse` to extract actionable fields:

```sql
source = logs-otel-v1*
| parse body '(?<level>\w+)\s+\[(?<component>[^\]]+)\]\s+(?<message>.+)'
| where isnotnull(level)
| stats count() as log_count by level, component
| sort - log_count
```

This query extracts a log level, component name, and message text from log bodies that follow a `LEVEL [component] message` pattern, then aggregates counts by level and component.

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1*%20%7C%20parse%20body%20!%27(%3F%3Clevel%3E%5Cw%2B)%5Cs%2B%5C%5B(%3F%3Ccomponent%3E%5B%5E%5C%5D%5D%2B)%5C%5D%5Cs%2B(%3F%3Cmessage%3E.%2B)!%27%20%7C%20where%20isnotnull(level)%20%7C%20stats%20count()%20as%20log_count%20by%20level%2C%20component%20%7C%20sort%20-%20log_count')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Extract key=value pairs from log messages

Many applications emit logs with `key=value` style metadata. Parse these into queryable fields:

```sql
source = logs-otel-v1*
| parse body 'status=(?<status>\d+)'
| parse body 'duration=(?<duration>[^\s,]+)'
| where isnotnull(status)
| stats avg(cast(duration as double)) as avg_duration by status
| sort status
```

<Aside type="caution">
Fields created by `parse` cannot be re-parsed by another `parse` command in the same query. Each `parse` must operate on an original source field.
</Aside>

## Limitations

- Fields created by `parse` cannot be parsed again by a subsequent `parse` command.
- Fields created by `parse` cannot be overridden by `eval`.
- The source text field used by `parse` cannot be overridden and still produce correct results.
- Parsed fields do not appear in the final results unless the original source field is included in the `fields` command.
- Parsed fields cannot be filtered or sorted after they are used in a `stats` command.

## See also

- [grok](/docs/ppl/commands/grok/) -- extract fields using predefined grok patterns instead of raw regex
- [rex](/docs/ppl/commands/rex/) -- more powerful regex extraction with sed mode and multiple matches
- [patterns](/docs/ppl/commands/patterns/) -- automatically discover log patterns without writing regex
- [PPL Functions Reference](/docs/ppl/functions/) -- `regexp_match` and other string functions for regex filtering
