# Observability Stack Load Testing Plan

## Goal

Determine the breaking points and concurrent user capacity of the Observability Stack for a given Helm deployment. Testing is manual (not CI-automated) and covers both backend ingestion throughput and frontend dashboard responsiveness.

## Test Environment

The load tests assume a Helm deployment with the following baseline configuration:

- Chart: `observability-stack` (see `charts/observability-stack/`)
- OpenTelemetry Demo: **enabled** — full microservices e-commerce app generating realistic telemetry via built-in load generator
- Prometheus: single pod
- OpenSearch: single node (`singleNode: true`) for initial tests, scaled to 3 nodes for later tests
- OTel demo services provide baseline ingestion load (traces, logs, metrics from ~20 microservices)

See [AGENTS.md](AGENTS.md) for environment setup, prerequisites, and exact commands to run tests.

## Architecture Under Test

```
telemetrygen / OSB
       │
       ▼
OTel Collector (4317/4318)
       │
       ├──► Data Prepper ──► OpenSearch (logs, traces)
       └──► Prometheus (metrics, single pod)
                │
                ▼
       OpenSearch Dashboards
         ├── Discover (queries OpenSearch)
         ├── Trace Analytics (queries OpenSearch)
         ├── Metric Panels (queries Prometheus)
         └── PPL queries (queries OpenSearch)
```

## Tools

