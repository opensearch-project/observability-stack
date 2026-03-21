---
name: correlation
description: Cross-signal correlation between traces, logs, and metrics using OTel semantic convention fields for end-to-end observability investigations.
allowed-tools:
  - Bash
  - curl
---

# Cross-Signal Correlation

## Overview

This skill teaches how to correlate traces, logs, and metrics across all three telemetry signals using shared OTel semantic convention fields. Correlation enables end-to-end investigations: start from a metric spike, trace it to a specific request, and find the associated logs — or start from an error log and reconstruct the full trace that produced it.

All OpenSearch queries use the PPL API at `/_plugins/_ppl` with HTTPS and basic authentication. Prometheus queries use the HTTP API at `localhost:9090`. Credentials are read from the `.env` file (default: `admin` / `My_password_123!@#`).

## OTel Correlation Fields Reference

### Trace Context Correlation

Traces and logs share `traceId` and `spanId` fields. When an application emits a log within an active span, the OTel SDK automatically injects the current trace context into the log record. This creates a direct link between log entries and the spans that produced them.

| Field | Signal | Type | Description |
|---|---|---|---|
| `traceId` | Traces, Logs | keyword | Hex-encoded 128-bit trace identifier shared between spans and log records |
| `spanId` | Traces, Logs | keyword | Hex-encoded 64-bit span identifier shared between spans and log records |
| `traceFlags` | Logs | integer | W3C trace flags (e.g., 01 = sampled) carried on log records |

- In the Trace_Index (`otel-v1-apm-span-*`): `traceId` and `spanId` identify each span
- In the Log_Index (`otel-v1-apm-log-*`): `traceId` and `spanId` link the log to the span that was active when the log was emitted

### Metric-to-Trace Correlation (Prometheus Exemplars)

Prometheus exemplars attach trace context to individual metric samples. When the OTel SDK records a metric observation inside an active span, it can attach the `trace_id` and `span_id` as exemplar labels. This links a specific metric data point back to the trace that produced it.

Exemplar data model:

| Field | Description |
|---|---|
| `trace_id` | Hex-encoded trace identifier from the span active during metric recording |
| `span_id` | Hex-encoded span identifier from the span active during metric recording |
| `filtered_attributes` | Additional key-value pairs attached to the exemplar |
| `timestamp` | Time when the exemplar was recorded |
| `value` | The metric sample value associated with this exemplar |

### Resource-Level Correlation

All three signals (traces, logs, metrics) share resource attributes that identify the originating service. These attributes are set by the OTel SDK and propagated through the pipeline:

| Resource Attribute | Traces/Logs Field | Prometheus Label | Description |
|---|---|---|---|
| `service.name` | `serviceName` | `service_name` | Service that produced the telemetry |
| `service.namespace` | `resource.service.namespace` | `service_namespace` | Namespace grouping related services |
| `service.version` | `resource.service.version` | `service_version` | Service version string |
| `service.instance.id` | `resource.service.instance.id` | `service_instance_id` | Unique instance identifier |
| `deployment.environment.name` | `resource.deployment.environment.name` | `deployment_environment_name` | Deployment environment (e.g., production, staging) |

The OTel Collector's `resourcedetection` processor enriches telemetry with environment context, and the Prometheus `promote_resource_attributes` configuration (in `docker-compose/prometheus/prometheus.yml`) promotes these resource attributes to metric labels so they are queryable in PromQL.

### GenAI Resource Attributes in Prometheus

The following GenAI resource attributes are promoted to Prometheus metric labels via the `promote_resource_attributes` configuration, enabling metric queries filtered by agent or model:

| Resource Attribute | Prometheus Label | Description |
|---|---|---|
| `gen_ai.agent.id` | `gen_ai_agent_id` | Agent identifier |
| `gen_ai.agent.name` | `gen_ai_agent_name` | Human-readable agent name |
| `gen_ai.provider.name` | `gen_ai_provider_name` | LLM provider (e.g., bedrock, openai) |
| `gen_ai.request.model` | `gen_ai_request_model` | Model requested for the operation |
| `gen_ai.response.model` | `gen_ai_response_model` | Model that actually served the response |


