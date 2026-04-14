# Load Test Results

## Baseline Topology (2026-03-20)

### Cluster
- EKS cluster: `observability-stack`, us-west-2
- Kubernetes: 1.32
- Nodes: 2x `m5.xlarge` (4 vCPU, 16 GB RAM each = 8 vCPU / 32 GB total)

### Core Stack Pods
| Component | Replicas | CPU Req | Mem Req | Node |
|-----------|----------|---------|---------|------|
| OpenSearch | 1 (single-node) | 500m | 2Gi (JVM: 1g) | node-1 |
| OpenSearch Dashboards | 1 | 100m | 512M | node-2 |
| OTel Collector | 1 | none | none | node-2 |
| Data Prepper | 2 | none | none | node-1, node-2 |
| Prometheus | 1 (no PV) | none | none | node-2 |

### OpenSearch State
- Cluster status: yellow (3 unassigned replica shards — expected with single node)
- Active shards: 14 primary
- Indices: `otel-v1-apm-span-000001` (111k docs, 57MB), `logs-otel-v1-000001` (7k docs, 12MB), `otel-v2-apm-service-map-000001` (14k docs, 2.8MB)

### Background Load
- OTel Demo: ~20 microservices generating traces/logs/metrics via built-in load generator
- Example agents: travel-planner, weather-agent, events-agent, canary

---

## Test Results

| # | Test | Date | Status | Result File |
|---|------|------|--------|-------------|
| 1 | API Query Load (200 OS VUs + 100 Prom VUs) | 2026-03-20 12:04–12:19 | ⚠️ Auth bug | [001-api-queries-auth-bug.md](results/001-api-queries-auth-bug.md) |
| 2 | API Query Load (300 VUs, auth fixed) | 2026-03-20 12:42–12:57 | ✅ 0% errors, p95=16ms | [002-api-queries.md](results/002-api-queries.md) |
| 3 | API Query Load (1500 VUs) | 2026-03-20 12:57–13:12 | ⚠️ p95=2.28s, 0% errors | [003-api-queries-1500vu.md](results/003-api-queries-1500vu.md) |
| 4 | ALB E2E (1000 VUs from EC2) | 2026-03-20 14:55–14:59 | 🔴 OSD saturated at 100m CPU, 3s+ latency | [004-alb-1000vu-osd-bottleneck.md](results/004-alb-1000vu-osd-bottleneck.md) |
| 5 | ALB E2E (1000 VUs, 3x OSD 2CPU) | 2026-03-20 15:08–15:24 | ⚠️ OSD fixed, OpenSearch at 99% CPU, p95=14.57s | [005-alb-1000vu-opensearch-bottleneck.md](results/005-alb-1000vu-opensearch-bottleneck.md) |
| 6 | ALB E2E (1000 VUs, 3x OS nodes) | 2026-03-20 15:47–16:02 | ⚠️ 37% better throughput, p95=10.57s, uneven shards | [006-alb-1000vu-3node-opensearch.md](results/006-alb-1000vu-3node-opensearch.md) |
| 7 | ALB E2E (1000 VUs, balanced shards) | 2026-03-20 16:18–16:33 | ⚠️ p95=6.32s (+40%), 168 req/s (+62% from baseline) | [007-alb-1000vu-balanced-shards.md](results/007-alb-1000vu-balanced-shards.md) |
| 8 | Pipeline ceiling (telemetrygen) | 2026-04-13 | ✅ Ceiling: ~6K spans/sec | [008-pipeline-ceiling.md](results/008-pipeline-ceiling.md) |
| 9 | API Query Load (500 VUs, ALB) | 2026-04-13 | ⚠️ 96.4% success, p95=29.91s | [009-api-queries-500vu.md](results/009-api-queries-500vu.md) |
| 10 | PromQL Direct (200 VUs) | 2026-04-13 | ✅ 100% success, p95=713ms | [010-promql-200vu.md](results/010-promql-200vu.md) |

## Bottleneck Progression

| Test | Bottleneck | Fix Applied | Result |
|------|-----------|-------------|--------|
| 004 | OSD (100m CPU, 1 replica) | Scaled to 3 replicas, 2 CPU each | ✅ Resolved |
| 005 | OpenSearch (single node, 4 vCPU, 99% CPU) | Scaled to 3 nodes, 2 CPU / 4Gi each | ✅ Improved |
| 006 | Uneven shard distribution across 3 nodes | Set number_of_replicas=2 | ✅ Improved |
| 007 | Primary shard routing preference (Node-0 overloaded) | **Next: search routing or dedicated search nodes** | Pending |
