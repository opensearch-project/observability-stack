---
name: traces
description: Query and investigate trace data from OpenSearch using PPL for agent invocations, tool executions, errors, latency, and token usage analysis.
allowed-tools:
  - Bash
  - curl
---

# Trace Querying with PPL

## Overview

This skill provides PPL (Piped Processing Language) query templates for investigating trace data stored in OpenSearch. Traces are stored in the `otel-v1-apm-span-*` index pattern and service dependency maps in `otel-v2-apm-service-map`. All queries use the OpenSearch PPL API at `/_plugins/_ppl` with HTTPS and basic authentication.

Credentials are read from the `.env` file (default: `admin` / `My_password_123!@#`). All curl commands use `-k` to skip TLS certificate verification for local development.

## Connection Defaults

All commands below use these variables. Set them in your environment or use the defaults:

| Variable | Default | Description |
|---|---|---|
| `OPENSEARCH_ENDPOINT` | `https://localhost:9200` | OpenSearch base URL |
| `OPENSEARCH_USER` | `admin` | OpenSearch username |
| `OPENSEARCH_PASSWORD` | `My_password_123!@#` | OpenSearch password |

## Base Command

All PPL queries in this skill use this curl pattern:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "<PPL_QUERY>"}'
```

The examples below show the full command for clarity, but only the PPL query varies.

## Agent Invocation Spans

Query all spans where a GenAI agent was invoked:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''invoke_agent'\'' | fields traceId, spanId, `attributes.gen_ai.agent.name`, `attributes.gen_ai.request.model`, durationInNanos, startTime | sort - startTime | head 20"}'
```

## Tool Execution Spans

Query all spans where a tool was executed:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''execute_tool'\'' | fields traceId, spanId, `attributes.gen_ai.tool.name`, durationInNanos, startTime | sort - startTime | head 20"}'
```

## Slow Spans

Identify spans exceeding a latency threshold. The default threshold is 5 seconds (5,000,000,000 nanoseconds). Adjust the value as needed:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where durationInNanos > 5000000000 | fields traceId, spanId, serviceName, name, durationInNanos, startTime | sort - durationInNanos | head 20"}'
```

To find slow agent invocations specifically:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''invoke_agent'\'' AND durationInNanos > 5000000000 | fields traceId, `attributes.gen_ai.agent.name`, durationInNanos | sort - durationInNanos"}'
```

## Error Spans

Query spans with error status (`status.code` = 2 means ERROR in OTel):

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `status.code` = 2 | fields traceId, spanId, serviceName, name, `status.code`, startTime | sort - startTime | head 20"}'
```

## Token Usage by Model

Aggregate input and output token usage grouped by the requested model:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.usage.input_tokens` > 0 | stats sum(`attributes.gen_ai.usage.input_tokens`) as total_input, sum(`attributes.gen_ai.usage.output_tokens`) as total_output by `attributes.gen_ai.request.model`"}'
```

## Token Usage by Agent

Aggregate token usage grouped by agent name:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.usage.input_tokens` > 0 | stats sum(`attributes.gen_ai.usage.input_tokens`) as total_input, sum(`attributes.gen_ai.usage.output_tokens`) as total_output by `attributes.gen_ai.agent.name`"}'
```

## Service Operations Listing

List distinct services and their GenAI operation types with counts:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count() by serviceName, `attributes.gen_ai.operation.name`"}'
```

## Service Map Queries

### Service Topology (Node Connections)

Query the service dependency map to explore service-to-service connections. Use `dedup nodeConnectionHash` to get unique connections:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v2-apm-service-map-* | dedup nodeConnectionHash | fields sourceNode, targetNode, sourceOperation, targetOperation"}'
```

### Service Operations from Service Map

List all operations for a specific service from the service map:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v2-apm-service-map-* | dedup operationConnectionHash | fields sourceNode, sourceOperation, targetNode, targetOperation"}'
```

### Dependency Count per Service

Count how many downstream dependencies each service calls:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v2-apm-service-map-* | dedup nodeConnectionHash | stats distinct_count(targetNode) as dependency_count by sourceNode"}'
```

## Remote Service Identification with coalesce()

