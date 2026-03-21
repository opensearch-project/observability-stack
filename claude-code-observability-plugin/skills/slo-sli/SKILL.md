---
name: slo-sli
description: SLO/SLI definitions, Prometheus recording rules, error budget calculations, and burn rate alerting for service reliability management.
allowed-tools:
  - Bash
  - curl
---

# SLO/SLI Definitions and Error Budget Management

## Overview

This skill provides templates for implementing Service Level Objectives (SLOs) and Service Level Indicators (SLIs) using Prometheus recording rules, error budget calculations, and burn rate alerting. It follows the Google SRE book methodology for multi-window burn rate alerts.

All Prometheus queries use the HTTP API at `http://localhost:9090/api/v1/query`. Credentials are not required for local Prometheus (HTTP, no auth). Recording rules and alerting rules are YAML blocks that can be added to the Prometheus configuration at `docker-compose/prometheus/prometheus.yml`.


## SLI Definition Templates

### Availability SLI

The availability SLI measures the ratio of successful requests (non-5xx) to total requests. A value of 1.0 means all requests succeeded; 0.99 means 1% failed.

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count{http_response_status_code!~"5.."}[5m])) / sum(rate(http_server_duration_seconds_count[5m]))'
```

Per-service availability:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_count{http_response_status_code!~"5.."}[5m])) by (service_name) / sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

### Latency SLI

The latency SLI measures the ratio of requests completing within a threshold (e.g., 250ms) to total requests. A value of 0.95 means 95% of requests finished within the threshold.

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_bucket{le="0.25"}[5m])) / sum(rate(http_server_duration_seconds_count[5m]))'
```

Per-service latency SLI with a 500ms threshold:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(http_server_duration_seconds_bucket{le="0.5"}[5m])) by (service_name) / sum(rate(http_server_duration_seconds_count[5m])) by (service_name)'
```

### GenAI-Specific SLI

The GenAI SLI measures agent response time objectives using the `gen_ai_client_operation_duration` histogram. For example, the ratio of GenAI operations completing within 5 seconds:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(gen_ai_client_operation_duration_bucket{le="5.0"}[5m])) by (gen_ai_operation_name) / sum(rate(gen_ai_client_operation_duration_count[5m])) by (gen_ai_operation_name)'
```

Per-model GenAI availability (non-error operations):

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sum(rate(gen_ai_client_operation_duration_count{gen_ai_operation_name!="error"}[5m])) by (gen_ai_request_model) / sum(rate(gen_ai_client_operation_duration_count[5m])) by (gen_ai_request_model)'
```


## Prometheus Recording Rules

Recording rules pre-compute SLI values at multiple time windows so that SLO compliance queries are fast and efficient. Add these rule groups to `docker-compose/prometheus/prometheus.yml` under the `rule_files` section.

### Recording Rule Naming Convention

Recording rules follow the pattern:

| Pattern | Example |
|---|---|
| `sli:http_availability:ratio_rate<window>` | `sli:http_availability:ratio_rate5m` |
| `sli:http_latency:ratio_rate<window>` | `sli:http_latency:ratio_rate5m` |

Windows: `5m`, `30m`, `1h`, `6h`, `1d`, `3d`, `30d`

### Availability Recording Rules

```yaml
groups:
  - name: sli_availability
    rules:
      - record: sli:http_availability:ratio_rate5m
        expr: |
          sum(rate(http_server_duration_seconds_count{http_response_status_code!~"5.."}[5m])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[5m])) by (service_name)
        labels:
          sli: availability

      - record: sli:http_availability:ratio_rate30m
        expr: |
          sum(rate(http_server_duration_seconds_count{http_response_status_code!~"5.."}[30m])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[30m])) by (service_name)
        labels:
          sli: availability

      - record: sli:http_availability:ratio_rate1h
        expr: |
          sum(rate(http_server_duration_seconds_count{http_response_status_code!~"5.."}[1h])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[1h])) by (service_name)
        labels:
          sli: availability

      - record: sli:http_availability:ratio_rate6h
        expr: |
          sum(rate(http_server_duration_seconds_count{http_response_status_code!~"5.."}[6h])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[6h])) by (service_name)
        labels:
          sli: availability

      - record: sli:http_availability:ratio_rate1d
        expr: |
          sum(rate(http_server_duration_seconds_count{http_response_status_code!~"5.."}[1d])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[1d])) by (service_name)
        labels:
          sli: availability

      - record: sli:http_availability:ratio_rate3d
        expr: |
          sum(rate(http_server_duration_seconds_count{http_response_status_code!~"5.."}[3d])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[3d])) by (service_name)
        labels:
          sli: availability

      - record: sli:http_availability:ratio_rate30d
        expr: |
          sum(rate(http_server_duration_seconds_count{http_response_status_code!~"5.."}[30d])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[30d])) by (service_name)
        labels:
          sli: availability
