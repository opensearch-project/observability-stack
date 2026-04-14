// k6 combined load test — runs API-level and browser scenarios together.
// This is the "Phase 3" test from the load testing plan: combined read+write load.
//
// Usage:
//   # Port-forward all services:
//   kubectl port-forward -n observability-stack svc/opensearch-cluster-master 9200:9200 &
//   kubectl port-forward -n observability-stack svc/obs-stack-prometheus-server 9090:80 &
//   kubectl port-forward -n observability-stack svc/obs-stack-opensearch-dashboards 5601:5601 &
//
//   K6_BROWSER_ENABLED=true k6 run k6/full-test.js
//   K6_BROWSER_ENABLED=true k6 run k6/full-test.js --env TARGET_VUS=300 --env BROWSER_VUS=10

import http from 'k6/http';
import { browser } from 'k6/browser';
import { check, sleep } from 'k6';

const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '150');
const BROWSER_VUS = parseInt(__ENV.BROWSER_VUS || '5');

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    // --- API layer: OpenSearch queries ---
    api_opensearch: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: Math.round(TARGET_VUS * 0.5) },
        { duration: '5m', target: TARGET_VUS },
        { duration: '5m', target: TARGET_VUS },
        { duration: '2m', target: 0 },
      ],
      exec: 'apiOpensearch',
    },
    // --- API layer: Prometheus queries ---
    api_prometheus: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: Math.round(TARGET_VUS * 0.25) },
        { duration: '5m', target: Math.round(TARGET_VUS * 0.5) },
        { duration: '5m', target: Math.round(TARGET_VUS * 0.5) },
        { duration: '2m', target: 0 },
      ],
      exec: 'apiPrometheus',
    },
    // --- Browser: Trace Analytics ---
    browser_traces: {
      executor: 'constant-vus',
      vus: Math.max(1, Math.round(BROWSER_VUS * 0.4)),
      duration: '12m',
      exec: 'browserTraces',
      startTime: '2m', // start after API ramp begins
      options: { browser: { type: 'chromium' } },
    },
    // --- Browser: Discover + PPL ---
    browser_discover: {
      executor: 'constant-vus',
      vus: Math.max(1, Math.round(BROWSER_VUS * 0.3)),
      duration: '12m',
      exec: 'browserDiscover',
      startTime: '2m',
      options: { browser: { type: 'chromium' } },
    },
    // --- Browser: Metrics dashboards ---
    browser_metrics: {
      executor: 'constant-vus',
      vus: Math.max(1, Math.round(BROWSER_VUS * 0.3)),
      duration: '12m',
      exec: 'browserMetrics',
      startTime: '2m',
      options: { browser: { type: 'chromium' } },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.05'],
    browser_web_vital_lcp: ['p(95)<8000'],
  },
};

// --- Config ---
const OS_BASE = __ENV.OPENSEARCH_URL || 'https://localhost:9200';
const PROM_BASE = __ENV.PROMETHEUS_URL || 'http://localhost:9090';
const DASHBOARDS_URL = __ENV.DASHBOARDS_URL || 'http://localhost:5601';
const USERNAME = __ENV.OSD_USER || 'admin';
const PASSWORD = __ENV.OSD_PASSWORD || 'My_password_123!@#';

const osParams = {
  headers: { 'Content-Type': 'application/json' },
  auth: 'basic',
  username: USERNAME,
  password: PASSWORD,
};

const pplQueries = [
  'source=otel-v1-apm-span-000001 | head 50',
  'source=otel-v1-apm-span-000001 | stats count() by serviceName',
  'source=otel-v1-apm-span-000001 | stats count() by serviceName, name | sort - count()',
  'source=logs-otel-v1-000001 | stats count() by serviceName',
];

const promQueries = [
  'up',
  'rate(otelcol_exporter_sent_spans_total[5m])',
  'sum by (service_name) (rate(otelcol_exporter_sent_spans_total[5m]))',
  'histogram_quantile(0.99, rate(prometheus_http_request_duration_seconds_bucket{handler="/api/v1/query"}[5m]))',
  'prometheus_tsdb_head_series',
];

// --- API functions ---

export function apiOpensearch() {
  const q = pplQueries[Math.floor(Math.random() * pplQueries.length)];
  http.post(`${OS_BASE}/_plugins/_ppl`, JSON.stringify({ query: q }), osParams);
  http.post(`${OS_BASE}/otel-v1-apm-span-*/_search`,
    JSON.stringify({ size: 50, query: { match_all: {} }, sort: [{ startTime: 'desc' }] }),
    osParams);
  sleep(Math.random() * 2 + 1);
}

export function apiPrometheus() {
  const q = promQueries[Math.floor(Math.random() * promQueries.length)];
  const now = Math.floor(Date.now() / 1000);
  http.get(`${PROM_BASE}/api/v1/query_range?query=${encodeURIComponent(q)}&start=${now - 3600}&end=${now}&step=60`);
  sleep(Math.random() * 2 + 1);
}

// --- Browser functions ---

async function login(page) {
  await page.goto(`${DASHBOARDS_URL}/app/home`);
  const userField = await page.locator('[data-test-subj="user-name"]');
  if (await userField.isVisible()) {
    await userField.fill(USERNAME);
    await page.locator('[data-test-subj="password"]').fill(PASSWORD);
    await page.locator('[data-test-subj="submit"]').click();
    await page.waitForNavigation();
  }
}

export async function browserTraces() {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    await login(page);
    await page.goto(`${DASHBOARDS_URL}/app/observability-traces#/traces`);
    await page.waitForTimeout(5000);
    const row = await page.locator('table tbody tr').first();
    if (await row.isVisible()) {
      await row.click();
      await page.waitForTimeout(5000);
    }
    sleep(3);
  } finally {
    await page.close();
    await ctx.close();
  }
}

export async function browserDiscover() {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    await login(page);
    await page.goto(`${DASHBOARDS_URL}/app/data-explorer/discover`);
    await page.waitForTimeout(5000);
    sleep(3);
  } finally {
    await page.close();
    await ctx.close();
  }
}

export async function browserMetrics() {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    await login(page);
    await page.goto(`${DASHBOARDS_URL}/app/dashboards`);
    await page.waitForTimeout(3000);
    const link = await page.locator('table tbody tr a').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForTimeout(8000);
    }
    sleep(3);
  } finally {
    await page.close();
    await ctx.close();
  }
}
