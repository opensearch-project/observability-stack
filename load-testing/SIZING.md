# Capacity Sizing Chart

> ⚠️ **Disclaimer:** The values in this document were obtained experimentally using the [OpenTelemetry Demo](https://opentelemetry.io/docs/demo/) workload and synthetic API queries via k6. All workloads are different. These numbers should be used as a starting point only — always stress test your specific workload before sizing for production.

## Baseline Test Configuration

The capacity estimates below were measured against the following deployment:

| Component | Replicas | CPU (req/limit) | Memory (req/limit) |
|-----------|----------|-----------------|-------------------|
| OpenSearch | 3 | 1000m / 2000m | 4Gi / 4Gi |
| OpenSearch Dashboards | 3 | 500m / 2000m | 1Gi / 2Gi |
| OTel Collector | 1 | none | none |
| Data Prepper | 2 | none | none |
| Prometheus | 1 | none | none |

Infrastructure: 4x m5.xlarge EKS nodes (4 vCPU, 16 GB each).

### Data Volume (OTel Demo + example agents)

After ~1.7 days of continuous ingestion:

| Metric | Measured | 7-Day Projection | 30-Day Projection |
|--------|----------|-------------------|-------------------|
| Spans | ~380K | ~1.5M | ~6.6M |
| Logs | ~140K | ~568K | ~2.4M |
| Service map entries | ~129K | ~522K | ~2.2M |
| Primary store size | ~316 MB | ~1.3 GB | ~5.6 GB |
| Total store (w/ replicas) | ~632 MB | ~2.5 GB | ~11 GB |
| Ingestion rate (spans) | ~9K/hr | — | — |
| Ingestion rate (logs) | ~3.4K/hr | — | — |

---

## Concurrent User Capacity (Estimated)

Based on load tests hitting OpenSearch Dashboards through an ALB with PPL queries, `_search`, saved object loads, and service map queries.

### With ~316 MB Primary Data (3 OS Nodes + 3 OSD Replicas)

| User Experience | Est. Concurrent Users (VUs) | p95 Latency | Throughput |
|----------------|---------------------------|-------------|------------|
| Excellent (< 200ms p95) | ~50 | < 200ms | ~50 req/s |
| Good (< 1s p95) | ~150–200 | < 1s | ~80 req/s |
| Acceptable (< 2s p95) | ~250–350 | < 2s | ~100 req/s |
| Degraded (< 5s p95) | ~500–700 | < 5s | ~120 req/s |
| Saturated | ~1000 | ~10s | ~143 req/s |

### Projected: 7 Days of Data (~1.3 GB primary)

With 4x more data, search queries scan more segments and use more heap:

| User Experience | Est. Concurrent Users | Notes |
|----------------|----------------------|-------|
| Excellent (< 200ms p95) | ~30–40 | Larger indices = slower scans |
| Good (< 1s p95) | ~100–150 | Query cache helps for repeated queries |
| Acceptable (< 2s p95) | ~150–250 | JVM heap pressure increases |
| Saturated | ~500–700 | Heap at 80%+, GC pauses start |

### Projected: 30 Days of Data (~5.6 GB primary)

| User Experience | Est. Concurrent Users | Notes |
|----------------|----------------------|-------|
| Excellent (< 200ms p95) | ~15–25 | Need shard optimization |
| Good (< 1s p95) | ~50–100 | Need more JVM heap or nodes |
| Acceptable (< 2s p95) | ~100–150 | ISM rollover policies critical |
| Saturated | ~300–500 | Need dedicated search nodes |

⚠️ The 7-day and 30-day projections assume linear degradation, which is optimistic — real degradation is often worse due to GC pressure and segment merge overhead.

---

## Scaling Recommendations by User Count

| Target Users | OpenSearch | OSD | EKS Nodes | Est. Monthly Cost |
|-------------|-----------|-----|-----------|-------------------|
| 10–50 | 1 node (4Gi, 2 CPU) | 1 replica | 2x m5.xlarge | ~$350 |
| 50–200 | 3 nodes (4Gi, 2 CPU) | 2 replicas | 3x m5.xlarge | ~$530 |
| 200–500 | 3 nodes (8Gi, 4 CPU) | 3 replicas | 4x m5.2xlarge | ~$1,100 |
| 500–1000 | 3 data + 2 search nodes | 3 replicas | 5x m5.2xlarge | ~$1,400 |
| 1000+ | 3 data + 3 search + 3 CM | 3+ replicas | 8x m5.2xlarge | ~$2,200 |

Cost estimates are approximate and based on us-west-2 on-demand pricing. Use the [AWS Pricing Calculator](https://calculator.aws/) for accurate estimates.

---

## Key Findings

1. **OSD is the first bottleneck** — default 100m CPU is unusable under load. Minimum 500m request, 2000m limit.
2. **OpenSearch single node saturates at ~100 concurrent dashboard users** through OSD.
3. **3 OS nodes improve throughput ~37%** but shard distribution must be balanced.
4. **Data volume directly impacts capacity** — more data = slower queries = fewer concurrent users.
5. **Write/search contention** — continuous indexing from OTel Demo competes with search for CPU (Lucene segment refresh).
6. **Pipeline ceiling** — ~6K spans/sec through OTel Collector → Data Prepper → OpenSearch (single Data Prepper instance).

## What Hasn't Been Tested Yet

- [ ] 7-day and 30-day data volume impact (projections only)
- [ ] Dedicated search nodes (requires remote store)
- [ ] Prometheus under concurrent PromQL load through OSD
- [ ] Browser-based load (real Chromium sessions)
- [ ] WAF impact on throughput

See [RESULTS.md](RESULTS.md) for the full test history and individual result write-ups.