Different OTel instrumentation libraries use different attributes to identify remote services. Use `coalesce()` to check multiple fields in priority order:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where serviceName = '\''frontend'\'' | where kind = '\''SPAN_KIND_CLIENT'\'' | eval _remoteService = coalesce(`attributes.net.peer.name`, `attributes.server.address`, `attributes.upstream_cluster`, `attributes.rpc.service`, `attributes.peer.service`, `attributes.db.system`, `attributes.gen_ai.system`, `attributes.http.host`, `attributes.messaging.destination.name`, '\'''\'' ) | where _remoteService != '\'''\'' | stats count() as calls by _remoteService | sort - calls"}'
```

**Remote service attribute priority:**

| Field | Used By |
|---|---|
| `attributes.net.peer.name` | Node.js (frontend) |
| `attributes.server.address` | Go, Java, .NET (checkout, cart) |
| `attributes.upstream_cluster` | Envoy/Istio (frontend-proxy) |
| `attributes.rpc.service` | gRPC services (recommendation) |
| `attributes.peer.service` | Older OTel conventions |
| `attributes.db.system` | Database clients (redis, postgresql) |
| `attributes.gen_ai.system` | LLM clients (openai) |
| `attributes.http.host` | HTTP clients |
| `attributes.messaging.destination.name` | Message queues (Kafka, RabbitMQ) |

## Cross-Signal Correlation

### Trace-Log Joins by traceId

Find all logs associated with a specific trace by querying the log index with the same traceId:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=logs-otel-v1-* | where traceId = '\''<TRACE_ID>'\'' | fields traceId, spanId, severityText, body, `resource.attributes.service.name`, `@timestamp` | sort `@timestamp`"}'
```

Join trace spans with correlated logs using PPL join:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID>'\'' | join left=s right=l ON s.traceId = l.traceId logs-otel-v1-* | fields s.spanId, s.name, l.severityText, l.body"}'
```

### Trace Tree Reconstruction

Reconstruct the full trace tree by querying all spans for a traceId, sorted by startTime with parentSpanId for hierarchy:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID>'\'' | fields traceId, spanId, parentSpanId, serviceName, name, startTime, endTime, durationInNanos, `status.code` | sort startTime"}'
```

### Latency Gap Analysis

Compare parent and child span timing to identify latency gaps within a trace. First retrieve all spans, then compare startTime/endTime values between parent and child:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID>'\'' | fields spanId, parentSpanId, name, startTime, endTime, durationInNanos | sort startTime"}'
```

To find spans where the child started significantly after the parent, look for gaps between a parent's startTime and its children's startTime values. Large gaps indicate queuing, scheduling delays, or uninstrumented work.

### Root Span Identification

Find the root span of a trace (where parentSpanId is empty or null):

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where traceId = '\''<TRACE_ID>'\'' AND parentSpanId = '\'''\'' | fields traceId, spanId, serviceName, name, durationInNanos, startTime, endTime"}'
```

Find all root spans (entry points) across all traces:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where parentSpanId = '\'''\'' | fields traceId, spanId, serviceName, name, durationInNanos, startTime | sort - startTime | head 20"}'
```

## GenAI Operation Types

The OpenTelemetry GenAI semantic conventions define the following operation types in `attributes.gen_ai.operation.name`:

| Operation Type | Description |
|---|---|
| `invoke_agent` | An agent invocation — the top-level span for an agent handling a request |
| `execute_tool` | A tool execution within an agent's reasoning loop |
| `chat` | An LLM chat completion call |
| `embeddings` | A text embedding generation call |
| `retrieval` | A retrieval operation (e.g., RAG vector search) |
| `create_agent` | Agent creation/initialization |
| `text_completion` | A text completion call (non-chat) |
| `generate_content` | A generic content generation call |

### Filter by Operation Type

#### invoke_agent

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''invoke_agent'\'' | fields traceId, spanId, `attributes.gen_ai.agent.name`, durationInNanos | sort - startTime | head 20"}'
```

#### execute_tool

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''execute_tool'\'' | fields traceId, spanId, `attributes.gen_ai.tool.name`, durationInNanos | sort - startTime | head 20"}'
```

#### chat

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''chat'\'' | fields traceId, spanId, `attributes.gen_ai.request.model`, `attributes.gen_ai.usage.input_tokens`, `attributes.gen_ai.usage.output_tokens`, durationInNanos | sort - startTime | head 20"}'
```

#### embeddings

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''embeddings'\'' | fields traceId, spanId, `attributes.gen_ai.request.model`, durationInNanos | sort - startTime | head 20"}'
```

#### retrieval

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''retrieval'\'' | fields traceId, spanId, serviceName, name, durationInNanos | sort - startTime | head 20"}'
```

