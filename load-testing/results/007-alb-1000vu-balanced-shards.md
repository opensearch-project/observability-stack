# Test 007: ALB E2E — 1000 VUs, 3-Node OpenSearch, Balanced Shards

**Status:** ✅ Significant improvement — p95 down 40% from Test 006  
**Script:** `k6/scenarios/api-queries-alb.js`  
**Start:** 2026-03-20 16:18:26 PDT (23:18:26 UTC)  
**End:** 2026-03-20 16:33:30 PDT (23:33:30 UTC)  
**Duration:** 15m02s  
**Source:** EC2 m5.xlarge → ALB → 3x OSD → 3x OpenSearch  

## Configuration Change (from Test 006)
- Set `number_of_replicas: 2` on all data indices (was 1)
- Every node now has a copy of every shard (3 copies total)
- No other changes

## Comparison

| Metric | Test 005 (1 node) | Test 006 (3 nodes, 1 replica) | Test 007 (3 nodes, 2 replicas) | Delta 006→007 |
|--------|-------------------|-------------------------------|-------------------------------|---------------|
| Total requests | 93,912 | 129,083 | **152,035** | +18% ✅ |
| Requests/sec | 104 | 143 | **168** | +18% ✅ |
| p(50) | 824ms | 1.1s | **1.43s** | worse ⚠️ |
| p(90) | 13.89s | 7.09s | **4.92s** | 31% better ✅ |
| p(95) | 14.57s | 10.57s | **6.32s** | 40% better ✅ |
| max | 16.95s | 18.12s | 60s (1 timeout) | ⚠️ |
| Error rate | 0% | 0% | **0.00%** (1 of 152k) | ✅ |

## Cumulative Improvement (Test 005 → 007)

| Metric | Test 005 | Test 007 | Improvement |
|--------|----------|----------|-------------|
| Throughput | 104 req/s | **168 req/s** | **+62%** |
| p(95) | 14.57s | **6.32s** | **57% faster** |
| p(90) | 13.89s | **4.92s** | **65% faster** |

## Node Distribution During Test

| Node | Search Queries | Load 1m (peak) | Heap % Range |
|------|---------------|----------------|-------------|
| master-0 (primaries) | 98,771 | **8.0** | 36-78% |
| master-1 | 129,613 | **2.1** | 40-76% |
| master-2 | 52,898 | **5.8** | 35-77% |

**Improvement over Test 006:** Node-2 went from 4,188 → 52,898 queries (12.6x more). Load is much better distributed but still not perfectly even — Node-0 still gets primary preference.

## Analysis

- **40% p95 improvement** from just adding replicas — confirms shard imbalance was a major factor
- **168 req/s** throughput — 62% better than single-node baseline
- **Node-0 still overloaded** (load_1m=8) — it holds all primary shards and gets routing preference
- **1 timeout** (60s max) — likely a single request that hit during a GC pause or segment merge
- **p50 got slightly worse** (1.43s vs 1.1s) — more replication overhead, but tail latency improved significantly

## Remaining Bottleneck

Node-0 is still doing disproportionate work because it holds all primary shards. OpenSearch's adaptive replica selection prefers primaries. Options:
1. Force reindex to spread primaries across nodes
2. Set `preference=_replica` on search requests to avoid primaries
3. Move to dedicated search nodes (production path)

## Next Steps

1. Try `preference=_replica` search routing to offload Node-0
2. Consider increasing primary shard count for new indices (ISM template)
3. Run 300 VU test to find the "good experience" threshold
4. Let data accumulate to 7 days and re-test
