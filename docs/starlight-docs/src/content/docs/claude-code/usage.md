---
title: Usage Guide
description: Sample questions and real-world workflows for each observability skill
---

This guide shows how to use the Claude Code Observability Plugin through natural language. Each section demonstrates a skill with sample questions and what Claude does behind the scenes.

## Traces

Query distributed trace data to understand how requests flow through services and AI agents.

### Sample questions

**Service overview:**
- "Which services have the most trace spans?"
- "How many distinct operations does each service have?"

**GenAI agent analysis:**
- "How many times was each AI agent invoked?"
- "What is the average response time for the Travel Planner agent?"
- "Show me token usage by model - which model consumes the most tokens?"
- "Find the slowest agent invocations in the last hour"

**Error investigation:**
- "Show me all error spans from the checkout service"
- "Which services have the most errors?"
- "Find failed tool executions - what tools are failing?"

**Latency analysis:**
- "Find all spans taking longer than 5 seconds"
- "What is the p95 duration for each service?"

**Service dependencies:**
- "What remote services does the frontend call?"
- "Show me the service dependency map"
- "How many downstream dependencies does each service have?"

### What Claude does

When you ask *"Show me token usage by model"*, Claude runs this PPL query:

```sql
source=otel-v1-apm-span-*
| where `attributes.gen_ai.usage.input_tokens` > 0
| stats sum(`attributes.gen_ai.usage.input_tokens`) as total_input,
        sum(`attributes.gen_ai.usage.output_tokens`) as total_output
  by `attributes.gen_ai.request.model`
```

When you ask *"What remote services does the frontend call?"*, Claude uses `coalesce()` across multiple OTel attributes:

```sql
source=otel-v1-apm-span-*
| where serviceName = 'frontend' | where kind = 'SPAN_KIND_CLIENT'
| eval _remoteService = coalesce(
    `attributes.net.peer.name`, `attributes.server.address`,
    `attributes.rpc.service`, `attributes.db.system`,
    `attributes.gen_ai.system`, '')
| where _remoteService != ''
| stats count() as calls by _remoteService | sort - calls
```

---

## Logs

Search, filter, and analyze log entries across all services.

### Sample questions

**Severity filtering:**
- "Show me all ERROR logs"
- "How many errors does each service have?"
- "Show me WARN and ERROR logs from the last hour"

**Full-text search:**
- "Find all logs mentioning 'timeout'"
- "Search for logs containing 'connection refused'"

**Error analysis:**
- "Which service has the most error logs?"
- "Show me the error log breakdown by service and severity"

**Log volume:**
- "Show me log volume over time in hourly buckets"
- "Show the error rate trend over the last 24 hours"

### What Claude does

When you ask *"Which service has the most error logs?"*, Claude runs:

```sql
source=logs-otel-v1-*
| where severityText = 'ERROR'
| stats count() as errors by `resource.attributes.service.name`
| sort - errors
```

:::note
The log index uses `resource.attributes.service.name` instead of the top-level `serviceName` field found in trace spans.
:::

---

## Metrics

Query Prometheus for HTTP rates, latency percentiles, and GenAI-specific metrics.

### Sample questions

- "What is the current request rate for each service?"
- "Show me p95 and p99 latency for all services"
- "What is the 5xx error rate by service?"
- "Show me GenAI token usage rate by model"
- "Which services have the highest error rates?"

### What Claude does

When you ask *"What is the p95 latency?"*, Claude runs:

```promql
histogram_quantile(0.95,
  sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))
```

---

## Stack Health

Check component health, verify data ingestion, and troubleshoot issues.

### Sample questions

- "Is the observability stack healthy?"
- "How many trace spans and logs are in the system?"
- "List all OpenSearch indices"
- "Check the Prometheus scrape targets"

---

## Correlation

Connect traces, logs, and metrics for end-to-end incident investigation.

### Sample questions

- "Find all logs for trace ID abc123def456"
- "Show me error logs that have trace context"
- "Compare span counts vs log counts for each service"
- "Which traces are associated with 'connection refused' errors?"

### Real-world workflow

**"I see high error rates - what's happening?"**

1. Claude checks Prometheus error rate by service
2. Identifies the service with elevated errors (e.g., `weather-agent`)
3. Queries error logs for that service
4. Extracts traceId from error logs
5. Reconstructs the full trace tree
6. Shows the complete timeline from metric spike to root cause

---

## APM RED

Rate, Errors, and Duration metrics for service-level monitoring.

### Sample questions

- "Show me RED metrics for all services"
- "What is the request rate, error rate, and p95 latency for checkout?"
- "Which service has the highest error rate?"
- "Show me the top 5 services by fault rate"
- "What is the availability for each service?"

### What Claude does

Claude runs three PromQL queries with safe division patterns:

```promql
-- Rate
sum(rate(http_server_duration_seconds_count[5m])) by (service_name)

-- Errors (with clamp_min to avoid division by zero)
sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name)
/ clamp_min(sum(rate(http_server_duration_seconds_count[5m])) by (service_name), 1) * 100

-- Duration
histogram_quantile(0.95,
  sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))
```

---

## SLO/SLI

Define, measure, and alert on service level objectives.

### Sample questions

- "What is the current availability SLI for all services?"
- "What percentage of requests complete within 500ms?"
- "How much error budget do we have remaining for a 99.9% SLO?"
- "What is the current burn rate?"
- "Help me set up SLO recording rules for Prometheus"

---

## PPL Reference

Claude's built-in guide for constructing novel PPL queries beyond the standard templates.

### Sample questions

- "How do I write a PPL query to join traces with logs?"
- "Show me the PPL syntax for regex field extraction"
- "How do I use timechart to visualize error trends?"
- "Help me write a query to find the top 10 slowest operations per service"

---

## Power user tips

### Combining skills

Ask questions that span multiple skills - Claude automatically routes to the right ones:

- "The checkout service is slow. Show me its p95 latency, recent error logs, and the slowest traces."
- "Compare the error rate in Prometheus with actual error spans in OpenSearch"
- "An agent is failing - show me the traces, associated logs, and token usage"

### Iterative investigation

Claude remembers context within a conversation, so you can drill down:

```
> Show me services with error spans
  → weather-agent has 150 errors

> Show me the error spans from weather-agent
  → most errors are "External API returned 503"

> Find the traces for those errors and show me the associated logs
  → correlates traces → logs

> What was the error rate trend for weather-agent over the last 6 hours?
  → queries Prometheus for the time series
```
