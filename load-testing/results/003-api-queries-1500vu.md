# Test 003: API Query Load — 1500 VUs (Finding the Ceiling)

**Status:** ⚠️ Passed but showing significant latency degradation  
**Script:** `k6/scenarios/api-queries.js`  
**Start:** 2026-03-20 12:57:50 PDT (19:57:50 UTC)  
**End:** 2026-03-20 13:12:53 PDT (20:12:53 UTC)  
**Duration:** 15m03s  

## Parameters
- OpenSearch VUs: 1000 (ramping)
- Prometheus VUs: 500 (ramping)
- Total peak VUs: 1500
- Background: OTel Demo load generator active

## Summary

| Metric | Test 002 (300 VUs) | Test 003 (1500 VUs) | Delta |
|--------|-------------------|---------------------|-------|
| Total requests | 215,779 | 771,403 | 3.6x |
| Requests/sec | 239 | 855 | 3.6x |
| http_req_duration p(50) | 5.93ms | 13.67ms | 2.3x ⚠️ |
| http_req_duration p(90) | 12.34ms | 1.04s | 84x 🔴 |
| http_req_duration p(95) | 16.15ms | 2.28s | 141x 🔴 |
| http_req_duration max | 543ms | 5.49s | 10x 🔴 |
| http_req_failed | 0.00% | 0.00% | — |
| Data received | 11 GB | 34 GB | 3x |

## Analysis

**No errors, but the system is clearly saturated at 1500 VUs.**

- p50 only doubled (5.9ms → 13.7ms) — the median request is still fast
- p90 exploded from 12ms to 1.04s — the tail is getting crushed
- p95 hit 2.28s — approaching the 5s threshold
- Max latency hit 5.49s — individual requests are timing out
- Iteration duration p95 hit 5.16s (vs 2.91s at 300 VUs)

**The breaking point is between 300 and 1500 VUs.** The system handles the load without errors but latency degrades severely. At 1500 VUs, 10% of requests take over 1 second and 5% take over 2.3 seconds.

**For a dashboard user experience**, p95 > 2s means the UI feels sluggish. A reasonable "usable" threshold would be p95 < 500ms, which was comfortably met at 300 VUs but blown past at 1500.

## Estimated Capacity

| User Experience | Estimated Max VUs | p95 Latency |
|----------------|-------------------|-------------|
| Excellent (< 100ms p95) | ~300 | 16ms |
| Good (< 500ms p95) | ~500-700 (estimated) | ~500ms |
| Degraded (< 2s p95) | ~1200-1500 | ~2s |
| Broken (errors appear) | > 1500 (not yet found) | > 5s |

## Next Steps
- Run Test 004 at TARGET_VUS=500 to find the "good experience" ceiling
- Or jump to TARGET_VUS=2000 to find where errors actually start
