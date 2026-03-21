---
name: stack-health
description: Check observability stack component health, verify data ingestion, and troubleshoot common issues.
allowed-tools:
  - Bash
  - curl
---

# Stack Health and Troubleshooting

## Overview

This skill provides health check commands, data verification queries, and troubleshooting guidance for the observability stack. Use it to verify that OpenSearch, Prometheus, the OTel Collector, and Data Prepper are running correctly, and to diagnose data flow problems.

Credentials are read from the `.env` file (default: `admin` / `My_password_123!@#`). All OpenSearch curl commands use HTTPS with `-k` to skip TLS certificate verification for local development.

## Health Checks

### OpenSearch Cluster Health

Check the overall cluster status (green, yellow, or red):

```bash
curl -sk -u admin:'My_password_123!@#' https://localhost:9200/_cluster/health?pretty
```

A healthy cluster returns `"status": "green"` or `"status": "yellow"` (yellow is normal for single-node development clusters).

### Prometheus Health

Verify Prometheus is running and healthy:

```bash
curl -s http://localhost:9090/-/healthy
```

Returns `Prometheus Server is Healthy.` when operational.

### OTel Collector Metrics

Check the OpenTelemetry Collector's internal metrics to verify it is receiving and exporting telemetry:

```bash
curl -s http://localhost:8888/metrics
```

Look for `otelcol_receiver_accepted_spans`, `otelcol_exporter_sent_spans`, and `otelcol_exporter_send_failed_spans` in the output to confirm data flow.

### OpenSearch Index Listing

List all indices to verify data ingestion has created the expected trace, log, and service map indices:

```bash
curl -sk -u admin:'My_password_123!@#' https://localhost:9200/_cat/indices?v
```

You should see indices matching `otel-v1-apm-span-*`, `otel-v1-apm-log-*`, and `otel-v2-apm-service-map` if data is flowing.

## Data Verification

### Trace Document Count

Verify trace data exists by counting documents in the trace index:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | stats count()"}'
```

### Log Document Count

Verify log data exists by counting documents in the log index:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-log-* | stats count()"}'
```

A count of 0 in either query indicates no data has been ingested for that signal. See the Troubleshooting section below.

## Docker Compose Diagnostics

### Check Container Status

View the status of all stack containers:

```bash
docker compose ps
```

All services should show `Up` or `Up (healthy)`. If a service is restarting or exited, check its logs.

### View Service Logs

View logs for a specific service:

```bash
docker compose logs <service-name>
```

### Data Prepper Logs

Check Data Prepper for pipeline errors or OpenSearch connection issues:

```bash
docker compose logs data-prepper
```

### OTel Collector Logs

Check the OTel Collector for receiver, processor, or exporter errors:

```bash
docker compose logs otel-collector
```

## Troubleshooting Common Failures

### OpenSearch Unreachable

**Symptoms**: Connection refused on port 9200, curl commands timeout or fail.

**Diagnostic steps**:

1. Check if the OpenSearch container is running:
   ```bash
   docker compose ps opensearch
   ```
2. Verify port 9200 is exposed and listening:
   ```bash
   docker compose ps | grep 9200
   ```
3. Check the OpenSearch health endpoint directly:
   ```bash
   curl -sk -u admin:'My_password_123!@#' https://localhost:9200/_cluster/health?pretty
   ```
4. Check OpenSearch container logs for startup errors:
   ```bash
   docker compose logs opensearch
   ```
5. If the container is restarting, check for memory issues — OpenSearch requires at least 512MB heap. Verify `OPENSEARCH_JAVA_OPTS` in `docker-compose.yml`.

### No Data in Indices

**Symptoms**: Index listing shows no `otel-v1-apm-*` indices, or document counts are 0.

**Diagnostic steps**:

1. Verify the OTel Collector is receiving data — check its metrics:
   ```bash
   curl -s http://localhost:8888/metrics | grep otelcol_receiver_accepted_spans
   ```
2. Check the Data Prepper pipeline for errors:
   ```bash
   docker compose logs data-prepper | grep -i error
   ```
