# Feature Guide & Sample Questions

This guide shows how to use the Claude Code Observability Plugin through natural language questions. Each section demonstrates a skill with real example questions and what Claude Code does behind the scenes.

## Traces — Investigate Agent & Service Behavior

The traces skill lets you query distributed trace data to understand how requests flow through your services and AI agents.

### Sample Questions

**Service overview:**
```
> Which services have the most trace spans?
> Show me the top 10 services by span count
> How many distinct operations does each service have?
```

**GenAI agent analysis:**
```
> How many times was each AI agent invoked?
> What is the average response time for the Travel Planner agent?
> Show me token usage by model — which model consumes the most tokens?
> Compare input vs output token counts across all LLM models
> Find the slowest agent invocations in the last hour
```

**Error investigation:**
```
> Show me all error spans from the checkout service
> Which services have the most errors?
> Find failed tool executions — what tools are failing?
> Show me the trace tree for a specific traceId
```

**Latency analysis:**
```
> Find all spans taking longer than 5 seconds
> What is the p95 duration for each service?
> Show me the slowest operations in the frontend service
```

### What Claude Does

When you ask "Show me token usage by model", Claude runs:

```
source=otel-v1-apm-span-*
| where `attributes.gen_ai.usage.input_tokens` > 0
| stats sum(`attributes.gen_ai.usage.input_tokens`) as total_input,
        sum(`attributes.gen_ai.usage.output_tokens`) as total_output
  by `attributes.gen_ai.request.model`
```

Example output:

| Model | Input Tokens | Output Tokens |
|---|---|---|
| astronomy-llm | 2,599,194 | 453,805 |
| claude-sonnet-4.5 | 388,299 | 102,521 |
| claude-haiku | 371,422 | 93,288 |
| gpt-4.1-mini | 361,127 | 93,199 |

---

## Logs — Search & Analyze Log Data

The logs skill lets you search, filter, and analyze log entries across all services.

### Sample Questions

**Severity filtering:**
```
> Show me all ERROR logs
> How many errors does each service have?
> Show me WARN and ERROR logs from the last hour
> What are the most common error messages?
```

**Full-text search:**
```
> Find all logs mentioning "timeout"
> Search for logs containing "connection refused"
> Find logs about rate limiting
```

**Error analysis:**
```
> Which service has the most error logs?
> Show me the error log breakdown by service and severity
> Find error patterns — group errors by message
```

**Log volume:**
```
> Show me log volume over time in hourly buckets
> How many logs are generated per service?
> Show the error rate trend over the last 24 hours
```

### What Claude Does

When you ask "Which service has the most error logs?", Claude runs:

```
source=logs-otel-v1-*
| where severityText = 'ERROR'
| stats count() as errors by `resource.attributes.service.name`
| sort - errors
```

Example output:

| Service | Error Count |
|---|---|
| weather-agent | 663 |
| load-generator | 30 |
| kafka | 8 |
| product-reviews | 7 |

---

## Metrics — Query Prometheus with PromQL

The metrics skill lets you query HTTP rates, latency percentiles, and GenAI-specific metrics from Prometheus.

### Sample Questions

**HTTP performance:**
```
> What is the current request rate for each service?
> Show me p95 and p99 latency for all services
> What is the 5xx error rate by service?
> How many active connections does each service have?
```

**GenAI metrics:**
```
> Show me GenAI token usage rate by model
> What is the average operation duration for GenAI calls?
> Compare token consumption across different agent types
```

**Capacity planning:**
```
> Show me the request rate trend over the last hour
> Which services have the highest error rates?
> What is the overall system throughput?
```

### What Claude Does

When you ask "What is the p95 latency for all services?", Claude runs:

```
histogram_quantile(0.95,
  sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name)
)
```

---

## Stack Health — Verify & Troubleshoot

The stack-health skill helps you check component health, verify data ingestion, and troubleshoot common issues.

### Sample Questions

```
> Is the observability stack healthy?
> Check if OpenSearch is running
> How many trace spans and logs are in the system?
> List all OpenSearch indices
> Are there any services not sending data?
> Check the Prometheus scrape targets
> Show me the OTel Collector configuration
```

### What Claude Does

Claude checks multiple endpoints: OpenSearch cluster health, Prometheus health, OTel Collector metrics, and verifies data exists in the expected indices.

