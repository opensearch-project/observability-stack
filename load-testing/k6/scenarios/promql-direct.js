// k6 PromQL load test — hits Prometheus directly.
// Usage: k6 run --env TARGET_VUS=200 --env PROM_URL=http://prometheus:9090 promql-direct.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '200');
const PROM = __ENV.PROM_URL || 'http://localhost:9090';

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    promql: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.round(TARGET_VUS * 0.5) },
        { duration: '3m', target: TARGET_VUS },
        { duration: '5m', target: TARGET_VUS },
        { duration: '1m', target: 0 },
      ],
      exec: 'promqlLoad',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};

const instantQueries = [
  'up',
  'rate(otelcol_receiver_accepted_spans_total[5m])',
  'sum(rate(otelcol_exporter_sent_spans_total[5m])) by (exporter)',
  'prometheus_tsdb_head_series',
  'rate(prometheus_http_request_duration_seconds_sum[5m]) / rate(prometheus_http_request_duration_seconds_count[5m])',
  'sum by (job) (rate(otelcol_processor_batch_batch_send_size_sum[5m]))',
  'node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100',
  'avg without(cpu) (rate(node_cpu_seconds_total{mode="idle"}[5m]))',
  'sum(rate(otelcol_receiver_accepted_metric_points_total[5m]))',
  'topk(10, count by (__name__)({__name__=~".+"}))',
];

const rangeQueries = [
  'rate(otelcol_receiver_accepted_spans_total[5m])',
  'sum(rate(otelcol_exporter_sent_spans_total[5m])) by (exporter)',
  'rate(prometheus_http_request_duration_seconds_sum[5m])',
];

export function promqlLoad() {
  const now = Math.floor(Date.now() / 1000);

  if (Math.random() < 0.7) {
    // Instant query (70%)
    const q = instantQueries[Math.floor(Math.random() * instantQueries.length)];
    const res = http.get(`${PROM}/api/v1/query?query=${encodeURIComponent(q)}&time=${now}`);
    check(res, { 'instant 2xx': (r) => r.status === 200 });
  } else {
    // Range query (30%) — last 30 minutes, 15s step
    const q = rangeQueries[Math.floor(Math.random() * rangeQueries.length)];
    const res = http.get(`${PROM}/api/v1/query_range?query=${encodeURIComponent(q)}&start=${now - 1800}&end=${now}&step=15`);
    check(res, { 'range 2xx': (r) => r.status === 200 });
  }

  sleep(0.2 + Math.random() * 0.3);
}