## Trace-to-Log Correlation (PPL)

### Find Logs by traceId

Given a trace ID, find all log entries emitted during that trace:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where traceId = '\''<TRACE_ID>'\'' | fields traceId, spanId, severityText, body, serviceName, `@timestamp` | sort `@timestamp`"}'
```

### Find Logs by spanId

Given a span ID, find all log entries emitted during that specific span:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where spanId = '\''<SPAN_ID>'\'' | fields traceId, spanId, severityText, body, serviceName, `@timestamp` | sort `@timestamp`"}'
```

### Join Spans and Logs by traceId

Use PPL `join` to combine trace spans with their correlated logs in a single query:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID>'\'' | join left=s right=l ON s.traceId = l.traceId otel-v1-apm-log-* | fields s.spanId, s.name, s.serviceName, s.durationInNanos, l.severityText, l.body, l.`@timestamp`"}'
```

### Full Timeline Reconstruction

Reconstruct the complete request timeline by interleaving spans and logs sorted by timestamp. Run both queries and merge results by time:

Step 1 — Get all spans for the trace:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID>'\'' | eval signal = '\''span'\'' | fields traceId, spanId, serviceName, name, startTime, endTime, durationInNanos, `status.code`, signal | sort startTime"}'
```

Step 2 — Get all logs for the trace:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where traceId = '\''<TRACE_ID>'\'' | eval signal = '\''log'\'' | fields traceId, spanId, serviceName, severityText, body, `@timestamp`, signal | sort `@timestamp`"}'
```

Merge both result sets by timestamp to see the full chronological sequence of spans and log entries for the request.


## Log-to-Trace Correlation (PPL)

### Find Originating Trace from an Error Log

When you find an error log, extract its `traceId` and query the Trace_Index to reconstruct the full trace:

Step 1 — Find error logs and get their traceId:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where severityText = '\''ERROR'\'' | fields traceId, spanId, severityText, body, serviceName, `@timestamp` | sort - `@timestamp` | head 10"}'
```

Step 2 — Query the Trace_Index with the extracted traceId to get all spans:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID_FROM_LOG>'\'' | fields traceId, spanId, parentSpanId, serviceName, name, startTime, endTime, durationInNanos, `status.code` | sort startTime"}'
```

### Find Specific Span from a Log Entry

When a log entry has a `spanId`, query the Trace_Index to find the exact span that was active when the log was emitted:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where spanId = '\''<SPAN_ID_FROM_LOG>'\'' | fields traceId, spanId, parentSpanId, serviceName, name, startTime, endTime, durationInNanos, `status.code`, `attributes.gen_ai.operation.name`"}'
```


## Metric-to-Trace Correlation (Prometheus Exemplars)

### Query Exemplars from Prometheus

Use the Prometheus exemplars API to retrieve trace context attached to metric samples. This links a metric observation back to the specific trace that produced it:

```bash
curl -s 'http://localhost:9090/api/v1/query_exemplars' \
  --data-urlencode 'query=http_server_duration_seconds_bucket' \
  --data-urlencode 'start=2024-01-01T00:00:00Z' \
  --data-urlencode 'end=2024-01-02T00:00:00Z'
```

The response contains exemplar objects with `trace_id` and `span_id` in the `labels` field:

```json
{
  "status": "success",
  "data": [
    {
      "seriesLabels": { "service_name": "my-agent", "__name__": "http_server_duration_seconds_bucket" },
      "exemplars": [
        {
          "labels": { "trace_id": "abc123...", "span_id": "def456..." },
          "value": "0.25",
          "timestamp": 1704067200.000
        }
      ]
    }
  ]
}
```

### Query Exemplars for GenAI Metrics

Query exemplars for GenAI operation duration, filtered by agent name:

```bash
curl -s 'http://localhost:9090/api/v1/query_exemplars' \
  --data-urlencode 'query=gen_ai_client_operation_duration_bucket{gen_ai_agent_name="my-agent"}' \
  --data-urlencode 'start=2024-01-01T00:00:00Z' \
  --data-urlencode 'end=2024-01-02T00:00:00Z'
```

