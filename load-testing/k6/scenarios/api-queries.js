// k6 API-level load test — replays the HTTP queries that OpenSearch Dashboards
// makes under the hood: PPL, _search, PromQL, saved objects.
//
// Usage:
//   # Port-forward first:
//   kubectl port-forward -n observability-stack svc/opensearch-cluster-master 9200:9200 &
//   kubectl port-forward -n observability-stack svc/obs-stack-prometheus-server 9090:80 &
//   kubectl port-forward -n observability-stack svc/obs-stack-opensearch-dashboards 5601:5601 &
//
//   k6 run scenarios/api-queries.js
//   k6 run scenarios/api-queries.js --env TARGET_VUS=500  # override peak

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '200');

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    opensearch_queries: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: Math.round(TARGET_VUS * 0.25) },
        { duration: '3m', target: Math.round(TARGET_VUS * 0.5) },
        { duration: '5m', target: TARGET_VUS },
        { duration: '3m', target: TARGET_VUS },  // hold at peak
        { duration: '2m', target: 0 },
      ],
      exec: 'opensearchLoad',
    },
    prometheus_queries: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: Math.round(TARGET_VUS * 0.1) },
        { duration: '3m', target: Math.round(TARGET_VUS * 0.25) },
        { duration: '5m', target: Math.round(TARGET_VUS * 0.5) },
        { duration: '3m', target: Math.round(TARGET_VUS * 0.5) },
        { duration: '2m', target: 0 },
      ],
      exec: 'prometheusLoad',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.05'],
  },
};

const OS_BASE = __ENV.OPENSEARCH_URL || 'https://localhost:9200';
const PROM_BASE = __ENV.PROMETHEUS_URL || 'http://localhost:9090';

import encoding from 'k6/encoding';
const OS_USER = __ENV.OSD_USER || 'admin';
const OS_PASS = __ENV.OSD_PASSWORD || 'My_password_123!@#';
const OS_AUTH_HEADER = `Basic ${encoding.b64encode(`${OS_USER}:${OS_PASS}`)}`;

const osParams = {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': OS_AUTH_HEADER,
  },
};

// --- PPL queries (light → heavy) ---
const pplQueries = [
  'source=otel-v1-apm-span-000001 | head 50',
  'source=otel-v1-apm-span-000001 | stats count() by serviceName',
  'source=otel-v1-apm-span-000001 | where serviceName="frontend" | stats avg(durationInNanos)',
  'source=otel-v1-apm-span-000001 | stats count() by serviceName, kind',
  'source=otel-v1-apm-span-000001 | where durationInNanos > 1000000000 | stats count() by serviceName',
  'source=logs-otel-v1-000001 | head 50',
  'source=logs-otel-v1-000001 | stats count() by severityText',
];

// --- PromQL queries (light → heavy) ---
const promQueries = [
  'up',
  'rate(otelcol_exporter_sent_spans_total[5m])',
  'sum by (service_name) (rate(otelcol_exporter_sent_spans_total[5m]))',
  'histogram_quantile(0.99, rate(prometheus_http_request_duration_seconds_bucket{handler="/api/v1/query"}[5m]))',
  'rate(prometheus_tsdb_head_samples_appended_total[5m])',
  'prometheus_tsdb_head_series',
  'sum by (job) (rate(otelcol_receiver_accepted_spans_total[5m]))',
];

export function opensearchLoad() {
  const queryIdx = Math.floor(Math.random() * pplQueries.length);

  // PPL query
  const pplRes = http.post(
    `${OS_BASE}/_plugins/_ppl`,
    JSON.stringify({ query: pplQueries[queryIdx] }),
    osParams,
  );
  check(pplRes, { 'PPL 2xx': (r) => r.status >= 200 && r.status < 300 });

  // Discover-style _search
  const searchRes = http.post(
    `${OS_BASE}/otel-v1-apm-span-*/_search`,
    JSON.stringify({
      size: 50,
      query: { match_all: {} },
      sort: [{ startTime: 'desc' }],
    }),
    osParams,
  );
  check(searchRes, { 'Search 2xx': (r) => r.status >= 200 && r.status < 300 });

  // Service map
  const smRes = http.post(
    `${OS_BASE}/otel-v2-apm-service-map-*/_search`,
    JSON.stringify({ size: 200, query: { match_all: {} } }),
    osParams,
  );
  check(smRes, { 'ServiceMap 2xx': (r) => r.status >= 200 && r.status < 300 });

  sleep(Math.random() * 2 + 1); // 1-3s think time
}

export function prometheusLoad() {
  const queryIdx = Math.floor(Math.random() * promQueries.length);
  const now = Math.floor(Date.now() / 1000);
  const oneHourAgo = now - 3600;

  // Instant query
  const instantRes = http.get(
    `${PROM_BASE}/api/v1/query?query=${encodeURIComponent(promQueries[queryIdx])}`,
  );
  check(instantRes, { 'PromQL instant 2xx': (r) => r.status === 200 });

  // Range query (1h window, 60s step)
  const rangeRes = http.get(
    `${PROM_BASE}/api/v1/query_range?query=${encodeURIComponent(promQueries[queryIdx])}&start=${oneHourAgo}&end=${now}&step=60`,
  );
  check(rangeRes, { 'PromQL range 2xx': (r) => r.status === 200 });

  sleep(Math.random() * 2 + 1);
}
