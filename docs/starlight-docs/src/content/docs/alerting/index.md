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
