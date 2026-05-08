# Splunk OTel Distribution POC

Local POC. Inserts Splunk's [OpenTelemetry Collector distribution](https://github.com/signalfx/splunk-otel-collector) between the otel-demo apps and the base `otel-collector`. Demo telemetry fans out to Splunk Observability Cloud and OpenSearch at the same time.

Branch: `feat/splunk-distribution-poc`. Not intended for upstream.

## Dataflow

```
otel-demo apps
     │ OTLP (OTEL_COLLECTOR_HOST=splunk-otel-collector)
     ▼
splunk-otel-collector
     ├── signalfx exporter         → Splunk Infrastructure Monitoring
     ├── otlphttp/splunk-apm       → Splunk APM (ingest/v2/trace/otlp)
     ├── splunk_hec                → Splunk Log Observer (see caveats)
     └── otlp/tee                  → base otel-collector (unchanged OpenSearch path)
```

## Run

```bash
cp .env.splunk-poc.example .env.splunk-poc
# fill in SPLUNK_ACCESS_TOKEN, SPLUNK_REALM, SPLUNK_HEC_TOKEN

# finch compose's --env-file doesn't feed ${VAR} substitution in compose files, only
# container env. Append the POC vars into .env before `up`, restore after.
cat .env.splunk-poc >> .env
finch compose -f docker-compose.yml -f docker-compose.splunk-demo.yml up -d
git checkout -- .env
```

Teardown:

```bash
finch compose -f docker-compose.yml -f docker-compose.splunk-demo.yml down
```

## Verify

Counters on the Splunk collector (send success numbers; non-zero = data flowing):

```bash
finch run --rm --network observability-stack-network curlimages/curl:latest \
  -s http://splunk-otel-collector:8888/metrics \
  | grep -E '^otelcol_exporter_sent_(spans|metric_points)_total'
```

Host-exposed endpoints on `splunk-otel-collector`:

- `localhost:13133` - health check (200 = ready)
- `localhost:14317` - OTLP gRPC
- `localhost:14318` - OTLP HTTP

In Splunk Observability Cloud: **APM > Services** shows demo services (frontend, cart, checkout, ad, recommendation, …). **Infrastructure > Metrics Explorer** shows host metadata from `splunk-otel-collector` and app metrics from the demo.

OpenSearch side is unaffected: Trace Analytics in OSD renders the same demo services via the tee.

## Caveats from validation

- **Splunk HEC logs return HTTP 404** on `/v1/log` with the access token reused as HEC token. The `splunk_hec` exporter retries indefinitely without blocking other pipelines. Logs still land in OpenSearch via `otlp/tee`. Cause is likely one of: access token lacks log-ingest scope, trial tier without Log Observer, or a distinct HEC token is required.
- `smartagentreceiver` and `host_metrics` from Splunk's default `agent_config.yaml` are not included. The first is proprietary to Splunk's distribution bundle; the second is meaningless in a container.

## Reference

- [Splunk OTel Collector distribution](https://github.com/signalfx/splunk-otel-collector)
- [Splunk default `agent_config.yaml`](https://github.com/signalfx/splunk-otel-collector/blob/main/cmd/otelcol/config/collector/agent_config.yaml)
- [signalfxexporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/signalfxexporter)
- [splunkhecexporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/splunkhecexporter)
