# Test 002: API Query Load (Auth Fixed)

**Status:** ✅ Passed — no failures  
**Script:** `k6/scenarios/api-queries.js`  
**Start:** 2026-03-20 12:42:14 PDT (19:42:14 UTC)  
**End:** 2026-03-20 12:57:16 PDT (19:57:16 UTC)  
**Duration:** 15m02s  

## Parameters
- OpenSearch VUs: 200 (ramping 0→50→100→200, hold 3m, ramp down)
- Prometheus VUs: 100 (ramping 0→25→50→100, hold 3m, ramp down)
- Total peak VUs: 300
- Background: OTel Demo load generator active

## Summary

| Metric | Value |
|--------|-------|
| Total iterations | 80,879 |
| Total HTTP requests | 215,779 |
| Requests/sec | 239 |
| http_req_duration p(50) | 5.93ms |
| http_req_duration p(90) | 12.34ms |
| http_req_duration p(95) | 16.15ms |
| http_req_duration max | 543.18ms |
| http_req_failed | 0.00% |
| Data received | 11 GB (12 MB/s) |

## Per-Check Breakdown

| Check | Pass | Fail | Rate |
|-------|------|------|------|
| PPL 2xx | 54,148 | 0 | 100% ✅ |
| Search 2xx | 54,148 | 0 | 100% ✅ |
| ServiceMap 2xx | 54,148 | 0 | 100% ✅ |
| PromQL instant 2xx | 26,667 | 0 | 100% ✅ |
| PromQL range 2xx | 26,668 | 0 | 100% ✅ |

## Analysis

**The stack did not break at 300 concurrent API VUs (200 OpenSearch + 100 Prometheus).**

- All thresholds passed: p95 latency 16.15ms (well under 5s threshold), 0% error rate
- OpenSearch single node handled 200 concurrent PPL + _search + service map queries without degradation
- Prometheus single pod handled 100 concurrent instant + range PromQL queries at p95 of ~16ms
- Max latency spike was 543ms — a single outlier, not sustained degradation
- Throughput was steady at ~239 req/s throughout the hold period

**Conclusion:** 300 VUs is not the breaking point. Need to ramp significantly higher (500–1000+ VUs) to find where things start to degrade.

## Next Steps
- Run Test 003 with TARGET_VUS=500 (750 total VUs) to push harder
- If that holds, jump to TARGET_VUS=1000
