# Vendor Compatibility Overlay

User-facing migration guides: https://observability.opensearch.org/docs/send-data/from-vendor/

This overlay adds a dedicated OpenTelemetry Collector that accepts Datadog, Jaeger, and Splunk HEC wire protocols, translates them to OTLP, and forwards to the base collector. No application code changes are required — vendor agents are pointed at observability-stack by changing an endpoint URL.

## Do I need this overlay?

| If your apps emit... | Need this overlay? |
|----------------------|--------------------|
| OpenTelemetry OTLP (gRPC or HTTP) | No. Send directly to the base collector on 4317 or 4318. |
| Datadog (dd-trace-*, DogStatsD) | Yes. |
| Jaeger native wire protocol (`jaeger-client-*`) | Yes. |
| Splunk HEC | Yes. |
| Jaeger via modern OpenTelemetry SDK + OTLP | No. |

## Architecture

```
vendor agents ──▶ otel-collector-compat ──OTLP──▶ otel-collector (base, unchanged) ──▶ Data Prepper / Prometheus ──▶ OpenSearch
                  (this overlay)

OTLP apps ─────────────────────────────────▶ (direct to base, no compat hop)
```

The compat collector uses upstream [`opentelemetry-collector-contrib`](https://github.com/open-telemetry/opentelemetry-collector-contrib) receivers. All enrichment and downstream routing happens in the base pipeline — the compat config is purely ingest + forward.

## Activation

```bash
echo "INCLUDE_COMPOSE_COMPAT=docker-compose.compat.yml" >> .env
docker compose up -d
```

Adds `otel-collector-compat` and the bundled Jaeger `hotrod` demo to the stack.

### Verify it's running

```bash
docker compose ps otel-collector-compat
curl -sI http://localhost:8126/info  # HTTP 200 = Datadog receiver is live
```

## Supported vendors

| Vendor | Receiver(s) | Default ports | Repo notes |
|--------|-------------|---------------|------------|
| Datadog | `datadogreceiver`, `statsdreceiver` | 8126/tcp, 8125/udp | [vendors/datadog/](vendors/datadog/) |
| Jaeger (legacy wire protocol) | `jaegerreceiver` | 14250/tcp, 14268/tcp | [vendors/jaeger/](vendors/jaeger/) |
| Splunk HEC | `splunkhecreceiver` | 8088/tcp | [vendors/splunk/](vendors/splunk/) |

User-facing migration guides live at https://observability.opensearch.org/docs/send-data/from-vendor/.

SignalFx is not supported. The upstream `signalfxreceiver` is deprecated with explicit guidance to migrate to OTLP.

## Deployment modes

Each vendor supports greenfield, side-by-side, and full-replacement modes. See the public migration guide for each vendor for specifics.

## Port customization

Ports are remappable via environment variables. Useful when a real vendor agent already occupies the default port on the host.

| Variable | Default | Receiver |
|----------|---------|----------|
| `COMPAT_DATADOG_APM_PORT` | 8126 | Datadog trace-agent |
| `COMPAT_DATADOG_STATSD_PORT` | 8125 | DogStatsD |
| `COMPAT_JAEGER_GRPC_PORT` | 14250 | Jaeger gRPC |
| `COMPAT_JAEGER_THRIFT_HTTP_PORT` | 14268 | Jaeger Thrift HTTP |
| `COMPAT_SPLUNK_HEC_PORT` | 8088 | Splunk HEC |
| `COMPAT_COLLECTOR_MEMORY_LIMIT` | 256M | Compat collector memory limit |

## Attribute translation

Each receiver translates vendor-specific data to the OpenTelemetry data model. Translation behavior is defined by the upstream receivers. For schema details, consult:

- The upstream receiver READMEs under [`opentelemetry-collector-contrib/receiver/`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver)
- The vendor's own instrumentation and tagging documentation

## Directory layout

```
compat/
├── README.md                      ← this file
├── collector/
│   ├── config.compat.yaml         ← compat collector config
│   └── README.md                  ← compat collector design notes
└── vendors/
    ├── datadog/README.md          ← developer notes + link to migration guide
    ├── jaeger/README.md
    └── splunk/README.md

docker-compose.compat.yml          ← overlay service definitions
```

## Adding a vendor

1. Create `vendors/<name>/README.md` with a link to the (forthcoming) public migration guide and developer notes (receiver used, config location, quick local test).
2. Add the receiver stanza to `collector/config.compat.yaml` and wire it into the appropriate pipeline(s).
3. Add port mappings to `docker-compose.compat.yml`.
4. Add a page at `docs/starlight-docs/src/content/docs/send-data/from-vendor/<name>.md` with the user migration guide.
5. Verify end-to-end: send vendor-format data → confirm it lands in OpenSearch.