| Tool | Purpose | Install |
|------|---------|---------|
| [OpenSearch Benchmark (OSB)](https://github.com/opensearch-project/OpenSearch-Benchmark) | Direct OpenSearch indexing/query load + redline testing | `pip install opensearch-benchmark` |
| [telemetrygen](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/cmd/telemetrygen) | OTLP trace/log/metric generation through the full pipeline | `go install github.com/open-telemetry/opentelemetry-collector-contrib/cmd/telemetrygen@latest` |
| [k6 + browser module](https://grafana.com/docs/k6/latest/using-k6-browser/) | HTTP API load + real browser UI simulation | `brew install k6` (browser module is built-in) |

## Test Layers

### Layer 1: OpenSearch Capacity (OSB Direct)

Bypasses the pipeline to find OpenSearch's own ceiling.

**What it tests:** Indexing throughput (docs/sec), query latency under load, heap pressure, thread pool rejections.

**How:**
```bash
# Redline test — auto-ramps until the cluster breaks
opensearch-benchmark execute-test \
  --target-hosts=https://opensearch:9200 \
  --pipeline=benchmark-only \
  --workload=pmc \
  --client-options="use_ssl:true,verify_certs:false,basic_auth_user:$OSD_USER,basic_auth_password:$OSD_PASSWORD" \
  --redline-test
```

**Custom workload (TODO):** Create an OSB workload that uses trace/log document shapes matching our `otel-v1-apm-span-*` and `otel-v1-apm-log-*` indices for realistic testing.

**Metrics to watch:**
- Indexing throughput (docs/sec)
- p50/p95/p99 query latency
- `_nodes/stats`: heap used %, thread pool rejected count, merge times
- Pod CPU/memory via `kubectl top pod`

### Layer 2: Pipeline Throughput (telemetrygen → OTel Collector)

Tests the full ingestion path: OTel Collector → Data Prepper → OpenSearch.

**What it tests:** End-to-end pipeline capacity, backpressure behavior, which component saturates first.

**How:**
```bash
# Traces — ramp up spans/sec until pipeline drops data
telemetrygen traces \
  --otlp-endpoint=otel-collector:4317 \
  --otlp-insecure \
  --rate=100 \
  --duration=5m \
  --service=load-test-agent \
  --otlp-attributes='gen_ai.agent.name="load-test"'

# Logs
telemetrygen logs \
  --otlp-endpoint=otel-collector:4317 \
  --otlp-insecure \
  --rate=100 \
  --duration=5m \
  --service=load-test-agent

# Metrics
telemetrygen metrics \
  --otlp-endpoint=otel-collector:4317 \
  --otlp-insecure \
  --rate=50 \
  --duration=5m \
  --service=load-test-agent
```

Increase `--rate` in increments (100 → 500 → 1000 → 5000) until failures appear.

**Metrics to watch:**
- Collector: `otelcol_exporter_sent_spans` vs `otelcol_exporter_send_failed_spans`
- Collector: `otelcol_processor_batch_timeout_trigger_send` (batch pressure)
- Data Prepper: pipeline queue depth, processing latency
- OpenSearch: bulk indexing rejection rate
- End-to-end latency: time from telemetrygen send to document appearing in OpenSearch

### Layer 3: Dashboard UI Under Load (k6)

Simulates concurrent users interacting with OpenSearch Dashboards while the cluster is under ingestion load from Layers 1-2.

**What it tests:** Dashboard responsiveness, PPL query performance, Prometheus query capacity (single pod), OSD server memory/CPU.

#### Scenarios

| # | Scenario | Target Backend |
|---|----------|----------------|
| 1 | **Dashboard viewer** — Open saved dashboard, wait for panels, change time range, refresh | OpenSearch + Prometheus |
| 2 | **Discover explorer** — Select log index, run PPL query, paginate results | OpenSearch |
| 3 | **Trace analytics** — View traces list, click into a trace, expand spans, view service map | OpenSearch |
| 4 | **Expensive PPL** — High-cardinality aggregations, long time ranges, `dedup`, `stats ... by` | OpenSearch |
| 5 | **Metrics explorer** — Open metric visualizations, PromQL queries, change time range to 7d | **Prometheus (single pod)** |
| 6 | **APM browser** — Services list, click service, view latency/error panels, drill into operations | OpenSearch + Prometheus |

#### k6 Test Structure

Two scenario types run concurrently in a single k6 test:

**API-level VUs (high scale):** Replay the HTTP requests that OSD makes under the hood. Scales to hundreds of concurrent users.

- `POST _plugins/_ppl` — PPL queries of varying complexity
- `POST _search` — Discover-style searches against trace/log indices
- `GET prometheus:9090/api/v1/query_range` — PromQL queries mirroring metric panels
- `GET _dashboards/api/saved_objects` — Dashboard/visualization loads

**Browser VUs (low scale, high fidelity):** Real Chromium sessions clicking through OSD. 5-20 concurrent sessions.

- Login → navigate to Traces → click trace → expand spans
- Login → Discover → run PPL → paginate
- Login → Dashboard → change time range → wait for render

#### Ramp-Up Strategy (Finding Breaking Points)

```
Phase 1: API-only ramp
  0 → 50 → 200 → 500 VUs over 15 min
  Find: p95 latency spike, first errors

Phase 2: Browser users on top
  Hold API at ~70% of Phase 1 breaking point
  Add 5 → 10 → 15 → 20 browser VUs
  Find: OSD pod OOM, page load > 10s

Phase 3: Combined with ingestion
  Run telemetrygen at ~70% of Layer 2 breaking point
  Repeat Phase 1+2
  Find: degradation from concurrent read+write load
```

#### Prometheus-Specific Stress

Since Prometheus is a single pod, dedicate specific API VUs to PromQL queries:

- `rate(gen_ai_usage_input_tokens_total[5m])` — simple
- `sum by (service_name, agent_name, model) (rate(gen_ai_usage_input_tokens_total[5m]))` — high cardinality fan-out
- Same queries with `[7d]` range — memory-heavy
- Multiple concurrent `query_range` requests with overlapping time windows

**Metrics to watch:**
- Prometheus pod CPU/memory (`kubectl top pod`)
- Prometheus query duration (`prometheus_engine_query_duration_seconds`)
- Prometheus query failures (`prometheus_engine_queries_concurrent_max`)
- OSD response times for metric panels

### k6 Thresholds

```javascript
thresholds: {
  // API-level
  http_req_duration: ['p(95)<3000'],       // API queries under 3s
  http_req_failed: ['rate<0.05'],          // <5% error rate

  // Browser-level
  browser_web_vital_lcp: ['p(95)<4000'],   // Largest Contentful Paint under 4s
  browser_web_vital_cls: ['p(95)<0.25'],   // Cumulative Layout Shift
}
```

## Execution Order

1. **Layer 1** — Run OSB redline test to establish OpenSearch ceiling (no other load)
2. **Layer 2** — Run telemetrygen ramp to find pipeline throughput limit (no UI load)
3. **Layer 3 Phase 1** — API-only k6 ramp (no ingestion load) to find query capacity
4. **Layer 3 Phase 2** — Add browser VUs to find OSD/Prometheus limits
5. **Layer 3 Phase 3** — Combine: telemetrygen at 70% + k6 at 70% to find real-world capacity
6. **Report** — Document breaking points, bottleneck component, and max concurrent users per capacity tier

## Expected Bottleneck Order (Hypothesis)

1. **Prometheus (single pod)** — likely first to degrade under concurrent metric queries with long time ranges
2. **Data Prepper** — pipeline queue saturation under high ingestion rates
3. **OpenSearch Dashboards** — Node.js server memory under many concurrent browser sessions
4. **OpenSearch** — heap pressure from concurrent expensive queries + indexing

## Deliverables

- [ ] OSB custom workload matching our trace/log document shapes
- [ ] telemetrygen wrapper script with incremental rate steps
- [ ] k6 test scripts for all 6 UI scenarios (API + browser)
- [ ] Results report: breaking points per component, max concurrent users, resource utilization graphs
- [ ] Capacity recommendations: pod sizing for N concurrent users

## Directory Structure

```
load-testing/
├── README.md              # This file — test plan and methodology
├── AGENTS.md              # Runbook for AI assistants (exact commands)
├── RESULTS.md             # Test result index with bottleneck progression
├── SIZING.md              # Capacity sizing chart and projections
├── results/               # Individual test result write-ups
│   └── NNN-description.md
├── osb/
│   ├── run-osb.sh         # OpenSearch Benchmark runner
│   ├── workload.json      # Custom OSB workload for trace/log shapes
│   └── index-settings.json
├── pipeline/
│   └── run-telemetrygen.sh # Incremental rate ramp script
├── k6/
│   ├── full-test.js       # Combined ramp-up test
│   └── scenarios/
│       ├── api-queries.js      # API-level: direct OpenSearch/Prometheus
│       ├── api-queries-alb.js  # API-level: through ALB/OSD
│       ├── browser-traces.js   # Browser: trace analytics flow
│       ├── browser-discover.js # Browser: discover + PPL flow
│       └── browser-metrics.js  # Browser: metric panels flow
├── terraform/
│   ├── main.tf                 # EC2 load generator provisioning
│   └── terraform.tfvars.example
└── run-remote.sh          # Upload + run helper
```

## References

- [OpenSearch Benchmark docs](https://opensearch.org/docs/latest/benchmark/)
- [OSB Redline Testing](https://opensearch.org/blog/redline-testing-now-available-in-opensearch-benchmark/)
- [telemetrygen](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/cmd/telemetrygen)
- [k6 Browser Module](https://grafana.com/docs/k6/latest/using-k6-browser/)
- [OpenSearch PPL API](https://docs.opensearch.org/latest/sql-and-ppl/sql-and-ppl-api/index/)
- [Prometheus Query API](https://prometheus.io/docs/prometheus/latest/querying/api/)
