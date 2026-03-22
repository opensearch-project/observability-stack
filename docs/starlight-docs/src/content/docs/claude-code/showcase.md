---
title: Showcase
description: Real-world examples demonstrating the power of Claude Code with observability data
---

These examples demonstrate real investigative workflows using Claude Code with the observability plugin. Each scenario shows natural language questions and the actual queries Claude executes behind the scenes.

## AI Agent Cost Analysis

Track token consumption across LLM models to optimize costs.

```
> Which LLM model is consuming the most tokens?
```

Claude queries trace spans for GenAI token usage:

```sql
source=otel-v1-apm-span-*
| where `attributes.gen_ai.usage.input_tokens` > 0
| stats sum(`attributes.gen_ai.usage.input_tokens`) as input_tokens,
        sum(`attributes.gen_ai.usage.output_tokens`) as output_tokens
  by `attributes.gen_ai.request.model`
| eval total_tokens = input_tokens + output_tokens
| sort - total_tokens
```

**Follow-up:**

```
> Compare the cost efficiency — which model has the best output-to-input ratio?
```

```sql
source=otel-v1-apm-span-*
| where `attributes.gen_ai.usage.input_tokens` > 0
| stats sum(`attributes.gen_ai.usage.input_tokens`) as input,
        sum(`attributes.gen_ai.usage.output_tokens`) as output,
        count() as calls, avg(durationInNanos) as avg_latency
  by `attributes.gen_ai.request.model`
| eval efficiency = output * 1.0 / input
| sort - efficiency
```

---

## Incident Investigation: E-Commerce Checkout Failures

A real scenario: checkout errors are spiking. Use Claude to go from alert to root cause.

**Step 1 — Detect the problem:**

```
> What is the current error rate for the checkout service?
```

```promql
sum(rate(http_server_duration_seconds_count{
  http_response_status_code=~"5..", service_name="checkout"
}[5m]))
/
clamp_min(sum(rate(http_server_duration_seconds_count{
  service_name="checkout"
}[5m])), 1)
* 100
```

**Step 2 — Find the failing operations:**

```
> Show me the error spans from checkout sorted by time
```

```sql
source=otel-v1-apm-span-*
| where serviceName = 'checkout' AND `status.code` = 2
| fields traceId, spanId, name, `events.attributes.exception.type`,
         `events.attributes.exception.message`, startTime
| sort - startTime | head 20
```

**Step 3 — Trace a specific failure:**

```
> Show me the full trace tree for that traceId
```

```sql
source=otel-v1-apm-span-*
| where traceId = '<TRACE_ID>'
| fields spanId, parentSpanId, serviceName, name, durationInNanos,
         `status.code`, startTime
| sort startTime
```

**Step 4 — Find correlated logs:**

```
> Show me the logs for that trace
```

```sql
source=logs-otel-v1-*
| where traceId = '<TRACE_ID>'
| fields spanId, severityText, body, `resource.attributes.service.name`,
         `@timestamp`
| sort `@timestamp`
```

**Step 5 — Check if this is a new problem:**

```
> What was the error rate trend for checkout over the last 6 hours?
```

```promql
sum(rate(http_server_duration_seconds_count{
  http_response_status_code=~"5..", service_name="checkout"
}[5m]))
```

---

## Multi-Agent Orchestration Debugging

When a travel planner agent fans out to weather and events sub-agents, trace the entire orchestration.

```
> Show me all Travel Planner agent invocations and their sub-agent calls
```

```sql
source=otel-v1-apm-span-*
| where `attributes.gen_ai.operation.name` = 'invoke_agent'
| stats count() as invocations, avg(durationInNanos) as avg_duration_ns
  by `attributes.gen_ai.agent.name`
| eval avg_duration_ms = avg_duration_ns / 1000000
| sort - invocations
```

**Follow-up — Find slow orchestrations:**

```
> Which Travel Planner invocations took longer than 30 seconds?
```

```sql
source=otel-v1-apm-span-*
| where `attributes.gen_ai.operation.name` = 'invoke_agent'
  AND `attributes.gen_ai.agent.name` = 'Travel Planner'
  AND durationInNanos > 30000000000
| fields traceId, spanId, durationInNanos, startTime
| sort - durationInNanos
```

**Drill into a slow trace:**

```
> Show me all spans in that trace — I want to see which sub-agent was slow
```

```sql
source=otel-v1-apm-span-*
| where traceId = '<TRACE_ID>'
| fields spanId, parentSpanId, serviceName, name,
         `attributes.gen_ai.agent.name`, `attributes.gen_ai.operation.name`,
         durationInNanos
| eval duration_ms = durationInNanos / 1000000
| sort startTime
```

---

## Service Dependency Discovery

Automatically discover what each service depends on, even when different instrumentation libraries use different attributes.

```
> What remote services does the checkout service call?
```

