// k6 PromQL-focused load test — isolates Prometheus query performance through OSD.
// Usage: k6 run --env TARGET_VUS=200 scenarios/promql-load.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';

const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '200');
const OSD = __ENV.DASHBOARDS_URL || 'https://localhost:5601';
const USER = __ENV.OSD_USER || 'admin';
const PASS = __ENV.OSD_PASSWORD || 'My_password_123!@#';
const AUTH = `Basic ${encoding.b64encode(`${USER}:${PASS}`)}`;

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
    'http_req_duration{type:promql}': ['p(95)<3000'],
    'http_req_failed{type:promql}': ['rate<0.05'],
  },
};

const headers = { 'Content-Type': 'application/json', 'Authorization': AUTH, 'osd-xsrf': 'true' };

const queries = [
  'up',
  'rate(otelcol_receiver_accepted_spans_total[5m])',
  'sum(rate(otelcol_exporter_sent_spans_total[5m])) by (exporter)',
  'histogram_quantile(0.95, rate(otelcol_exporter_send_failed_spans_total[5m]))',
  'prometheus_tsdb_head_series',
  'rate(prometheus_http_request_duration_seconds_sum[5m]) / rate(prometheus_http_request_duration_seconds_count[5m])',
  'sum by (job) (rate(otelcol_processor_batch_batch_send_size_sum[5m]))',
  'node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100',
  'rate(node_cpu_seconds_total{mode="idle"}[5m])',
  'sum(rate(otelcol_receiver_accepted_metric_points_total[5m]))',
];

export function promqlLoad() {
  const q = queries[Math.floor(Math.random() * queries.length)];
  const res = http.post(`${OSD}/api/v1/query_direct`,
    JSON.stringify({ query: q, time: Math.floor(Date.now() / 1000) }),
    { headers, tags: { type: 'promql' } }
  );

  if (res.status === 404) {
    // Fallback: try Prometheus datasource proxy
    const res2 = http.get(
      `${OSD}/api/datasources/proxy/1/api/v1/query?query=${encodeURIComponent(q)}`,
      { headers, tags: { type: 'promql' } }
    );
    check(res2, { 'PromQL 2xx': (r) => r.status >= 200 && r.status < 300 });
  } else {
    check(res, { 'PromQL 2xx': (r) => r.status >= 200 && r.status < 300 });
  }

  sleep(0.5 + Math.random());
}
