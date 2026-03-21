---
name: logs
description: Query and search log data from OpenSearch using PPL for severity filtering, trace correlation, error patterns, and log volume analysis.
allowed-tools:
  - Bash
  - curl
---

# Log Querying with PPL

## Overview

This skill provides PPL (Piped Processing Language) query templates for searching and analyzing log data stored in OpenSearch. Logs are stored in the `otel-v1-apm-log-*` index pattern. All queries use the OpenSearch PPL API at `/_plugins/_ppl` with HTTPS and basic authentication.

Credentials are read from the `.env` file (default: `admin` / `My_password_123!@#`). All curl commands use `-k` to skip TLS certificate verification for local development.

## Log Index Key Fields

Key fields available in the `otel-v1-apm-log-*` index:

| Field | Type | Description |
|---|---|---|
| `severityText` | keyword | Log level string (ERROR, WARN, INFO, DEBUG) |
| `severityNumber` | integer | Numeric severity (1–24, higher = more severe; ERROR=17, WARN=13, INFO=9, DEBUG=5) |
| `traceId` | keyword | Correlated trace identifier (links log to a distributed trace) |
| `spanId` | keyword | Correlated span identifier (links log to a specific span within a trace) |
| `serviceName` | keyword | Service that produced the log entry |
| `body` | text | Log message body content |
| `@timestamp` | date | Log entry timestamp |

## Severity Filtering

### ERROR Logs

Query all error-level logs:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where severityText = '\''ERROR'\'' | fields traceId, spanId, serviceName, body, `@timestamp` | sort - `@timestamp` | head 20"}'
```

### WARN Logs

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where severityText = '\''WARN'\'' | fields traceId, spanId, serviceName, body, `@timestamp` | sort - `@timestamp` | head 20"}'
```

### INFO Logs

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where severityText = '\''INFO'\'' | fields traceId, spanId, serviceName, body, `@timestamp` | sort - `@timestamp` | head 20"}'
```

### Filter by Severity Number

Use `severityNumber` for numeric comparisons. For example, find all logs at WARN level or above (severityNumber >= 13):

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where severityNumber >= 13 | fields severityText, severityNumber, serviceName, body, `@timestamp` | sort - `@timestamp` | head 20"}'
```

## Trace Correlation by traceId

Find all logs associated with a specific trace:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where traceId = '\''<TRACE_ID>'\'' | fields traceId, spanId, severityText, body, serviceName, `@timestamp` | sort `@timestamp`"}'
```

Find error logs for a specific trace:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where traceId = '\''<TRACE_ID>'\'' AND severityText = '\''ERROR'\'' | fields spanId, severityText, body, serviceName, `@timestamp` | sort `@timestamp`"}'
```

## Error Patterns

### Error Count by Severity and Service

Identify error patterns by aggregating log counts grouped by severity level and service name:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | stats count() by severityText, serviceName"}'
```

### Error Count by Service Only

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where severityText = '\''ERROR'\'' | stats count() as error_count by serviceName | sort - error_count"}'
```

## Log Volume Over Time

### Hourly Log Volume

Analyze log volume over time using `stats count() by span(@timestamp, 1h)`:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | stats count() as log_count by span(`@timestamp`, 1h)"}'
```

### Configurable Interval

Change the interval to suit your analysis. Common intervals: `5m`, `15m`, `1h`, `1d`.

15-minute buckets:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | stats count() as log_count by span(`@timestamp`, 15m)"}'
```

### Error Volume Over Time

Track error log volume specifically:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where severityText = '\''ERROR'\'' | stats count() as error_count by span(`@timestamp`, 1h), serviceName"}'
```

## Body Content Search

### String Matching

Search log body content for a specific string using `where` with `like`:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where body like '\''%timeout%'\'' | fields traceId, spanId, severityText, body, serviceName, `@timestamp` | sort - `@timestamp` | head 20"}'
```

### Relevance Search with match

Use the `match` relevance function for full-text search on the body field:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where match(body, '\''connection refused'\'') | fields traceId, spanId, severityText, body, serviceName, `@timestamp` | sort - `@timestamp` | head 20"}'
```

### Relevance Search with match_phrase

Use `match_phrase` for exact phrase matching in the body:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where match_phrase(body, '\''failed to connect'\'') | fields traceId, spanId, severityText, body, serviceName, `@timestamp` | sort - `@timestamp` | head 20"}'
```

## Cross-Signal Correlation

### Log-to-Span Correlation by spanId

Find all logs associated with a specific span to understand what happened during that operation:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where spanId = '\''<SPAN_ID>'\'' | fields traceId, spanId, severityText, body, serviceName, `@timestamp` | sort `@timestamp`"}'
```

### Exception-Log Correlation with Traces

Find error logs and their associated trace spans. First, find error logs with traceId:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where severityText = '\''ERROR'\'' AND traceId != '\'''\'' | fields traceId, spanId, body, serviceName, `@timestamp` | sort - `@timestamp` | head 20"}'
```

Then query the trace index for the corresponding spans using the traceId from the error log:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID>'\'' | fields traceId, spanId, serviceName, name, `status.code`, durationInNanos, startTime | sort startTime"}'
```

Correlate exception spans with their associated error logs using shared traceId and spanId:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where traceId = '\''<TRACE_ID>'\'' AND spanId = '\''<SPAN_ID>'\'' AND severityText = '\''ERROR'\'' | fields body, severityText, `@timestamp`"}'
```

## PPL Commands for Log Analysis

The following PPL commands are particularly useful when analyzing log data:

| Command | Use Case |
|---|---|
| `stats` | Aggregate log counts by severity, service, or time bucket |
| `where` | Filter logs by severity level, traceId, spanId, service, or body content |
| `fields` | Select specific fields to return (body, severityText, traceId, etc.) |
| `sort` | Order results by timestamp or severity |
| `head` | Limit result count for quick exploration |
| `grok` | Extract structured fields from unstructured log body text using grok patterns |
| `parse` | Parse log body content using regex patterns to extract fields |
| `rex` | Extract fields from text using named capture groups |
| `patterns` | Discover common log message patterns automatically |
| `rare` | Find the least frequent log messages or error types |
| `top` | Find the most frequent log messages, services, or severity levels |
| `timechart` | Visualize log volume or error counts over time buckets |
| `eval` | Compute derived fields (e.g., classify severity ranges) |
| `dedup` | Remove duplicate log entries (e.g., deduplicate by body to find unique messages) |
| `fillnull` | Replace null field values with defaults for cleaner output |
| `regex` | Filter logs using regular expression patterns on field values |

## AWS Managed OpenSearch

To query logs on Amazon OpenSearch Service, replace the local endpoint and authentication with AWS SigV4:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:es" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -X POST https://DOMAIN-ID.REGION.es.amazonaws.com/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where severityText = '\''ERROR'\'' | fields traceId, spanId, serviceName, body, `@timestamp` | sort - `@timestamp` | head 20"}'
```

- Endpoint format: `https://DOMAIN-ID.REGION.es.amazonaws.com`
- Auth: `--aws-sigv4 "aws:amz:REGION:es"` with `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"`
- The PPL API endpoint (`/_plugins/_ppl`) and query syntax are identical to the local stack
- No `-k` flag needed — AWS managed endpoints use valid TLS certificates