#### create_agent

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''create_agent'\'' | fields traceId, spanId, `attributes.gen_ai.agent.name`, `attributes.gen_ai.agent.id` | sort - startTime | head 20"}'
```

#### text_completion

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''text_completion'\'' | fields traceId, spanId, `attributes.gen_ai.request.model`, durationInNanos | sort - startTime | head 20"}'
```

#### generate_content

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''generate_content'\'' | fields traceId, spanId, `attributes.gen_ai.request.model`, durationInNanos | sort - startTime | head 20"}'
```

## Extended GenAI Attributes

The OTel GenAI semantic conventions provide these extended attributes on trace spans:

| Attribute | Type | Description |
|---|---|---|
| `attributes.gen_ai.agent.id` | keyword | Unique identifier for the agent instance |
| `attributes.gen_ai.agent.name` | keyword | Human-readable agent name |
| `attributes.gen_ai.agent.description` | keyword | Description of the agent's purpose |
| `attributes.gen_ai.agent.version` | keyword | Version of the agent |
| `attributes.gen_ai.conversation.id` | keyword | Identifier for a multi-turn conversation session |
| `attributes.gen_ai.tool.call.id` | keyword | Unique identifier for a specific tool call |
| `attributes.gen_ai.tool.type` | keyword | Type of tool (e.g., function, retrieval) |
| `attributes.gen_ai.tool.call.arguments` | text | JSON-encoded arguments passed to the tool |
| `attributes.gen_ai.tool.call.result` | text | JSON-encoded result returned by the tool |
| `attributes.gen_ai.request.model` | keyword | Model requested for the operation |
| `attributes.gen_ai.usage.input_tokens` | long | Number of input tokens consumed |
| `attributes.gen_ai.usage.output_tokens` | long | Number of output tokens generated |
| `attributes.gen_ai.operation.name` | keyword | Operation type (see GenAI Operation Types above) |

## Exception and Error Querying

### Query Spans with Exceptions

Find spans that contain exception events with type, message, and stacktrace:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `events.attributes.exception.type` != '\'''\'' | fields traceId, spanId, serviceName, name, `events.attributes.exception.type`, `events.attributes.exception.message` | sort - startTime | head 20"}'
```

### Query Exception Stacktraces

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `events.attributes.exception.stacktrace` != '\'''\'' | fields traceId, spanId, `events.attributes.exception.type`, `events.attributes.exception.message`, `events.attributes.exception.stacktrace` | head 10"}'
```

### Query Spans by error.type Attribute

Find spans with a specific error type category:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.error.type` != '\'''\'' | fields traceId, spanId, serviceName, `attributes.error.type`, `status.code` | sort - startTime | head 20"}'
```

### Error Spans with Exception Details

Combine error status with exception information for a complete error view:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `status.code` = 2 | fields traceId, spanId, serviceName, name, `events.attributes.exception.type`, `events.attributes.exception.message`, `attributes.error.type` | sort - startTime | head 20"}'
```

## Conversation Tracking

Track multi-turn conversations by grouping spans with the same conversation ID:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.conversation.id` != '\'''\'' | stats count() as turns, sum(`attributes.gen_ai.usage.input_tokens`) as total_input_tokens, sum(`attributes.gen_ai.usage.output_tokens`) as total_output_tokens by `attributes.gen_ai.conversation.id`"}'
```

View all spans in a specific conversation ordered by time:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.conversation.id` = '\''<CONVERSATION_ID>'\'' | fields traceId, spanId, `attributes.gen_ai.operation.name`, `attributes.gen_ai.agent.name`, startTime, durationInNanos | sort startTime"}'
```

## Tool Call Inspection

Inspect tool call arguments and results for debugging agent behavior:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''execute_tool'\'' | fields traceId, spanId, `attributes.gen_ai.tool.name`, `attributes.gen_ai.tool.call.id`, `attributes.gen_ai.tool.call.arguments`, `attributes.gen_ai.tool.call.result`, durationInNanos | sort - startTime | head 20"}'
```

Inspect tool calls for a specific tool:

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''execute_tool'\'' AND `attributes.gen_ai.tool.name` = '\''<TOOL_NAME>'\'' | fields traceId, `attributes.gen_ai.tool.call.arguments`, `attributes.gen_ai.tool.call.result`, durationInNanos | sort - startTime"}'
```

