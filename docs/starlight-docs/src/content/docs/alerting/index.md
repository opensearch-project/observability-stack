---
title: Alerting
description: Configure monitors, triggers, and notifications to alert on observability data
---

OpenSearch Alerting lets you define monitors that watch your observability data and trigger notifications when conditions are met. Use alerting to detect errors, latency spikes, resource exhaustion, and other issues before they impact users.

## Key concepts

- **Monitors**: Scheduled queries that check your data at regular intervals. Monitors can query any OpenSearch index - logs, traces, metrics, or custom indices.
- **Triggers**: Conditions attached to monitors that define when an alert should fire. For example, "trigger when error count exceeds 100 in the last 5 minutes."
- **Actions**: What happens when a trigger fires - send a message to Slack, PagerDuty, email, a custom webhook, or any channel supported by the OpenSearch Notifications plugin.
- **Alerts**: Active instances of triggered conditions. Alerts have states (active, acknowledged, completed) and can be managed from the Alerting dashboard.

## Monitor types

| Type | Best for |
|---|---|
| **Per-query** | Simple threshold checks on aggregation results |
| **Per-bucket** | Monitoring multiple groups (e.g., alert per service when error rate exceeds threshold) |
| **Per-document** | Alerting on individual documents matching a condition |
| **Composite** | Chaining multiple monitors with workflow-level logic |

## Getting started

1. Open OpenSearch Dashboards and navigate to **Alerting** (under the main menu).
2. Create a **destination** (notification channel) - Slack, email, webhook, etc.
3. Create a **monitor** with a query against your observability data.
4. Add a **trigger** with a condition and an **action** that sends to your destination.
5. The monitor runs on its schedule and fires alerts when conditions are met.

## Example: alert on high error rate

Create a per-query monitor that checks log error counts:

```json
{
  "query": {
    "bool": {
      "must": [
        { "range": { "severityNumber": { "gte": 17 } } },
        { "range": { "@timestamp": { "gte": "now-5m" } } }
      ]
    }
  }
}
```

Set the trigger to fire when the document count exceeds your threshold, and configure an action to notify your on-call channel.

## Learn more

For the full alerting reference - including API operations, composite monitors, alert acknowledgment, and notification channel configuration - see the [Alerting documentation](https://docs.opensearch.org/latest/observing-your-data/alerting/index/) in the official OpenSearch docs.

## Prometheus/Cortex alerting

OpenSearch Alerting is one of two alerting surfaces in the stack. The other is a Cortex-side PromQL ruler that evaluates alert rules against time-series metrics and routes firing alerts through Alertmanager. Both surface in the same **Alert Manager** UI in OpenSearch Dashboards, so responders don't need to know which side produced an alert.

**When to use which:**

| Signal | Use |
|---|---|
| Log-volume thresholds, trace counts, OpenSearch cluster state | OpenSearch Alerting monitors |
| Metric thresholds, rate-based SLO burn, RED-method alerts | Cortex PromQL rules |

### Rule file locations

Cortex rules are shipped as YAML files mounted into the `cortex-rules-init` container on startup. Two namespaces are loaded:

- **`stack`** — watches the observability stack itself. Loaded always.
  - File: `docker-compose/prometheus/rules-stack/stack-alerts.yml`
  - Alerts: `PrometheusTargetDown`, `OtelCollectorExportFailures`, `OtelCollectorHighMemory`, `OtelCollectorQueueNearCapacity`
- **`otel_demo`** — RED-method alerts against the OpenTelemetry demo services. Loaded only when `INCLUDE_COMPOSE_OTEL_DEMO` is enabled in `.env`.
  - File: `docker-compose/prometheus/rules-otel-demo/otel-demo-alerts.yml`
  - Alerts: `OtelDemoFrontendHighErrorRate`, `OtelDemoFrontendHighLatency`, `OtelDemoFrontendProxyErrors`, `OtelDemoCheckoutErrors`, `OtelDemoPaymentFailures`, `OtelDemoCartErrors`, `OtelDemoServiceHighErrorRate`, `OtelDemoServiceHighLatency`, `OtelDemoAdServiceHighCpu`

To add or edit rules, change the YAML file and re-run the loader:

```bash
docker compose up -d --force-recreate cortex-rules-init
```

The loader upserts via `POST /api/v1/rules/{namespace}`, so re-runs are idempotent and edits take effect immediately. Inspect loaded groups at `http://localhost:9090/api/v1/rules/stack` or `http://localhost:9090/api/v1/rules/otel_demo` (Cortex returns YAML from this Ruler API endpoint).

### Alertmanager routing

Alertmanager runs on `localhost:9093` and is configured via `docker-compose/alertmanager/alertmanager.template.yml` (credentials are injected at container start). The default routing tree sends:

- `component=observability-stack` alerts → `opensearch-webhook` receiver (posts to the stack's own OpenSearch indices for correlation with traces/logs).
- otel-demo critical alerts → `otel-demo-critical` receiver.
- otel-demo warnings → `otel-demo-warning` receiver.
- Everything else → `null` receiver (dropped).

Placeholder receivers for Slack, email, and PagerDuty are included as examples — replace the dummy URLs with your real endpoints before wiring alerts to production channels. `amtool check-config` validates the template, and `curl http://localhost:9093/api/v2/alerts` lists currently firing alerts.

### The Alert Manager UI

In OpenSearch Dashboards, **Alert Manager** (under the main menu) renders both OpenSearch monitors and Cortex alerts in one list. It reads from two datasources:

- **Local cluster** — OpenSearch Alerting monitors (the ones described earlier on this page).
- **`ObservabilityStack_Prometheus`** — the Cortex datasource configured with `prometheus.uri`, `prometheus.ruler.uri`, and `alertmanager.uri`. The UI pulls firing alerts from Alertmanager, rule definitions from the Cortex Ruler API, and query results from Cortex's PromQL endpoint.

Filter by datasource in the UI's top-right to scope to just one source when investigating.

If the UI shows zero Cortex alerts even though they are firing in Cortex (check `curl http://localhost:9090/prometheus/api/v1/alerts`), confirm the datasource has all three URI properties set:

```bash
curl -u admin:PASSWORD http://localhost:5601/api/dataconnections | jq '.[] | select(.name=="ObservabilityStack_Prometheus") | .properties'
```

The stack's init container reconciles these properties automatically on every run; if they are still missing after a rerun, re-create the datasource with `docker compose down -v && docker compose up -d`.