3. Verify the OTLP endpoint is reachable from your application. The OTel Collector listens on:
   - gRPC: `localhost:4317`
   - HTTP: `localhost:4318`
4. Send test telemetry and verify it appears:
   ```bash
   curl -sk -u admin:'My_password_123!@#' https://localhost:9200/_cat/indices?v
   ```
5. Check that Data Prepper can connect to OpenSearch — look for authentication or TLS errors in Data Prepper logs.

### Data Prepper Pipeline Errors

**Symptoms**: Data reaches the OTel Collector but does not appear in OpenSearch indices.

**Diagnostic steps**:

1. Check Data Prepper logs for pipeline processing errors:
   ```bash
   docker compose logs data-prepper
   ```
2. Look for OpenSearch connection failures, authentication errors, or index creation failures in the logs.
3. Verify Data Prepper is receiving data from the OTel Collector on port 21890.
4. Restart Data Prepper if configuration was changed:
   ```bash
   docker compose restart data-prepper
   ```

### OTel Collector Export Failures

**Symptoms**: Applications send telemetry but data does not reach Data Prepper or Prometheus.

**Diagnostic steps**:

1. Check the OTel Collector's internal metrics for export failures:
   ```bash
   curl -s http://localhost:8888/metrics | grep otelcol_exporter_send_failed
   ```
2. Check OTel Collector logs for exporter errors:
   ```bash
   docker compose logs otel-collector
   ```
3. Verify the collector can reach Data Prepper (`data-prepper:21890`) and Prometheus (`prometheus:9090`) on the Docker network.
4. Check for batch processor backpressure or memory limiter drops in the collector metrics.

## Port Reference

| Component | Port | Protocol |
|---|---|---|
| OpenSearch | 9200 | HTTPS |
| OTel Collector (gRPC) | 4317 | gRPC |
| OTel Collector (HTTP) | 4318 | HTTP |
| Data Prepper | 21890 | HTTP |
| Prometheus | 9090 | HTTP |
| OpenSearch Dashboards | 5601 | HTTP |

## PPL Diagnostic Commands

### Describe Index Mappings

Use the PPL `describe` command to inspect the field mappings and types of an index. This is useful for verifying which fields are available for querying:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl \
  -H 'Content-Type: application/json' \
  -d '{"query": "describe otel-v1-apm-span-*"}'
```

### Explain Query Execution Plan

Use the PPL `_explain` endpoint to debug query execution plans. This shows how OpenSearch will execute a PPL query without actually running it:

```bash
curl -sk -u admin:'My_password_123!@#' \
  -X POST https://localhost:9200/_plugins/_ppl/_explain \
  -H 'Content-Type: application/json' \
  -d '{"query": "source=otel-v1-apm-span-* | head 10"}'
```

This is useful for diagnosing slow queries, understanding how filters are applied, and verifying that field names resolve correctly.

## AWS Managed Variants

### Amazon OpenSearch Service Health Check

Replace the local endpoint and authentication with AWS SigV4:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:es" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  https://DOMAIN-ID.REGION.es.amazonaws.com/_cluster/health?pretty
```

Index listing on AWS managed OpenSearch:

```bash
curl -s --aws-sigv4 "aws:amz:REGION:es" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  https://DOMAIN-ID.REGION.es.amazonaws.com/_cat/indices?v
```

- Endpoint format: `https://DOMAIN-ID.REGION.es.amazonaws.com`
- Auth: `--aws-sigv4 "aws:amz:REGION:es"` with `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"`
- No `-k` flag needed — AWS managed endpoints use valid TLS certificates

### Amazon Managed Service for Prometheus Health

Check Prometheus health on Amazon Managed Service for Prometheus (AMP):

```bash
curl -s --aws-sigv4 "aws:amz:REGION:aps" \
  --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" \
  https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query \
  --data-urlencode 'query=up'
```

- Endpoint format: `https://aps-workspaces.REGION.amazonaws.com/workspaces/WORKSPACE_ID/api/v1/query`
- Auth: `--aws-sigv4 "aws:amz:REGION:aps"` with `--user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"`
- PromQL query syntax is identical to local Prometheus; only the endpoint and authentication differ
