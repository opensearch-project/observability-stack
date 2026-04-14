# Test 001: API Query Load (Auth Bug)

**Status:** ⚠️ Invalid — OpenSearch auth failure  
**Script:** `k6/scenarios/api-queries.js`  
**Start:** 2026-03-20 12:04:00 PDT  
**End:** 2026-03-20 12:19:01 PDT  
**Duration:** 15m01s  

## Parameters
- OpenSearch VUs: 200 (ramping)
- Prometheus VUs: 100 (ramping)
- Total peak VUs: 300
- Background: OTel Demo load generator active

## Summary

| Metric | Value |
|--------|-------|
| Total iterations | 81,422 |
| Total HTTP requests | 217,392 |
| Requests/sec | 241 |
| http_req_duration p(50) | 1.12ms |
| http_req_duration p(90) | 2.47ms |
| http_req_duration p(95) | 3.45ms |
| http_req_duration max | 139.92ms |
| http_req_failed | 75.27% |

## Per-Check Breakdown

| Check | Pass | Fail | Rate | Notes |
|-------|------|------|------|-------|
| PPL 2xx | 0 | 54,548 | 0% | Auth failure |
| Search 2xx | 0 | 54,548 | 0% | Auth failure |
| ServiceMap 2xx | 0 | 54,548 | 0% | Auth failure |
| PromQL instant 2xx | 26,874 | 0 | 100% | ✅ |
| PromQL range 2xx | 26,874 | 0 | 100% | ✅ |

## Root Cause

k6's `auth: 'basic'` parameter with spread `...OS_AUTH` does not work as expected. OpenSearch returned immediate rejections (avg 1.6ms response = 401/403, not timeout). All OpenSearch data points are invalid.

## Valid Takeaway

Prometheus (single pod, no resource limits) handled 100 concurrent VUs doing instant + range PromQL queries with 100% success and p95 of 3.45ms. Not stressed at this level.

## Fix Applied

Switched to manual `Authorization: Basic <base64>` header using `k6/encoding` module.
