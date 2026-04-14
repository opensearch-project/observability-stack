# 010 — PromQL Direct Load (200 VUs)

**Date:** 2026-04-13
**Config:** Prometheus single pod (no PV), 9 scrape targets, ~15d retention
**Tool:** k6 (K8s Job, in-cluster, direct to Prometheus)
**Duration:** 10 minutes (ramping: 1m→100, 3m→200, 5m→200, 1m→0)

## Results

| Metric | Value |
|---|---|
| Total queries | 163,466 |
| Success rate | **100%** |
| Throughput | 272 req/s |
| p95 latency | 713ms |
| p90 latency | 522ms |
| Median latency | 179ms |
| Max latency | 2.45s |
| Errors | 0 |
| Data received | 598 MB |

### Query Mix

- 70% instant queries (up, rates, aggregations, topk)
- 30% range queries (30-minute window, 15s step)

## Findings

- **Prometheus handles 200 concurrent PromQL users with sub-second p95 latency**
- Zero errors across 163K queries
- No bottleneck found at this load level — Prometheus has significant headroom
- Range queries (30-min window) are the heavier operations but still within budget
- This is in stark contrast to OpenSearch search performance under similar load