---

## Correlation — Cross-Signal Investigation

The correlation skill connects traces, logs, and metrics to give you a complete picture of an incident.

### Sample Questions

**Trace-to-log:**
```
> Find all logs for trace ID abc123def456
> Show me error logs that have trace context
> Correlate this trace with its associated logs
```

**Log-to-trace:**
```
> I see an error log — find the full trace for it
> Which traces are associated with "connection refused" errors?
> Find the span that produced this error log
```

**Cross-signal:**
```
> Compare span counts vs log counts for each service
> Find services with high error rates in both traces and logs
> Show me exemplars — which Prometheus metrics have trace context?
```

### Real-World Workflow

**"I see high error rates — what's happening?"**

1. Claude checks Prometheus: `rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])`
2. Finds `weather-agent` has elevated errors
3. Queries error logs: `source=logs-otel-v1-* | where severityText = 'ERROR' AND resource.attributes.service.name = 'weather-agent'`
4. Extracts traceId from error logs
5. Reconstructs the full trace: `source=otel-v1-apm-span-* | where traceId = '<id>' | sort startTime`
6. Shows you the complete timeline from metric spike to root cause

---

## APM RED — Rate, Errors, Duration

The APM RED skill provides service-level monitoring using the RED methodology.

### Sample Questions

```
> Show me RED metrics for all services
> What is the request rate, error rate, and p95 latency for the checkout service?
> Which service has the highest error rate?
> Compare RED metrics between frontend and backend services
> Show me GenAI-specific RED metrics — rate, errors, and duration for agent invocations
```

### What Claude Does

Claude runs three PromQL queries (Rate, Errors, Duration) and optionally enriches with PPL span data:

- **Rate:** `sum(rate(http_server_duration_seconds_count[5m])) by (service_name)`
- **Errors:** `sum(rate(http_server_duration_seconds_count{http_response_status_code=~"5.."}[5m])) by (service_name)`
- **Duration:** `histogram_quantile(0.95, sum(rate(http_server_duration_seconds_bucket[5m])) by (le, service_name))`

---

## SLO/SLI — Service Reliability

The SLO/SLI skill helps you define, measure, and alert on service level objectives.

### Sample Questions

```
> What is the current availability SLI for all services?
> What percentage of requests complete within 500ms?
> How much error budget do we have remaining for a 99.9% SLO?
> What is the current burn rate? Are we consuming error budget too fast?
> Help me set up SLO recording rules for Prometheus
> Calculate a multi-window burn rate alert for our checkout service
```

### What Claude Does

When you ask "How much error budget do we have remaining?", Claude calculates:

```
1 - ((1 - availability_sli) / (1 - 0.999))
```

Where `availability_sli` = ratio of non-5xx requests to total requests.

---

## PPL Reference — Build Custom Queries

The PPL reference skill is Claude's built-in guide for constructing novel PPL queries. Use it when you need queries beyond the standard templates.

### Sample Questions

```
> How do I write a PPL query to join traces with logs?
> Show me the PPL syntax for regex field extraction
> How do I use the timechart command to visualize error trends?
> What PPL commands can I use for log pattern discovery?
> Help me write a PPL query to find the top 10 slowest operations per service
```

---

## Power User Tips

### Combining Skills

Ask questions that span multiple skills — Claude automatically routes to the right ones:

```
> The checkout service is slow. Show me its p95 latency, recent error logs, and the slowest traces.
> Compare the error rate in Prometheus with actual error spans in OpenSearch
> An agent is failing — show me the traces, associated logs, and token usage
```

### Iterative Investigation

Claude remembers context within a conversation, so you can drill down:

```
> Show me services with error spans
  (Claude shows: weather-agent has 150 errors)
> Show me the error spans from weather-agent
  (Claude shows: most errors are "External API returned 503")
> Find the traces for those errors and show me the associated logs
  (Claude correlates traces → logs)
> What was the error rate trend for weather-agent over the last 6 hours?
  (Claude queries Prometheus for the time series)
```

### Custom Time Ranges

Specify time ranges naturally:

```
> Show me error logs from the last 30 minutes
> What was the p99 latency yesterday between 2-4pm?
> Compare this week's error rate with last week
```
