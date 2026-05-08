# Splunk OTel Distribution — POC

Runs Splunk's OpenTelemetry Collector distribution as a tee in front of observability-stack's base collector, so demo telemetry lands in both Splunk Observability Cloud and OpenSearch at the same time.

Local POC only. Not a production configuration, not part of the default stack.

## Dataflow

```
otel-demo apps
     │ OTLP
     ▼
splunk-otel-collector (Splunk distribution)
     │
     ├── signalfx         → Splunk Infrastructure Monitoring
     ├── otlphttp         → Splunk APM (trace OTLP endpoint)
     ├── splunk_hec       → Splunk Log Observer
     └── otlp (tee)       → otel-collector → Data Prepper → OpenSearch (unchanged)
```

Demo apps are redirected via `OTEL_COLLECTOR_HOST=splunk-otel-collector` (set in `.env.splunk-poc`). No demo code changes required.

## Run

```bash
# From the repo root
cp .env.splunk-poc.example .env.splunk-poc
# edit .env.splunk-poc with your Splunk Access Token, Realm, HEC Token

docker compose \
  --env-file .env --env-file .env.splunk-poc \
  -f docker-compose.yml \
  -f docker-compose.otel-demo.yml \
  -f docker-compose.splunk-demo.yml \
  up -d
```

## Verify

Splunk Observability Cloud (URL varies by realm, e.g. `https://app.us1.signalfx.com`):

- **APM → Services** — look for demo services (frontend, cart, checkout, ad, ...)
- **Infrastructure → Metrics Explorer** — filter on `service.name`
- **Log Observer** — filter on `sourcetype=otel`, `source=otel-demo`

OpenSearch Dashboards (http://localhost:5601 by default):

- Trace Analytics — same demo services should appear in the existing OSD trace UI
- Discover on `logs-otel-v1-*` — log records from the demo

Splunk collector's own health endpoint: `http://localhost:13133`.

Splunk collector's exposed OTLP ports on the host (non-default to avoid collision with base collector):

- gRPC: `localhost:14317`
- HTTP: `localhost:14318`

## Dev commands

```bash
# Tail Splunk collector logs
docker logs -f splunk-otel-collector

# Verify collector internal metrics (self-monitoring)
curl -s http://localhost:13133

# Tear down just the Splunk overlay
docker compose -f docker-compose.yml -f docker-compose.otel-demo.yml -f docker-compose.splunk-demo.yml rm -sf splunk-otel-collector
```

## Scope

- **Out of scope:** `smartagentreceiver` (proprietary to Splunk's distribution, requires host bundle), `host_metrics` (meaningless in Docker), discovery mode, gateway forwarding.
- **In scope:** OTLP traces/metrics/logs from the otel-demo apps, fanned out to Splunk Observability Cloud + OpenSearch.

## References

- [Splunk OpenTelemetry Collector distribution](https://github.com/signalfx/splunk-otel-collector)
- [Splunk agent_config.yaml](https://github.com/signalfx/splunk-otel-collector/blob/main/cmd/otelcol/config/collector/agent_config.yaml) — reference for the fuller config this one is trimmed from
- [signalfxexporter README](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/signalfxexporter)
- [splunkhecexporter README](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/splunkhecexporter)
