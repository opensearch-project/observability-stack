---
title: "grok"
description: "Extract fields using grok patterns - a higher-level alternative to regex with 200+ predefined patterns."
---

import { Aside } from '@astrojs/starlight/components';

The `grok` command parses a text field using grok pattern syntax and appends the extracted fields to the search results. Grok provides over 200 predefined patterns (`%{IP}`, `%{NUMBER}`, `%{HOSTNAME}`, etc.) that wrap common regular expressions, making extraction more readable and less error-prone than writing raw regex.

<Aside type="note">
**Stable** since OpenSearch 2.4.
</Aside>

## Syntax

```sql
grok <field> <grok-pattern>
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<field>` | Yes | The text field to parse. |
| `<grok-pattern>` | Yes | A grok pattern using `%{PATTERN:fieldname}` syntax. Each `%{PATTERN:fieldname}` creates a new string field. If a field with the same name already exists, it is overwritten. Raw regex can be mixed with grok patterns. |

## Usage notes

- Grok patterns are built on top of regular expressions but provide a more readable, reusable syntax.
- Use the `%{PATTERN:fieldname}` syntax to extract a named field. If you omit `:fieldname`, the match is consumed but no field is created.
- When parsing a null field, the result is an empty string.
- Grok shares the same [limitations](/docs/ppl/commands/parse/#limitations) as the `parse` command.

### Commonly used grok patterns

| Pattern | Matches | Example |
|---------|---------|---------|
| `%{IP:ip}` | IPv4 or IPv6 address | `192.168.1.1` |
| `%{NUMBER:num}` | Integer or floating-point number | `42`, `3.14` |
| `%{WORD:word}` | Single word (no whitespace) | `ERROR` |
| `%{HOSTNAME:host}` | Hostname or FQDN | `api.example.com` |
| `%{GREEDYDATA:msg}` | Everything (greedy match) | any remaining text |
| `%{HTTPDATE:ts}` | Common log format timestamp | `28/Sep/2022:10:15:57 -0700` |
| `%{IPORHOST:server}` | IP address or hostname | `10.0.0.1` or `web01` |
| `%{SYSLOGLINE}` | Syslog format line | standard syslog entry |
| `%{URI:url}` | Full URI | `https://example.com/path?q=1` |
| `%{URIPATH:path}` | URI path component | `/api/v1/agents` |
| `%{POSINT:code}` | Positive integer | `200`, `404` |
| `%{DATA:val}` | Non-greedy match (minimal) | short text segments |

## Basic examples

### Extract client IP and status code from log bodies

Use the `%{IP}` and `%{POSINT}` patterns to capture the client address and HTTP response code:

```sql
source = logs-otel-v1*
| grok body '%{IP:clientip} .* %{POSINT:status}'
| fields body, clientip, status
```

| body | clientip | status |
|------|----------|--------|
| 10.0.1.55 - - [27/Mar/2026:10:15:32 +0000] "GET /api/v1/agents HTTP/1.1" 200 1234 | 10.0.1.55 | 200 |
| 192.168.1.10 - - [27/Mar/2026:10:15:33 +0000] "POST /api/v1/invoke HTTP/1.1" 404 567 | 192.168.1.10 | 404 |
| 172.16.0.42 - - [27/Mar/2026:10:15:34 +0000] "GET /health HTTP/1.1" 500 89 | 172.16.0.42 | 500 |

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1*%20%7C%20grok%20body%20!%27%25%7BIP%3Aclientip%7D%20.*%20%25%7BPOSINT%3Astatus%7D!%27%20%7C%20fields%20body%2C%20clientip%2C%20status')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Override an existing field

Strip the timestamp prefix from a log body, keeping only the message content:

```sql
source = logs-otel-v1*
| grok body '%{TIMESTAMP_ISO8601} %{GREEDYDATA:body}'
| fields body
```

| body |
|------|
| Connection refused to upstream service |
| Agent invocation completed in 245ms |
| Request processed successfully |
| Timeout waiting for response from model provider |

### Parse HTTP access log lines from log bodies

Use multiple grok patterns to extract structured fields from HTTP access log entries in log bodies:

```sql
source = logs-otel-v1*
| grok body '%{IP:clientip} %{DATA} %{DATA} \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{URIPATH:path} HTTP/%{NUMBER:version}" %{POSINT:status} %{NUMBER:bytes}'
| fields timestamp, method, path, status, bytes
```

| timestamp | method | path | status | bytes |
|-----------|--------|------|--------|-------|
| 27/Mar/2026:10:15:57 -0700 | GET | /api/v1/agents | 404 | 19927 |
| 27/Mar/2026:10:15:57 -0700 | POST | /api/v1/invoke | 200 | 28722 |
| 27/Mar/2026:10:15:57 -0700 | GET | /health | 401 | 27439 |
| 27/Mar/2026:10:15:57 -0700 | DELETE | /api/v1/sessions | 301 | 9481 |

### Extract IP address and response code with aggregation

Combine multiple grok patterns to parse log formats and aggregate results:

```sql
source = logs-otel-v1*
| grok body '%{IP:clientip} .* %{POSINT:status} %{NUMBER:bytes}'
| stats count() as requests, sum(cast(bytes as long)) as total_bytes by status
| sort - requests
```

### Extract duration and service info from structured logs

Mix grok patterns with literal text to parse structured log output:

```sql
source = logs-otel-v1*
| grok body 'duration=%{NUMBER:duration}ms service=%{HOSTNAME:service}'
| where cast(duration as int) > 500
| fields duration, service
```

| duration | service |
|----------|---------|
| 671 | agent-orchestrator |
| 789 | model-gateway |
| 880 | tool-executor |

## Extended examples

### Parse OTel log bodies with grok

OpenTelemetry log bodies often contain structured text that grok can parse more readably than raw regex:

```sql
source = logs-otel-v1*
| grok body '%{WORD:level} %{GREEDYDATA:detail}'
| where isnotnull(level)
| stats count() as occurrences by level
| sort - occurrences
```

This extracts the first word from each log body as the log level, then counts occurrences per level.

<a href="https://observability.playground.opensearch.org/w/19jD-R/app/explore/logs/#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-6h,to:now))&_q=(dataset:(id:d1f424b0-2655-11f1-8baa-d5b726b04d73,timeFieldName:time,title:'logs-otel-v1*',type:INDEX_PATTERN),language:PPL,query:'source%20%3D%20logs-otel-v1*%20%7C%20grok%20body%20!%27%25%7BWORD%3Alevel%7D%20%25%7BGREEDYDATA%3Adetail%7D!%27%20%7C%20where%20isnotnull(level)%20%7C%20stats%20count()%20as%20occurrences%20by%20level%20%7C%20sort%20-%20occurrences')&_a=(legacy:(columns:!(body,severityText,resource.attributes.service.name),interval:auto,isDirty:!f,sort:!()),tab:(logs:(),patterns:(usingRegexPatterns:!f)),ui:(activeTabId:logs,showHistogram:!t))" target="_blank" rel="noopener">Try in playground &rarr;</a>

### Extract IP addresses and paths from OTel HTTP logs

Parse HTTP access patterns from log bodies that contain request information:

```sql
source = logs-otel-v1*
| grok body '%{IP:clientip}.*"%{WORD:method} %{URIPATH:path} HTTP/%{NUMBER:version}" %{POSINT:status}'
| where isnotnull(clientip)
| stats count() as requests by method, status
| sort - requests
```

<Aside type="tip">
When grok patterns become very long, consider whether `parse` with a targeted regex might be simpler. Grok excels at parsing well-known formats (HTTP access logs, syslog, etc.); for ad-hoc extraction of one or two fields, `parse` or `rex` may be more concise.
</Aside>

## See also

- [parse](/docs/ppl/commands/parse/) -- extract fields using raw Java regex (more control, less readability)
- [rex](/docs/ppl/commands/rex/) -- regex extraction with sed-mode text replacement and multiple matches
- [patterns](/docs/ppl/commands/patterns/) -- automatically discover log patterns without writing any patterns
