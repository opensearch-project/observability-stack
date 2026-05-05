# Splunk HEC

Migration guide and user-facing documentation: https://observability.opensearch.org/docs/send-data/from-vendor/splunk/

## Receiver used

- [`splunkhecreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/splunkhecreceiver) — Splunk HTTP Event Collector (8088/tcp)

Config: [`../../collector/config.compat.yaml`](../../collector/config.compat.yaml) — `splunk_hec:` receiver block.

Wired into the logs and metrics pipelines. Traces are not wired in the default compat config.

## Quick local test

```bash
curl -X POST http://localhost:8088/services/collector \
  -H "Authorization: Splunk any-token" \
  -H "Content-Type: application/json" \
  -d '{"event":"hello","sourcetype":"manual","source":"curl"}'
# {"text": "Success", "code": 0}
```

Events land in OpenSearch under `logs-otel-v1-*`. View via Discover Logs in OpenSearch Dashboards.
