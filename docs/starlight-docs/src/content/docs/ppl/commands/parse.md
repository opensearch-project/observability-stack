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
- The pattern must match the **entire** string from start to end. Use `[\s\S]+` at the end of the pattern to consume any remaining content including trailing newlines.
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
| `(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})` | ISO timestamps |
| `(?<method>GET\|POST\|PUT\|DELETE)` | HTTP methods |
| `(?<path>/[^\s]+)` | URL paths |
| `[\s\S]+` | Match remaining text (including newlines) |

## Basic examples

### Extract HTTP method, path, and status from Envoy access logs

Parse the Envoy access log format emitted by the frontend-proxy service. The pattern must match the full body string:

```sql
source=logs-otel-v1*
| where like(body, '%HTTP/1.1"%')
| parse body '\[(?<ts>[^\]]+)\] "(?<method>\w+) (?<path>\S+) HTTP/(?<ver>[^"]+)" (?<status>\d+)[\s\S]+'
| head 20
```

| body | ts | method | path | status |
|------|----|--------|------|--------|
| [2026-02-26T18:04:21.634Z] "GET /api/data HTTP/1.1" 200 ... | 2026-02-26T18:04:21.634Z | GET | /api/data | 200 |
| [2026-02-26T18:04:23.059Z] "POST /api/product-ask-ai-assistant/0PUK6V6EV0 HTTP/1.1" 200 ... | 2026-02-26T18:04:23.059Z | POST | /api/product-ask-ai-assistant/0PUK6V6EV0 | 200 |
| [2026-02-26T18:04:21.629Z] "GET /api/data/ HTTP/1.1" 308 ... | 2026-02-26T18:04:21.629Z | GET | /api/data/ | 308 |

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%3Dlogs-otel-v1%2A%20%7C%20where%20like%28body%2C%20!%27%25HTTP%2F1.1%22%25!%27%29%20%7C%20parse%20body%20!%27%5C%5B%28%3F%3Cts%3E%5B%5E%5C%5D%5D%2B%29%5C%5D%20%22%28%3F%3Cmethod%3E%5Cw%2B%29%20%28%3F%3Cpath%3E%5CS%2B%29%20HTTP%2F%28%3F%3Cver%3E%5B%5E%22%5D%2B%29%22%20%28%3F%3Cstatus%3E%5Cd%2B%29%5B%5Cs%5CS%5D%2B!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Filter Envoy logs by status code

Parse the status code from Envoy access logs and filter for non-2xx responses:

```sql
source=logs-otel-v1*
| where `resource.attributes.service.name` = 'frontend-proxy'
| parse body '\[(?<ts>[^\]]+)\] "(?<method>\w+) (?<path>\S+) HTTP/(?<ver>[^"]+)" (?<status>\d+)[\s\S]+'
| where cast(status as int) >= 300
| sort status
| head 20
```

| method | path | status |
|--------|------|--------|
| GET | /api/data/ | 308 |
| GET | /api/data/ | 308 |
| GET | /api/data/ | 308 |

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%3Dlogs-otel-v1%2A%20%7C%20where%20%60resource.attributes.service.name%60%20%3D%20!%27frontend-proxy!%27%20%7C%20parse%20body%20!%27%5C%5B%28%3F%3Cts%3E%5B%5E%5C%5D%5D%2B%29%5C%5D%20%22%28%3F%3Cmethod%3E%5Cw%2B%29%20%28%3F%3Cpath%3E%5CS%2B%29%20HTTP%2F%28%3F%3Cver%3E%5B%5E%22%5D%2B%29%22%20%28%3F%3Cstatus%3E%5Cd%2B%29%5B%5Cs%5CS%5D%2B!%27%20%7C%20where%20cast%28status%20as%20int%29%20%3E%3D%20300%20%7C%20sort%20status%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Override an existing field

Replace the `body` field with just the user action by using the same field name in the capture group. This works on load-generator log bodies that start with "User":

```sql
source=logs-otel-v1*
| where like(body, 'User %')
| parse body 'User (?<body>.+)'
| head 20
```

| body |
|------|
| viewing cart |
| getting recommendations for product: 0PUK6V6EV0 |
| getting ads for category: None |
| accessing index page |

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%3Dlogs-otel-v1%2A%20%7C%20where%20like%28body%2C%20!%27User%20%25!%27%29%20%7C%20parse%20body%20!%27User%20%28%3F%3Cbody%3E.%2B%29!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Aggregate request counts by endpoint

