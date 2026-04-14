# Test 006: ALB E2E — 1000 VUs, 3-Node OpenSearch Cluster

**Status:** ⚠️ Improved but p95 still high — uneven shard distribution  
**Script:** `k6/scenarios/api-queries-alb.js`  
**Start:** 2026-03-20 15:47:44 PDT (22:47:44 UTC)  
**End:** 2026-03-20 16:02:47 PDT (23:02:47 UTC)  
**Duration:** 15m01s  
**Source:** EC2 m5.xlarge → ALB → 3x OSD → 3x OpenSearch  

## Configuration Changes (from Test 005)
- OpenSearch: 1 node (500m CPU, 2Gi, 1Gi JVM) → **3 nodes (2 CPU, 4Gi, 2Gi JVM each)**
- EKS: 2 nodes → **4 nodes** (m5.xlarge)

## Comparison

| Metric | Test 005 (1 OS node) | Test 006 (3 OS nodes) | Delta |
|--------|---------------------|----------------------|-------|
| Total requests | 93,912 | **129,083** | +37% ✅ |
| Requests/sec | 104 | **143** | +37% ✅ |
| p(50) | 824ms | **1.1s** | worse ⚠️ |
| p(90) | 13.89s | **7.09s** | 49% better ✅ |
| p(95) | 14.57s | **10.57s** | 27% better ✅ |
| max | 16.95s | 18.12s | similar |
| Error rate | 0% | **0%** | ✅ |
| Data received | 5.4 GB | **7.3 GB** | +35% |

## Cluster Observations During Test

| Node | Heap % | Load 1m | Search Queries | Search Queue Peak |
|------|--------|---------|----------------|-------------------|
| master-0 | 36-67% | **6-8** | 14,422 | 26 |
| master-1 | 47-78% | **1.9-2.8** | 18,886 | 23 |
| master-2 | 38-76% | **1.1-1.9** | 4,188 | 1 |

**Key finding: Uneven shard distribution.** Node-2 handled only 4,188 searches vs 18,886 on Node-1. The shards from the original single-node cluster are concentrated on Node-0 and Node-1. Node-2 has few shards and is underutilized.

## Analysis

- **37% more throughput** (143 vs 104 req/s) — the extra nodes help
- **p90 halved** (7s vs 14s) — significant improvement in tail latency
- **Still too slow** — p95 of 10.57s means 5% of requests take >10 seconds
- **Uneven load** — Node-2 is barely working while Node-0 is overloaded (load_1m=8)
- **Zero rejections** — search thread pools not overflowing

## Root Cause

Shard allocation is unbalanced. The original indices were created with 1 primary shard on the single node. With 3 nodes, the primary stays on one node and replicas go to others, but the search routing still favors the primary.

## Next Steps

1. **Rebalance shards** — force shard reallocation or increase replica count
2. **Increase shard count** — more shards = better distribution across nodes
3. **Consider dedicated search nodes** — for full isolation (requires remote store)