```

### Latency Recording Rules

```yaml
groups:
  - name: sli_latency
    rules:
      - record: sli:http_latency:ratio_rate5m
        expr: |
          sum(rate(http_server_duration_seconds_bucket{le="0.25"}[5m])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[5m])) by (service_name)
        labels:
          sli: latency

      - record: sli:http_latency:ratio_rate30m
        expr: |
          sum(rate(http_server_duration_seconds_bucket{le="0.25"}[30m])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[30m])) by (service_name)
        labels:
          sli: latency

      - record: sli:http_latency:ratio_rate1h
        expr: |
          sum(rate(http_server_duration_seconds_bucket{le="0.25"}[1h])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[1h])) by (service_name)
        labels:
          sli: latency

      - record: sli:http_latency:ratio_rate6h
        expr: |
          sum(rate(http_server_duration_seconds_bucket{le="0.25"}[6h])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[6h])) by (service_name)
        labels:
          sli: latency

      - record: sli:http_latency:ratio_rate1d
        expr: |
          sum(rate(http_server_duration_seconds_bucket{le="0.25"}[1d])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[1d])) by (service_name)
        labels:
          sli: latency

      - record: sli:http_latency:ratio_rate3d
        expr: |
          sum(rate(http_server_duration_seconds_bucket{le="0.25"}[3d])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[3d])) by (service_name)
        labels:
          sli: latency

      - record: sli:http_latency:ratio_rate30d
        expr: |
          sum(rate(http_server_duration_seconds_bucket{le="0.25"}[30d])) by (service_name)
          /
          sum(rate(http_server_duration_seconds_count[30d])) by (service_name)
        labels:
          sli: latency
```

Query a recording rule value:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sli:http_availability:ratio_rate30d'
```

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sli:http_latency:ratio_rate1h'
```


## Error Budget Calculation

### Common SLO Targets and Allowed Downtime

| SLO Target | Error Budget | Allowed Downtime (30 days) | Allowed Downtime (per day) |
|---|---|---|---|
| 99.9% | 0.1% | 43.2 minutes | 1.44 minutes |
| 99.5% | 0.5% | 3.6 hours | 7.2 minutes |
| 99.0% | 1.0% | 7.2 hours | 14.4 minutes |

### Remaining Error Budget

The remaining error budget tells you what fraction of your error budget is still available. A value of 1.0 means the full budget remains; 0.0 means the budget is exhausted; negative means you've exceeded it.

Formula: `1 - (1 - SLI) / (1 - SLO_target)`

For a 99.9% SLO target using the 30-day availability SLI:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=1 - ((1 - sli:http_availability:ratio_rate30d) / (1 - 0.999))'
```

For a 99.5% SLO target:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=1 - ((1 - sli:http_availability:ratio_rate30d) / (1 - 0.995))'
```

For a 99.0% SLO target:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=1 - ((1 - sli:http_availability:ratio_rate30d) / (1 - 0.99))'
```

### Error Budget Consumption Rate

The consumption rate shows how fast the error budget is being consumed. A value of 1.0 means the budget is being consumed at exactly the expected rate; values above 1.0 mean the budget is being consumed faster than sustainable.

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate1h) / (1 - 0.999)'
```

Per-service error budget consumption over the last day:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate1d) / (1 - 0.999)'
```


## Burn Rate Queries

Burn rate measures how fast you are consuming your error budget relative to the SLO. A burn rate of 1.0 means you will exactly exhaust the budget by the end of the SLO window. Higher values mean faster consumption.

### Single-Window Burn Rate

