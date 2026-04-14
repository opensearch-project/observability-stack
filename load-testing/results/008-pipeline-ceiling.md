# 008 — Pipeline Ingestion Ceiling (telemetrygen)

**Date:** 2026-04-13
**Config:** 1 OTel Collector, 1 Data Prepper, 3 OpenSearch nodes (3x m5.xlarge)
**Tool:** telemetrygen (K8s Job, in-cluster)

## Results

| Target Rate (spans/sec) | Workers | Actual Rate | Delivered | Effective Throughput | Delivery % |
|---|---|---|---|---|---|
| 1,000 × 4 workers | 4 | ~4,000/sec | 676,474 | ~3,760/sec | **100%** ✅ |
| 5,000 × 2 workers | 2 | ~10,000/sec | 1,077,175 | ~5,984/sec | 60% |
| 5,000 × 8 workers | 8 | ~40,000/sec | 1,087,435 | ~6,040/sec | 15% |

## Findings

- **Pipeline ceiling: ~6,000 spans/sec** with current config
- At 4K spans/sec: zero drops, 100% delivery
- At 10K+ spans/sec: effective throughput plateaus at ~6K/sec regardless of input rate
- **Bottleneck: Data Prepper** — gRPC errors (`GrpcRequestExceptionHandler - Unexpected exception handling gRPC request`) under load
- OpenSearch cluster remained green throughout all tests, no pending tasks
- Index grew to ~1.7M docs / 1 GB during testing

## Scaling Recommendations

To increase pipeline throughput beyond 6K spans/sec:
- Scale Data Prepper replicas (stateless, horizontal scaling)
- Increase Data Prepper `workers` config per pipeline
- Consider OTel Collector load balancing exporter across multiple Data Prepper instances