### Extract trace_id and Query Trace_Index

After extracting a `trace_id` from an exemplar response, query the Trace_Index for the full trace:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID_FROM_EXEMPLAR>'\'' | fields traceId, spanId, parentSpanId, serviceName, name, startTime, endTime, durationInNanos, `status.code` | sort startTime"}'
```

### PromQL Queries with GenAI Resource Labels

Filter metrics by GenAI resource labels before correlating to traces via exemplars:

By agent name:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=rate(gen_ai_client_operation_duration_count{gen_ai_agent_name="my-agent"}[5m])'
```

By model:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=rate(gen_ai_client_token_usage_count{gen_ai_request_model="anthropic.claude-v3"}[5m])'
```

Then query exemplars for the filtered metric to get trace IDs for correlation.


## Resource-Level Correlation

### service.name Across All Signals

The `service.name` resource attribute is the primary key for correlating telemetry across all three signals at the service level.

Find all traces from a specific service:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where serviceName = '\''my-service'\'' | stats count() as span_count, avg(durationInNanos) as avg_duration by serviceName"}'
```

Find all logs from the same service:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where serviceName = '\''my-service'\'' | stats count() by severityText"}'
```

Find all metrics from the same service in Prometheus:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=rate(http_server_duration_seconds_count{service_name="my-service"}[5m])'
```

### GenAI Resource Labels in Prometheus

Query metrics filtered by GenAI resource attributes that are promoted to Prometheus labels:

By agent:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(gen_ai_client_operation_duration_count{gen_ai_agent_name="my-agent"}[5m])) by (gen_ai_agent_name)'
```

By provider and model:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(gen_ai_client_token_usage_count[5m])) by (gen_ai_provider_name, gen_ai_request_model)'
```

### How Resource Attributes Flow Through the Stack

1. The OTel SDK sets resource attributes (`service.name`, `service.version`, etc.) on all telemetry
2. The OTel Collector's `resourcedetection` processor enriches telemetry with environment context (Docker, system info)
3. For traces and logs: resource attributes are stored in OpenSearch as part of the document
4. For metrics: the Prometheus `promote_resource_attributes` configuration (in `docker-compose/prometheus/prometheus.yml`) promotes resource attributes to metric labels, making them queryable in PromQL

This ensures the same `service.name` value appears in traces (`serviceName` field), logs (`serviceName` field), and metrics (`service_name` label) — enabling service-level correlation across all backends.


## Correlation Workflows

### Workflow 1: Metric Spike Investigation

Investigate a metric anomaly by correlating from metrics → traces → logs.

**Step 1 — Detect the spike via PromQL:**

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=rate(http_server_duration_seconds_count[5m])'
```

Look for services with unusually high request rates or latency.

**Step 2 — Query exemplars to get trace IDs from the spike window:**

```bash
curl -s 'http://localhost:9090/api/v1/query_exemplars' \
  --data-urlencode 'query=http_server_duration_seconds_bucket' \
  --data-urlencode 'start=<SPIKE_START>' \
  --data-urlencode 'end=<SPIKE_END>'
```

Extract `trace_id` values from the exemplar response.

**Step 3 — Query the Trace_Index for those traces:**

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID_FROM_EXEMPLAR>'\'' | fields traceId, spanId, parentSpanId, serviceName, name, startTime, endTime, durationInNanos, `status.code` | sort startTime"}'
```

**Step 4 — Query the Log_Index for correlated logs:**

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where traceId = '\''<TRACE_ID_FROM_EXEMPLAR>'\'' | fields traceId, spanId, severityText, body, serviceName, `@timestamp` | sort `@timestamp`"}'
```

### Workflow 2: Error Log Investigation

Start from an error log and trace back to the root cause.

**Step 1 — Find error logs:**

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where severityText = '\''ERROR'\'' | fields traceId, spanId, severityText, body, serviceName, `@timestamp` | sort - `@timestamp` | head 10"}'
```

