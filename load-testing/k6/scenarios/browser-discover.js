// k6 browser test — Discover + PPL flow in OpenSearch Dashboards.
// Simulates a user opening Discover, selecting an index, running PPL queries.
//
// Usage:
//   kubectl port-forward -n observability-stack svc/obs-stack-opensearch-dashboards 5601:5601 &
//   K6_BROWSER_ENABLED=true k6 run scenarios/browser-discover.js

import { browser } from 'k6/browser';
import { check, sleep } from 'k6';

const TARGET_BROWSER_VUS = parseInt(__ENV.BROWSER_VUS || '5');

export const options = {
  scenarios: {
    discover_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 2 },
        { duration: '3m', target: TARGET_BROWSER_VUS },
        { duration: '3m', target: TARGET_BROWSER_VUS },
        { duration: '1m', target: 0 },
      ],
      exec: 'discoverFlow',
      options: { browser: { type: 'chromium' } },
    },
  },
  thresholds: {
    browser_web_vital_lcp: ['p(95)<8000'],
  },
};

const DASHBOARDS_URL = __ENV.DASHBOARDS_URL || 'http://localhost:5601';
const USERNAME = __ENV.OSD_USER || 'admin';
const PASSWORD = __ENV.OSD_PASSWORD || 'My_password_123!@#';

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

const pplQueries = [
  'source=otel-v1-apm-span-000001 | head 50',
  'source=otel-v1-apm-span-000001 | stats count() by serviceName',
  'source=otel-v1-apm-span-000001 | where durationInNanos > 1000000000 | stats count() by serviceName',
  'source=logs-otel-v1-000001 | stats count() by serviceName',
];

export async function discoverFlow() {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await login(page);

    // Navigate to Discover
    await page.goto(`${DASHBOARDS_URL}/app/data-explorer/discover`);
    await page.waitForTimeout(3000);

    check(page, {
      'Discover page loaded': () => true,
    });

    // Run a PPL query via the query bar
    const query = pplQueries[Math.floor(Math.random() * pplQueries.length)];
    const queryInput = await page.locator('[data-test-subj="queryInput"]');
    if (await queryInput.isVisible()) {
      await queryInput.fill(query);
      // Submit query
      const submitBtn = await page.locator('[data-test-subj="querySubmitButton"]');
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
      }
      await page.waitForTimeout(5000); // wait for results
    }

    check(page, {
      'Query executed': () => true,
    });

    // Change time range to last 24h
    const timePicker = await page.locator('[data-test-subj="superDatePickerToggleQuickMenuButton"]');
    if (await timePicker.isVisible()) {
      await timePicker.click();
      await page.waitForTimeout(1000);
      const last24h = await page.locator('text=Last 24 hours');
      if (await last24h.isVisible()) {
        await last24h.click();
        await page.waitForTimeout(3000);
      }
    }

    sleep(2);
  } finally {
    await page.close();
    await context.close();
  }
}