Parse the Envoy access log format and count requests per method and path:

```sql
source=logs-otel-v1*
| where like(body, '%HTTP/1.1"%')
| parse body '\[(?<ts>[^\]]+)\] "(?<method>\w+) (?<path>\S+) HTTP/(?<ver>[^"]+)" (?<status>\d+)[\s\S]+'
| stats count() as cnt by method, path
| sort - cnt
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%3Dlogs-otel-v1%2A%20%7C%20where%20like%28body%2C%20!%27%25HTTP%2F1.1%22%25!%27%29%20%7C%20parse%20body%20!%27%5C%5B%28%3F%3Cts%3E%5B%5E%5C%5D%5D%2B%29%5C%5D%20%22%28%3F%3Cmethod%3E%5Cw%2B%29%20%28%3F%3Cpath%3E%5CS%2B%29%20HTTP%2F%28%3F%3Cver%3E%5B%5E%22%5D%2B%29%22%20%28%3F%3Cstatus%3E%5Cd%2B%29%5B%5Cs%5CS%5D%2B!%27%20%7C%20stats%20count%28%29%20as%20cnt%20by%20method%2C%20path%20%7C%20sort%20-%20cnt')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

## Extended examples

### Extract partition names from Kafka broker logs

Parse the Kafka broker log body format to extract the broker ID and partition name:

```sql
source=logs-otel-v1*
| where `resource.attributes.service.name` = 'kafka'
| where like(body, '%Broker%Creating%')
| parse body '\[Broker id=(?<brokerId>\d+)\] Creating new partition (?<partition>\S+) [\s\S]+'
| head 20
```

This extracts the broker ID and partition name from Kafka log bodies that follow the `[Broker id=N] Creating new partition ...` pattern.

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%3Dlogs-otel-v1%2A%20%7C%20where%20%60resource.attributes.service.name%60%20%3D%20!%27kafka!%27%20%7C%20where%20like%28body%2C%20!%27%25Broker%25Creating%25!%27%29%20%7C%20parse%20body%20!%27%5C%5BBroker%20id%3D%28%3F%3CbrokerId%3E%5Cd%2B%29%5C%5D%20Creating%20new%20partition%20%28%3F%3Cpartition%3E%5CS%2B%29%20%5B%5Cs%5CS%5D%2B!%27%20%7C%20head%2020')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Extract product IDs from recommendation logs

Parse recommendation log bodies to extract product IDs and count how often each product is recommended:

```sql
source=logs-otel-v1*
| where like(body, '%product:%')
| parse body '(?<action>.+)product: (?<productId>.+)'
| stats count() as cnt by productId
| sort - cnt
```

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%3Dlogs-otel-v1%2A%20%7C%20where%20like%28body%2C%20!%27%25product%3A%25!%27%29%20%7C%20parse%20body%20!%27%28%3F%3Caction%3E.%2B%29product%3A%20%28%3F%3CproductId%3E.%2B%29!%27%20%7C%20stats%20count%28%29%20as%20cnt%20by%20productId%20%7C%20sort%20-%20cnt')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

<Aside type="caution">
Fields created by `parse` cannot be re-parsed by another `parse` command in the same query. Each `parse` must operate on an original source field.
</Aside>

## Limitations

- Fields created by `parse` cannot be parsed again by a subsequent `parse` command.
- Fields created by `parse` cannot be overridden by `eval`.
- The source text field used by `parse` cannot be overridden and still produce correct results.
- The pattern must match the entire string. Use `[\s\S]+` at the end to consume remaining content including trailing newlines.
- Parsed fields cannot be filtered or sorted after they are used in a `stats` command.

## See also

- [grok](/docs/ppl/commands/grok/) -- extract fields using predefined grok patterns instead of raw regex
- [rex](/docs/ppl/commands/rex/) -- more powerful regex extraction with sed mode and multiple matches
- [patterns](/docs/ppl/commands/patterns/) -- automatically discover log patterns without writing regex
- [PPL Functions Reference](/docs/ppl/functions/) -- `regexp_match` and other string functions for regex filtering