```sql
source=otel-v1-apm-span-*
| where serviceName = 'checkout' AND kind = 'SPAN_KIND_CLIENT'
| eval _remoteService = coalesce(
    `attributes.net.peer.name`,
    `attributes.server.address`,
    `attributes.rpc.service`,
    `attributes.db.system`,
    `attributes.gen_ai.system`,
    'unknown')
| stats count() as calls, avg(durationInNanos) as avg_latency_ns
  by _remoteService
| eval avg_latency_ms = avg_latency_ns / 1000000
| sort - calls
```

**Follow-up — Check database performance:**

```
> Show me the slowest database queries from checkout
```

```sql
source=otel-v1-apm-span-*
| where serviceName = 'checkout'
  AND `attributes.db.system` != ''
| fields name, `attributes.db.system`, `attributes.db.statement`,
         durationInNanos
| eval duration_ms = durationInNanos / 1000000
| sort - duration_ms | head 20
```

---

## Error Budget Monitoring

Track SLO compliance and error budget consumption for SRE workflows.

```
> How much error budget do we have left for a 99.9% SLO?
```

```promql
1 - (
  (1 - sum(rate(http_server_duration_seconds_count{
    http_response_status_code=~"5.."}[30m]))
  / sum(rate(http_server_duration_seconds_count[30m])))
  / 0.999
)
```

**Follow-up — Check burn rate:**

```
> Are we burning error budget too fast? Show me the burn rate.
```

```promql
sum(rate(http_server_duration_seconds_count{
  http_response_status_code=~"5.."}[1h]))
/ sum(rate(http_server_duration_seconds_count[1h]))
/ (1 - 0.999)
```

A burn rate above 14.4x over 1 hour indicates a fast burn that would exhaust the monthly error budget in less than 2 days.

---

## Log Pattern Discovery

Find recurring error patterns across services to prioritize fixes.

```
> What are the most common error messages across all services?
```

```sql
source=logs-otel-v1-*
| where severityText = 'ERROR'
| stats count() as occurrences
  by body, `resource.attributes.service.name`
| sort - occurrences | head 20
```

**Follow-up — Trend analysis:**

```
> How has the error volume changed hour by hour today?
```

```sql
source=logs-otel-v1-*
| where severityText = 'ERROR'
| stats count() as error_count
  by span(`@timestamp`, 1h), `resource.attributes.service.name`
| sort `span(`@timestamp`, 1h)`
```

---

## Cross-Service Latency Investigation

Find where time is being spent across service boundaries.

```
> Show me the top 5 services with the worst p99 latency
```

```promql
topk(5,
  histogram_quantile(0.99,
    sum(rate(http_server_duration_seconds_bucket[5m]))
    by (le, service_name)))
```

**Follow-up — Drill into the slowest service:**

```
> What operations on the frontend service are the slowest?
```

```promql
topk(10,
  histogram_quantile(0.95,
    sum(rate(http_server_duration_seconds_bucket{
      service_name="frontend"
    }[5m])) by (le, http_route)))
```

**Then correlate with traces:**

```
> Show me the actual slow traces from the frontend for that route
```

```sql
source=otel-v1-apm-span-*
| where serviceName = 'frontend'
  AND kind = 'SPAN_KIND_SERVER'
  AND durationInNanos > 1000000000
| fields traceId, name, durationInNanos, startTime
| eval duration_ms = durationInNanos / 1000000
| sort - duration_ms | head 20
```

---

## Tool Execution Analysis

Debug AI agent tool calls — what's failing, what's slow, and why.

```
> Which tools are failing the most?
```

```sql
source=otel-v1-apm-span-*
| where `attributes.gen_ai.operation.name` = 'execute_tool'
  AND `status.code` = 2
| stats count() as failures by `attributes.gen_ai.tool.name`
| sort - failures
```

**Follow-up — Inspect a failing tool:**

```
> Show me the arguments and results for the last 10 get_current_weather calls
```

```sql
source=otel-v1-apm-span-*
| where `attributes.gen_ai.tool.name` = 'get_current_weather'
| fields traceId, `attributes.gen_ai.tool.call.arguments`,
         `attributes.gen_ai.tool.call.result`,
         `status.code`, durationInNanos, startTime
| sort - startTime | head 10
```

---

## Comparing All Services at a Glance

Get a complete RED dashboard for every service in one investigation.

```
> Give me a health dashboard — show rate, error rate, and p95 latency for all services
```

Claude runs three PromQL queries simultaneously and presents a unified view:

| Query | Signal |
|---|---|
| `sum(rate(http_server_duration_seconds_count[5m])) by (service_name)` | Rate |
| `sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name) / clamp_min(sum(rate(http_server_duration_seconds_count[5m])) by (service_name), 1) * 100` | Error % |
| `histogram_quantile(0.95, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))` | p95 Latency |