Burn rate over a 1-hour window for a 99.9% SLO:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate1h) / (1 - 0.999)'
```

Burn rate over a 6-hour window:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate6h) / (1 - 0.999)'
```

### Multi-Window Burn Rate (Google SRE Book Pattern)

The multi-window approach uses two conditions that must both be true before alerting. This reduces false positives by requiring both a short-term spike and a sustained trend.

#### 14.4x Fast Burn — 1h window / 6h window

Detects severe incidents that will exhaust the entire 30-day error budget in ~2 days. Both the 1-hour and 6-hour burn rates must exceed 14.4x:

1-hour burn rate:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate1h) / (1 - 0.999) > 14.4'
```

6-hour burn rate (confirmation window):

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate6h) / (1 - 0.999) > 14.4'
```

#### 1x Slow Burn — 3d window / 30d window

Detects slow, sustained degradation that will exhaust the error budget by the end of the SLO window. Both the 3-day and 30-day burn rates must exceed 1x:

3-day burn rate:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate3d) / (1 - 0.999) > 1'
```

30-day burn rate (confirmation window):

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate30d) / (1 - 0.999) > 1'
```


## Prometheus Alerting Rules for Burn Rate

Add these alerting rules to the Prometheus configuration to trigger alerts when burn rates exceed thresholds. These follow the multi-window pattern from the Google SRE book.

### Availability Burn Rate Alerts

```yaml
groups:
  - name: slo_burn_rate_alerts
    rules:
      - alert: SLOAvailabilityFastBurn
        expr: |
          (
            (1 - sli:http_availability:ratio_rate1h) / (1 - 0.999) > 14.4
          and
            (1 - sli:http_availability:ratio_rate6h) / (1 - 0.999) > 14.4
          )
        for: 2m
        labels:
          severity: critical
          slo: availability
        annotations:
          summary: "High availability burn rate detected for {{ $labels.service_name }}"
          description: "Service {{ $labels.service_name }} is consuming error budget at 14.4x the sustainable rate. At this rate, the 30-day budget will be exhausted in ~2 days."

      - alert: SLOAvailabilitySlowBurn
        expr: |
          (
            (1 - sli:http_availability:ratio_rate3d) / (1 - 0.999) > 1
          and
            (1 - sli:http_availability:ratio_rate30d) / (1 - 0.999) > 1
          )
        for: 1h
        labels:
          severity: warning
          slo: availability
        annotations:
          summary: "Sustained availability degradation for {{ $labels.service_name }}"
          description: "Service {{ $labels.service_name }} has a burn rate above 1x over 3 days, confirmed by the 30-day window. Error budget will be exhausted before the SLO window ends."
```

### Latency Burn Rate Alerts

```yaml
groups:
  - name: slo_latency_burn_rate_alerts
    rules:
      - alert: SLOLatencyFastBurn
        expr: |
          (
            (1 - sli:http_latency:ratio_rate1h) / (1 - 0.999) > 14.4
          and
            (1 - sli:http_latency:ratio_rate6h) / (1 - 0.999) > 14.4
          )
        for: 2m
        labels:
          severity: critical
          slo: latency
        annotations:
          summary: "High latency burn rate detected for {{ $labels.service_name }}"
          description: "Service {{ $labels.service_name }} latency SLI is degrading at 14.4x the sustainable rate."

      - alert: SLOLatencySlowBurn
        expr: |
          (
            (1 - sli:http_latency:ratio_rate3d) / (1 - 0.999) > 1
          and
            (1 - sli:http_latency:ratio_rate30d) / (1 - 0.999) > 1
          )
        for: 1h
        labels:
          severity: warning
          slo: latency
        annotations:
          summary: "Sustained latency degradation for {{ $labels.service_name }}"
          description: "Service {{ $labels.service_name }} latency SLI burn rate exceeds 1x over 3 days."
```

Query active alerts:

```bash
curl -s 'http://localhost:9090/api/v1/alerts'
```

Query alerting rules:

```bash
curl -s 'http://localhost:9090/api/v1/rules'
```


## SLO Compliance Reporting

### Current SLI Value

Query the current availability SLI over the 30-day window for all services:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sli:http_availability:ratio_rate30d'
```

Query the current latency SLI over the 30-day window:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sli:http_latency:ratio_rate30d'
```

