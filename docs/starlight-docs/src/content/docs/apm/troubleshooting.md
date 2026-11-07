---
title: Troubleshooting APM
description: Diagnose missing traces, services, service-map edges, and RED metrics
sidebar:
  order: 90
---

Use this page when telemetry is not visible in Application Monitoring after you
have sent a request from an instrumented application.

## Start with the shortest path

Run these checks in order:

1. Confirm the stack is running:

   ```bash
   docker compose ps
   ```

2. Check the Collector and Data Prepper logs:

   ```bash
   docker compose logs --tail=100 otel-collector data-prepper
   ```

3. Confirm the Collector ports are reachable:

   ```bash
   curl -v http://localhost:4318/v1/traces
   nc -vz localhost 4317
   ```

4. Generate a fresh request from the application.
5. Check **Observability** → **Traces** before checking Application Monitoring.

If no trace appears, the problem is in instrumentation or ingestion. If the
trace appears but APM is empty, continue with the APM checks below.

## Common symptoms

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| No trace appears | Wrong OTLP endpoint, protocol, or exporter | Use port `4317` for OTLP gRPC and `4318` for OTLP HTTP/protobuf. Check `OTEL_EXPORTER_OTLP_ENDPOINT`. |
| Trace appears, but service catalog is empty | APM datasets or workspace configuration is incomplete | Follow [Configuring APM](/docs/apm/configuring-apm/) and confirm the trace dataset and service-map index pattern exist. |
| Service appears, but no map edge exists | Trace context was not propagated to the downstream service | Confirm the downstream request carries the W3C `traceparent` header and that both services emit CLIENT/SERVER spans. |
| Service appears, but RED metrics are missing | Prometheus data source or Data Prepper metrics pipeline is not configured | Check the Prometheus data source and the `otel_apm_service_map` pipeline. |
| Logs do not open from a trace | Trace and log datasets are not correlated | Configure the relationship described in [Correlations](/docs/investigate/correlations/). |
| Data is delayed | Batch processors or the selected time range hide recent data | Wait for the export interval, refresh the page, and widen the time range. |

## Verify the ingestion path

The normal path is:

```text
application → OTel SDK or auto-instrumentation → OTel Collector
→ Data Prepper → OpenSearch / Prometheus → OpenSearch Dashboards
```

Check each boundary instead of changing all configuration at once:

1. **Application**: confirm the process is running with the instrumentation enabled.
2. **Collector**: check for exporter or connection errors in `docker compose logs`.
3. **Data Prepper**: check that the trace and service-map pipelines started successfully.
4. **OpenSearch**: confirm trace indexes exist:

   ```bash
   set -a; source .env; set +a
   curl -k -u "${OPENSEARCH_USER}:${OPENSEARCH_PASSWORD}" \
     'https://localhost:9200/_cat/indices/otel-v1-apm-span-*?v'
   ```

5. **Dashboards**: refresh the workspace and verify the selected time range includes the new request.

## Check service-map prerequisites

The service map is derived from trace relationships; it is not created from
service names alone. The caller should emit a CLIENT span and the downstream
service should emit a child SERVER span. Both services must propagate the same
W3C trace context.

For eBPF instrumentation, enable context propagation as described in the
[eBPF guide](/docs/send-data/opentelemetry/ebpf-instrumentation/#turn-on-context-propagation).

## Collect useful information before asking for help

When opening an issue, include:

- Operating system and Docker or Finch version
- Installation mode: Docker Compose, Helm, or AWS
- Instrumentation language and exporter protocol
- The exact command used to generate a request
- The relevant Collector and Data Prepper logs
- Whether the trace appears in **Discover** → **Traces**
- The selected Dashboard time range

Do not include credentials or secrets in logs or issue reports.
