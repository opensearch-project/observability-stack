# Test 004: ALB End-to-End Load Test — 1000 VUs from EC2

**Status:** 🔴 Broke immediately — massive latency, multiple error types  
**Script:** `k6/scenarios/api-queries-alb.js`  
**Start:** 2026-03-20 14:55:00 PDT (21:55:00 UTC)  
**End:** 2026-03-20 ~14:59:00 PDT (interrupted — already broken)  
**Duration:** ~4 min before manual stop  
**Source:** EC2 m5.xlarge in same VPC → ALB → OSD → OpenSearch/Prometheus  

## Parameters
- Target VUs: 1000 (ramping)
- Source: EC2 `i-08f9652631fe73302` in same VPC
- Path: EC2 → ALB (TLS) → OSD → OpenSearch/Prometheus
- Background: OTel Demo load generator active

## What Broke

### 1. OpenSearch Dashboards is the bottleneck (100m CPU / 512M memory)

Every request through OSD took **1.3–3.6 seconds** even for simple operations:
- PPL search: 3,199ms – 3,590ms response times
- Saved objects list: 3,306ms – 3,503ms
- Console proxy: 2,298ms – 2,502ms

OSD is a Node.js single-threaded server with **100m CPU limit** (0.1 cores). Under 1000 concurrent connections, it's completely CPU-starved. The event loop is blocked processing requests sequentially.

### 2. Console proxy returns 400 for search/service-map queries

`POST /api/console/proxy` with `opensearch-endpoint` header returns 400. The console proxy API requires different parameters than what the script sends. These need to be fixed in the script, but the latency issue is the real finding.

### 3. Prometheus datasource proxy returns 404

`GET /api/datasources/proxy/ObservabilityStack_Prometheus/...` returns 404. OSD doesn't expose a datasource proxy at that path — PromQL queries go through a different internal API. Script needs fixing, but again the OSD bottleneck is the headline.

### 4. OpenSearch itself is fine

- JVM Heap: 55% (285MB / 512MB) — not stressed
- OS CPU: 8% — barely working
- Thread pool rejections: 0
- Cluster status: yellow (normal for single-node)
- OS Memory: 99% — high but stable (JVM + OS caches)

### 5. No pod crashes or OOMs

All pods stayed running. No restarts. The system degraded gracefully — it didn't crash, it just became unusably slow.

## Root Cause Analysis

**The bottleneck is OpenSearch Dashboards, not OpenSearch.**

| Component | CPU Limit | Memory Limit | Status Under Load |
|-----------|-----------|--------------|-------------------|
| **OSD** | **100m (0.1 cores)** | **512M** | **🔴 Saturated — 3s+ response times** |
| OpenSearch | 500m (no limit) | 2Gi | ✅ Fine — 55% heap, 8% CPU |
| Prometheus | none | none | ✅ Fine (not reached — OSD blocked) |
| Data Prepper | none | none | ✅ Fine |

OSD is the gateway for all user traffic. With 100m CPU, it can handle roughly **5-10 concurrent requests** before the Node.js event loop saturates. At 1000 VUs, requests queue up and each takes 3+ seconds just waiting for OSD to process them.

## Recommendations

1. **Increase OSD CPU limit**: 100m → 1000m (1 core) minimum, 2000m for production
2. **Increase OSD memory**: 512M → 1Gi minimum
3. **Scale OSD replicas**: Add 2-3 replicas behind the ALB for horizontal scaling
4. **Fix k6 script**: Console proxy and Prometheus proxy endpoints need correct API paths
5. **Re-run test** after OSD scaling to find the next bottleneck (likely OpenSearch)

## Key Insight

Previous tests via port-forward (Tests 001-003) were testing OpenSearch directly, bypassing OSD entirely. The real user path goes through OSD, which is severely under-resourced at 100m CPU. This is the first thing to fix before any other capacity tuning matters.