**Step 2 — Extract the traceId from the error log and reconstruct the full trace tree:**

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID_FROM_ERROR_LOG>'\'' | fields traceId, spanId, parentSpanId, serviceName, name, startTime, endTime, durationInNanos, `status.code` | sort startTime"}'
```

**Step 3 — Identify the root cause span (look for error status or exceptions):**

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID_FROM_ERROR_LOG>'\'' AND `status.code` = 2 | fields traceId, spanId, serviceName, name, `events.attributes.exception.type`, `events.attributes.exception.message` | sort startTime"}'
```

**Step 4 — Get all logs for the error span to see the full context:**

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where traceId = '\''<TRACE_ID_FROM_ERROR_LOG>'\'' | fields traceId, spanId, severityText, body, `@timestamp` | sort `@timestamp`"}'
```

### Workflow 3: Slow Agent Investigation

Investigate a slow agent invocation by correlating spans, child operations, logs, and metrics.

**Step 1 — Find slow `invoke_agent` spans:**

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''invoke_agent'\'' AND durationInNanos > 5000000000 | fields traceId, spanId, `attributes.gen_ai.agent.name`, durationInNanos, startTime | sort - durationInNanos | head 10"}'
```

**Step 2 — Get all child spans to identify the bottleneck:**

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID>'\'' | fields traceId, spanId, parentSpanId, name, `attributes.gen_ai.operation.name`, durationInNanos, startTime | sort startTime"}'
```

Look for child spans with high `durationInNanos` — these are the bottleneck operations (e.g., slow tool calls, slow LLM responses).

**Step 3 — Check tool calls within the slow trace:**

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID>'\'' AND `attributes.gen_ai.operation.name` = '\''execute_tool'\'' | fields spanId, `attributes.gen_ai.tool.name`, `attributes.gen_ai.tool.call.arguments`, durationInNanos | sort - durationInNanos"}'
```

**Step 4 — Get correlated logs for the slow spans:**

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | where traceId = '\''<TRACE_ID>'\'' | fields spanId, severityText, body, `@timestamp` | sort `@timestamp`"}'
```

**Step 5 — Check GenAI token usage metrics for the agent via PromQL:**

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(gen_ai_client_token_usage_count{gen_ai_agent_name="<AGENT_NAME>"}[5m])) by (gen_ai_agent_name, gen_ai_request_model)'
```

Check if the agent is consuming unusually high token counts, which may explain slow response times.


## AWS Managed Service Variants

### Amazon OpenSearch Service (SigV4)

Replace the local OpenSearch endpoint and authentication with AWS SigV4 for all PPL queries in this skill:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:es" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -X POST https://DOMAIN-ID.REGION.es.amazonaws.com/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID>'\'' | fields traceId, spanId, parentSpanId, serviceName, name, startTime, endTime, durationInNanos, `status.code` | sort startTime"}'
```

- Endpoint format: `https://DOMAIN-ID.REGION.es.amazonaws.com`
- Auth: `--aws-sigv4 "aws:amz:REGION:es"` with `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"`
- The PPL API endpoint (`/_plugins/_ppl`) and query syntax are identical to the local stack
- No `-k` flag needed — AWS managed endpoints use valid TLS certificates

### Amazon Managed Service for Prometheus (AMP) (SigV4)

Replace the local Prometheus endpoint and authentication with AWS SigV4 for all PromQL and exemplar queries:

Query exemplars:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:aps" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  'https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query_exemplars' \
  --data-urlencode 'query=http_server_duration_seconds_bucket' \
  --data-urlencode 'start=2024-01-01T00:00:00Z' \
  --data-urlencode 'end=2024-01-02T00:00:00Z'
```

Query metrics:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:aps" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  'https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query' \
  --data-urlencode 'query=rate(http_server_duration_seconds_count{service_name="my-service"}[5m])'
```

- Endpoint format: `https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query`
- Auth: `--aws-sigv4 "aws:amz:REGION:aps"` with `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"`
- PromQL query syntax and exemplar API are identical to local Prometheus; only the endpoint and authentication differ