## PPL Commands for Trace Analysis

The following PPL commands are particularly useful when analyzing trace data:

| Command | Use Case |
|---|---|
| `stats` | Aggregate token usage, count spans by service, compute latency percentiles |
| `where` | Filter spans by operation type, status code, duration threshold, attribute values |
| `fields` | Select specific fields to return (traceId, spanId, attributes, etc.) |
| `sort` | Order results by startTime, durationInNanos, or other fields |
| `dedup` | Remove duplicate spans (e.g., deduplicate by traceId to get unique traces) |
| `top` | Find the most frequent values (e.g., top services, top error types) |
| `rare` | Find the least frequent values (e.g., rare operation types, rare error messages) |
| `timechart` | Visualize span counts or latency over time buckets |
| `eval` | Compute derived fields (e.g., convert nanoseconds to milliseconds) |
| `head` | Limit result count for quick exploration |
| `rename` | Rename fields for readability in output |
| `eventstats` | Add aggregation results as new fields to each row without collapsing rows |
| `trendline` | Calculate moving averages on latency or token usage over time |
| `streamstats` | Compute running statistics (e.g., cumulative token count) |
| `ad` | Anomaly detection on latency — identify spans with unusual duration patterns |

## Trace Index Field Reference

Key fields available in the `otel-v1-apm-span-*` index:

| Field | Type | Description |
|---|---|---|
| `traceId` | keyword | Unique 128-bit trace identifier |
| `spanId` | keyword | Unique 64-bit span identifier |
| `parentSpanId` | keyword | Parent span ID (empty string for root spans) |
| `serviceName` | keyword | Service that produced the span |
| `name` | text | Span operation name |
| `kind` | keyword | Span kind (SERVER, CLIENT, INTERNAL, PRODUCER, CONSUMER) |
| `startTime` | date | Span start timestamp |
| `endTime` | date | Span end timestamp |
| `durationInNanos` | long | Span duration in nanoseconds |
| `status.code` | integer | Status code: 0=Unset, 1=Ok, 2=Error |
| `attributes.gen_ai.operation.name` | keyword | GenAI operation type |
| `attributes.gen_ai.agent.name` | keyword | Agent name |
| `attributes.gen_ai.agent.id` | keyword | Agent identifier |
| `attributes.gen_ai.agent.description` | keyword | Agent description |
| `attributes.gen_ai.agent.version` | keyword | Agent version |
| `attributes.gen_ai.request.model` | keyword | Requested model |
| `attributes.gen_ai.usage.input_tokens` | long | Input token count |
| `attributes.gen_ai.usage.output_tokens` | long | Output token count |
| `attributes.gen_ai.conversation.id` | keyword | Conversation identifier |
| `attributes.gen_ai.tool.name` | keyword | Tool name |
| `attributes.gen_ai.tool.call.id` | keyword | Tool call identifier |
| `attributes.gen_ai.tool.type` | keyword | Tool type |
| `attributes.gen_ai.tool.call.arguments` | text | Tool call arguments (JSON) |
| `attributes.gen_ai.tool.call.result` | text | Tool call result (JSON) |
| `attributes.error.type` | keyword | Error type category |
| `events.attributes.exception.type` | keyword | Exception class/type |
| `events.attributes.exception.message` | text | Exception message |
| `events.attributes.exception.stacktrace` | text | Exception stacktrace |

## References

- [PPL Language Reference](https://github.com/opensearch-project/sql/blob/main/docs/user/ppl/index.md) — Official PPL syntax documentation. Fetch this if queries fail due to OpenSearch version differences or new syntax.
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — Standard attribute names for AI/LLM operations.

## AWS Managed OpenSearch

To query traces on Amazon OpenSearch Service, replace the local endpoint and authentication with AWS SigV4:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:es" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -X POST https://DOMAIN-ID.REGION.es.amazonaws.com/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | where `attributes.gen_ai.operation.name` = '\''invoke_agent'\'' | fields traceId, spanId, `attributes.gen_ai.agent.name`, durationInNanos | sort - startTime | head 20"}'
```

- Endpoint format: `https://DOMAIN-ID.REGION.es.amazonaws.com`
- Auth: `--aws-sigv4 "aws:amz:REGION:es"` with `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"`
- The PPL API endpoint (`/_plugins/_ppl`) and query syntax are identical to the local stack
- No `-k` flag needed — AWS managed endpoints use valid TLS certificates
