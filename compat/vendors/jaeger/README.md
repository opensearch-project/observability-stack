# Jaeger

Migration guide and user-facing documentation: https://observability.opensearch.org/docs/send-data/from-vendor/jaeger/

Jaeger is an open-source CNCF project rather than a proprietary vendor. This directory exists because users migrating from Jaeger deployments typically look for it alongside other vendor integrations.

## Receiver used

- [`jaegerreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/jaegerreceiver) — Jaeger native wire protocol (Thrift HTTP on 14268/tcp, gRPC on 14250/tcp)

Config: [`../../collector/config.compat.yaml`](../../collector/config.compat.yaml) — `jaeger:` receiver block.

Modern Jaeger apps emit OTLP natively and bypass this overlay. The bundled `hotrod` demo (port 8080) is configured this way and exercises the base collector directly.

## Quick local test

```bash
# Trigger the bundled hotrod demo (OTLP path)
curl http://localhost:8080/dispatch?customer=123

# View traces at http://localhost:5601 → Trace Analytics
```

The legacy Thrift HTTP path is harder to exercise without a `jaeger-client-*` app. See the upstream receiver README for wire format details.
