# OpenSearch Observability Plugin for Claude Code

This plugin teaches Claude Code how to query and investigate traces, logs, and metrics from an OpenSearch-based observability stack. It provides nine skill files containing PPL (Piped Processing Language) query templates for OpenSearch, PromQL query templates for Prometheus, and curl-based commands — all ready to execute against a running stack.

## Skill Routing Table

Load the appropriate skill file based on the user's intent:

| Skill | When to Use |
|---|---|
| `skills/traces/SKILL.md` | Use when investigating agent invocations, tool executions, slow spans, error spans, token usage, or trace correlation |
| `skills/logs/SKILL.md` | Use when searching logs by severity, correlating logs with traces, identifying error patterns, or analyzing log volume |
| `skills/metrics/SKILL.md` | Use when querying HTTP request rates, latency percentiles, error rates, active connections, or GenAI metrics |
| `skills/stack-health/SKILL.md` | Use when checking stack component health, troubleshooting data flow issues, or verifying service status |
| `skills/ppl-reference/SKILL.md` | Use when constructing novel PPL queries, looking up PPL syntax, or understanding PPL functions |
| `skills/correlation/SKILL.md` | Use when performing cross-signal correlation between traces, logs, and metrics |
| `skills/apm-red/SKILL.md` | Use when analyzing RED metrics (Rate, Errors, Duration) for service-level monitoring |
| `skills/slo-sli/SKILL.md` | Use when defining SLOs/SLIs, calculating error budgets, or setting up burn rate alerts |
| `skills/osd-config/SKILL.md` | Use when discovering index patterns, workspaces, saved objects, APM configs, or field mappings from OpenSearch Dashboards or OpenSearch APIs |

## Configuration

### Environment Variables

Set these environment variables to override default endpoints:

- `$OPENSEARCH_ENDPOINT` — OpenSearch base URL (default: `https://localhost:9200`)
- `$PROMETHEUS_ENDPOINT` — Prometheus base URL (default: `http://localhost:9090`)

### Connection Profiles

#### Local Stack (Default)

| Service | Endpoint | Auth |
|---|---|---|
| OpenSearch | `https://localhost:9200` | `-u admin:'My_password_123!@#' -k` (HTTPS + basic auth, skip TLS verify) |
| Prometheus | `http://localhost:9090` | None (HTTP, no auth) |

Example OpenSearch curl:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | head 10"}'
```

Example Prometheus curl:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=up'
```

#### AWS Managed Services

##### Amazon OpenSearch Service

- Endpoint format: `https://DOMAIN-ID.REGION.es.amazonaws.com`
- Auth: AWS Signature Version 4

```bash
curl -s --aws-sigv4 "aws:amz:REGION:es" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  -X POST https://DOMAIN-ID.REGION.es.amazonaws.com/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | head 10"}'
```

##### Amazon Managed Service for Prometheus (AMP)

- Endpoint format: `https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query`
- Auth: AWS Signature Version 4

```bash
curl -s --aws-sigv4 "aws:amz:REGION:aps" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  'https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query' \
  --data-urlencode 'query=up'
```

> **Note:** PPL and PromQL query syntax is identical across local and AWS managed profiles. Only the endpoint URL and authentication method differ.

## Port Reference

| Component | Port | Protocol |
|---|---|---|
| OpenSearch | 9200 | HTTPS |
| OTel Collector (gRPC) | 4317 | gRPC |
| OTel Collector (HTTP) | 4318 | HTTP |
| Data Prepper | 21890 | HTTP |
| Prometheus | 9090 | HTTP |
| OpenSearch Dashboards | 5601 | HTTP |

## Index Patterns

| Signal | Index Pattern | Key Fields |
|---|---|---|
| Traces | `otel-v1-apm-span-*` | `traceId`, `spanId`, `serviceName`, `name`, `durationInNanos`, `status.code`, `attributes.gen_ai.*` |
| Logs | `logs-otel-v1-*` | `traceId`, `spanId`, `severityText`, `body`, `resource.attributes.service.name`, `@timestamp` |
| Service Maps | `otel-v2-apm-service-map-*` | `sourceNode`, `targetNode`, `sourceOperation`, `targetOperation` |

> **Note:** The log index uses `resource.attributes.service.name` (backtick-quoted in PPL) instead of `serviceName`. The trace span index has a top-level `serviceName` field.
