# Datadog

Migration guide and user-facing documentation: https://observability.opensearch.org/docs/send-data/from-vendor/datadog/

## Receivers used

- [`datadogreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/datadogreceiver) — traces, metrics, logs (8126/tcp)
- [`statsdreceiver`](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/statsdreceiver) — DogStatsD (8125/udp)

Config: [`../../collector/config.compat.yaml`](../../collector/config.compat.yaml) — `datadog:` and `statsd:` receiver blocks.

## Quick local test

```bash
# DogStatsD metric
echo "test.metric:1|c|#env:dev" | nc -u -w1 localhost 8125

# HEC-style trace payload (msgpack) — see upstream receiver README for format details
```

Traces are best exercised by pointing a `dd-trace-*` SDK application at `localhost:8126`.
