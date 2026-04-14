# 009 — API Query Load (500 VUs, ALB)

**Date:** 2026-04-13
**Config:** 3 OpenSearch nodes, 3 OSD replicas, ALB ingress, ~1.7M spans indexed
**Tool:** k6 (EC2 load generator, in-VPC)
**Duration:** 15 minutes (ramping: 2m→125, 3m→250, 5m→500, 3m→500, 2m→0)

## Results

| Metric | Value |
|---|---|
| Total requests | 38,947 |
| Success rate | 96.4% |
| Throughput | 42.8 req/s |
| p95 latency | 29.91s |
| p90 latency | 26.46s |
| Data received | 1.7 GB |

### By Query Type

| Query Type | Success | Failure | Rate |
|---|---|---|---|
| PPL (traces) | 11,719 | 3 | 99.97% |
| PPL (logs) | 7,938 | 2 | 99.97% |
| Search (_search) | 6,167 | 1,410 | **81.4%** |
| Dashboards list | 27,570 | 0 | 100% |
| ServiceMap | 27,190 | 0 | 100% |

## Findings

- **Search queries are the bottleneck** — 81% success vs 99%+ for PPL and metadata queries
- p95 of 29.91s indicates OpenSearch is saturated under concurrent search load with ~1.7M docs
- PPL queries perform significantly better than raw _search under load
- Dashboards list and ServiceMap endpoints handle 500 VUs with zero errors
- Compared to test 007 (1000 VUs, 168 req/s, p95=6.32s with ~316MB data): more data = worse search performance
