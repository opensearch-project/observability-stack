// k6 API-level load test — hits OpenSearch Dashboards through ALB.
// Simulates the actual HTTP requests that a dashboard user generates.
//
// Usage (from EC2 load generator):
//   k6 run --env TARGET_VUS=500 scenarios/api-queries-alb.js
//   k6 run --env TARGET_VUS=1000 --env DASHBOARDS_URL=https://your-alb-dns scenarios/api-queries-alb.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';

const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '200');
const OSD = __ENV.DASHBOARDS_URL || 'https://localhost:5601';
const USER = __ENV.OSD_USER || 'admin';
const PASS = __ENV.OSD_PASSWORD || 'My_password_123!@#';
const AUTH_HEADER = `Basic ${encoding.b64encode(`${USER}:${PASS}`)}`;

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    osd_queries: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: Math.round(TARGET_VUS * 0.25) },
        { duration: '3m', target: Math.round(TARGET_VUS * 0.5) },
        { duration: '5m', target: TARGET_VUS },
        { duration: '3m', target: TARGET_VUS },
        { duration: '2m', target: 0 },
      ],
      exec: 'osdLoad',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.05'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  'Authorization': AUTH_HEADER,
  'osd-xsrf': 'true',
};

// --- PPL queries via OSD's query endpoint ---
const pplQueries = [
  'source=otel-v1-apm-span-000001 | head 50',
  'source=otel-v1-apm-span-000001 | stats count() by serviceName',
  'source=otel-v1-apm-span-000001 | stats count() by serviceName, kind',
  'source=otel-v1-apm-span-000001 | where durationInNanos > 1000000000 | stats count() by serviceName',
  'source=logs-otel-v1-000001 | head 50',
  'source=logs-otel-v1-000001 | stats count() by severityText',
];

// --- PromQL queries via OSD's datasource proxy ---
const promQueries = [
  'up',
  'rate(otelcol_exporter_sent_spans_total[5m])',
  'sum(rate(otelcol_exporter_sent_spans_total[5m]))',
  'histogram_quantile(0.99, rate(prometheus_http_request_duration_seconds_bucket{handler="/api/v1/query"}[5m]))',
  'prometheus_tsdb_head_series',
  'sum(rate(elasticsearch_indices_search_query_time_seconds[5m]))',
  'sum(elasticsearch_index_stats_query_cache_size)',
];

export function osdLoad() {
  const action = Math.random();

  if (action < 0.3) {
    // PPL query through OSD
    const q = pplQueries[Math.floor(Math.random() * pplQueries.length)];
    const res = http.post(`${OSD}/api/ppl/search`, JSON.stringify({
      query: q,
      format: 'jdbc',
    }), { headers });
    check(res, { 'PPL 2xx': (r) => r.status >= 200 && r.status < 300 });

  } else if (action < 0.5) {
    // PPL query on logs
    const q = pplQueries[Math.floor(Math.random() * pplQueries.length)];
    const res = http.post(`${OSD}/api/ppl/search`, JSON.stringify({
      query: q,
      format: 'jdbc',
    }), { headers });
    check(res, { 'PPL logs 2xx': (r) => r.status >= 200 && r.status < 300 });

  } else if (action < 0.7) {
    // Direct OpenSearch query through OSD (DSL search)
    const res = http.post(`${OSD}/api/console/proxy?path=${encodeURIComponent('otel-v1-apm-span-*/_search?preference=_replica')}&method=POST`, JSON.stringify({
      size: 50,
      query: { match_all: {} },
      sort: [{ startTime: 'desc' }],
    }), { headers });
    check(res, { 'Search 2xx': (r) => r.status >= 200 && r.status < 400 });

  } else if (action < 0.85) {
    // Load saved objects (simulates opening a dashboard)
    const res = http.get(
      `${OSD}/api/saved_objects/_find?type=dashboard&per_page=10`,
      { headers },
    );
    check(res, { 'Dashboards list 2xx': (r) => r.status >= 200 && r.status < 300 });

  } else {
    // Service map query
    const res = http.post(`${OSD}/api/console/proxy?path=${encodeURIComponent('otel-v2-apm-service-map-*/_search?preference=_replica')}&method=POST`, JSON.stringify({
      size: 200,
      query: { match_all: {} },
    }), { headers });
    check(res, { 'ServiceMap 2xx': (r) => r.status >= 200 && r.status < 400 });
  }

  sleep(Math.random() * 2 + 0.5); // 0.5-2.5s think time
}