### Target Comparison

Check which services are meeting the 99.9% availability SLO:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sli:http_availability:ratio_rate30d >= 0.999'
```

Check which services are violating the SLO:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sli:http_availability:ratio_rate30d < 0.999'
```

### Budget Remaining per Service

Remaining error budget for each service against a 99.9% target:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=1 - ((1 - sli:http_availability:ratio_rate30d) / (1 - 0.999))'
```

### Burn Rate per Service

Current burn rate for each service over the last hour:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate1h) / (1 - 0.999)'
```

Current burn rate over the last day:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate1d) / (1 - 0.999)'
```


## SLO Setup Workflow

Follow these steps to implement SLO monitoring for a service:

### Step 1: Define SLIs

Choose the SLIs that matter for your service. Most services need at least availability and latency:

- **Availability SLI**: ratio of non-5xx responses to total responses
- **Latency SLI**: ratio of requests under a threshold (e.g., 250ms) to total requests

Verify the raw metrics exist in Prometheus:

```bash
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=http_server_duration_seconds_count'
```

### Step 2: Add Recording Rules

Add the recording rule groups from the [Prometheus Recording Rules](#prometheus-recording-rules) section to your Prometheus configuration. This pre-computes SLI values at all required time windows (5m, 30m, 1h, 6h, 1d, 3d, 30d).

Save the rules to a file (e.g., `slo-rules.yml`) and reference it in `prometheus.yml`:

```yaml
rule_files:
  - "slo-rules.yml"
```

Reload Prometheus to pick up the new rules:

```bash
curl -s -X POST 'http://localhost:9090/-/reload'
```

Verify the recording rules are loaded:

```bash
curl -s 'http://localhost:9090/api/v1/rules' | python3 -m json.tool
```

### Step 3: Set Targets

Choose SLO targets based on your service requirements:

| Service Tier | Availability Target | Latency Target (p99 < threshold) |
|---|---|---|
| Critical (user-facing) | 99.9% | 99.9% within 250ms |
| Standard (internal) | 99.5% | 99.5% within 500ms |
| Best-effort (batch) | 99.0% | 99.0% within 2s |

### Step 4: Add Alerts

Add the burn rate alerting rules from the [Prometheus Alerting Rules for Burn Rate](#prometheus-alerting-rules-for-burn-rate) section. Adjust the SLO target value in the `expr` field to match your chosen target.

Verify alerts are configured:

```bash
curl -s 'http://localhost:9090/api/v1/rules' | python3 -m json.tool
```

### Step 5: Query Compliance

Run the compliance report queries from the [SLO Compliance Reporting](#slo-compliance-reporting) section to verify everything is working:

```bash
# Current SLI
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=sli:http_availability:ratio_rate30d'

# Budget remaining
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=1 - ((1 - sli:http_availability:ratio_rate30d) / (1 - 0.999))'

# Burn rate
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate1h) / (1 - 0.999)'

# Active alerts
curl -s 'http://localhost:9090/api/v1/alerts'
```


## AWS Managed Service Variants

### Amazon Managed Service for Prometheus (AMP) (SigV4)

Replace the local Prometheus endpoint and authentication with AWS SigV4 for all PromQL queries in this skill:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:aps" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  'https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query' \
  --data-urlencode 'query=sli:http_availability:ratio_rate30d'
```

- Endpoint format: `https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query`
- Auth: `--aws-sigv4 "aws:amz:REGION:aps"` with `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"`
- PromQL query syntax is identical between local Prometheus and Amazon Managed Prometheus; only the endpoint and authentication differ

Error budget query via AMP:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:aps" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  'https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query' \
  --data-urlencode 'query=1 - ((1 - sli:http_availability:ratio_rate30d) / (1 - 0.999))'
```

Burn rate query via AMP:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:aps" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  'https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query' \
  --data-urlencode 'query=(1 - sli:http_availability:ratio_rate1h) / (1 - 0.999)'
```

For Amazon Managed Prometheus, recording rules and alerting rules are managed via the AMP Rules Management API rather than local configuration files. Use `awscurl` or the AWS CLI to upload rule groups.
