---
title: "Splunk HEC"
description: "Route Splunk HTTP Event Collector traffic into OpenSearch"
---

Point Splunk HTTP Event Collector (HEC) clients at observability-stack by changing the collector URL. No application code changes required.

## Which path applies to your setup?

| If you use... | Use |
|---------------|-----|
| HEC API clients (curl, scripts, HEC-compatible libraries) | The **HEC endpoint** below. |
| Splunk Universal Forwarders configured with HEC output | The **HEC endpoint** below. |
| Splunk Universal Forwarders in default mode (S2S protocol) | **Not supported.** No open-source OpenTelemetry receiver exists for the Splunk forwarder-to-forwarder protocol. Reconfigure forwarders to use HEC output, or replace them with an OpenTelemetry-native log shipper. |

All supported paths require the compat overlay to be enabled. See the [overview](/docs/send-data/from-vendor/).

## Protocol support

| Signal | Default port | Upstream stability |
|--------|--------------|--------------------|
| Logs (HEC JSON events) | 8088/tcp | Beta |
| Metrics (HEC metric events) | 8088/tcp | Beta |

Traces are not wired in the default compat configuration.

For current behavior, consult the upstream [`splunkhecreceiver` README](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/splunkhecreceiver).

## Configuration

Point existing HEC clients at observability-stack's compat collector:

```
http://<observability-stack-host>:8088/services/collector
```

The default compat configuration listens on HTTP (no TLS). Real Splunk HEC deployments typically use HTTPS. For non-localhost deployments, add `tls` receiver config and update client URLs to `https://`.

Raw log events can be POSTed to `/services/collector/raw` (newline-separated) in addition to JSON events on any collector path.

## Canonical metadata mapping

The upstream receiver exposes four HEC metadata fields as OpenTelemetry attribute mappings, configurable via `hec_metadata_to_otel_attrs`:

| HEC metadata | Default OTel attribute |
|--------------|------------------------|
| `source` | `com.splunk.source` |
| `sourcetype` | `com.splunk.sourcetype` |
| `index` | `com.splunk.index` |
| `host` | `host.name` |

For event payload details (the `event` field, custom `fields` objects, multi-event batches), consult Splunk's [HEC documentation](https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector).

## Deployment modes

1. **Greenfield** — compat collector binds HEC port 8088.
2. **Side-by-side** — real Splunk HEC and compat collector on different ports. Set `COMPAT_SPLUNK_HEC_PORT=8089` and configure a subset of clients to use the new port. Useful for A/B validation during migration.
3. **Full replacement** — Splunk decommissioned, compat collector on 8088.

## Verify

Send a test event to the compat collector:

```bash
curl -X POST http://localhost:8088/services/collector \
  -H "Authorization: Splunk any-token" \
  -H "Content-Type: application/json" \
  -d '{"event":"hello","sourcetype":"manual","source":"curl"}'
# {"text": "Success", "code": 0}
```

## What lands in OpenSearch

An HEC event with `sourcetype=nginx:access` and `source=/var/log/nginx/access.log` becomes a log record in the `logs-otel-v1-*` index with:

- `attributes.com.splunk.sourcetype`: `nginx:access`
- `attributes.com.splunk.source`: `/var/log/nginx/access.log`
- `body`: the event payload

## Caveats

- **No auth validation.** The default compat configuration accepts any `Authorization: Splunk <token>` header. Add an auth extension for production deployments.
- **No TLS.** The default compat configuration listens on HTTP. Add `tls` receiver config for non-localhost deployments.
- **`host.name` may be overridden downstream.** The receiver maps the HEC `host` field to OTel `host.name`, but the base collector's resource detection typically overrides `host.name` with the collector's own hostname. If you rely on the HEC `host` field for per-sender identification, route it to a different attribute via `hec_metadata_to_otel_attrs`, or disable resource detection in the base collector.
- **Python `logging` severities do not translate.** HEC does not have a native severity field. The `severityText` and `severityNumber` on the resulting OTel log records will be empty. Extract severity from the message body via a log parser in the pipeline if you need it.
- **HEC client libraries vary in how they ship custom fields.** Only clients that use HEC's `fields` object will produce OTel log attributes in OpenSearch. Clients that serialize structured data into the `event` message body (e.g., `splunk_handler` for Python) will have those fields embedded in `body` rather than broken out as attributes. Verify your client's behavior before relying on field-level queries.

## Not covered

- **Splunk forwarder-to-forwarder (S2S) protocol** — no open-source OpenTelemetry receiver exists.
- **SPL queries** — use [PPL (Piped Processing Language)](https://opensearch.org/docs/latest/search-plugins/ppl/index/) in OpenSearch.
- **Splunk apps, dashboards, alerts** — rebuild in OpenSearch Dashboards.
- **SignalFx** — the upstream `signalfxreceiver` is deprecated with explicit guidance to migrate to OTLP. Re-instrument SignalFx-monitored services with OpenTelemetry SDKs.

## References

- [`splunkhecreceiver` README](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/splunkhecreceiver)
- [Splunk HEC documentation](https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector)
- [`pkg/translator/splunk`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/pkg/translator/splunk)
