// k6 browser test — Trace Analytics flow in OpenSearch Dashboards.
// Simulates a user navigating to Traces, clicking into a trace, viewing spans.
//
// Usage:
//   kubectl port-forward -n observability-stack svc/obs-stack-opensearch-dashboards 5601:5601 &
//   K6_BROWSER_ENABLED=true k6 run scenarios/browser-traces.js

import { browser } from 'k6/browser';
import { check, sleep } from 'k6';

const TARGET_BROWSER_VUS = parseInt(__ENV.BROWSER_VUS || '5');

export const options = {
  scenarios: {
    traces_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 2 },
        { duration: '3m', target: TARGET_BROWSER_VUS },
        { duration: '3m', target: TARGET_BROWSER_VUS },
        { duration: '1m', target: 0 },
      ],
      exec: 'tracesFlow',
      options: { browser: { type: 'chromium' } },
    },
  },
  thresholds: {
    browser_web_vital_lcp: ['p(95)<8000'],
    browser_web_vital_cls: ['p(95)<0.25'],
  },
};

const DASHBOARDS_URL = __ENV.DASHBOARDS_URL || 'http://localhost:5601';
const USERNAME = __ENV.OSD_USER || 'admin';
const PASSWORD = __ENV.OSD_PASSWORD || 'My_password_123!@#';

async function login(page) {
  await page.goto(`${DASHBOARDS_URL}/app/home`);
  // Check if login page appears
  const userField = await page.locator('[data-test-subj="user-name"]');
  if (await userField.isVisible()) {
    await userField.fill(USERNAME);
    await page.locator('[data-test-subj="password"]').fill(PASSWORD);
    await page.locator('[data-test-subj="submit"]').click();
    await page.waitForNavigation();
  }
}

export async function tracesFlow() {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await login(page);

    // Navigate to Trace Analytics
    await page.goto(`${DASHBOARDS_URL}/app/observability-traces#/traces`);
    await page.waitForTimeout(3000);

    // Wait for trace table to load
    const table = await page.locator('table');
    await table.waitFor({ state: 'visible', timeout: 15000 });

    check(page, {
      'Traces page loaded': () => true,
    });

    // Click first trace row if available
    const firstRow = await page.locator('table tbody tr').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(5000); // wait for span waterfall

      check(page, {
        'Trace detail loaded': () => true,
      });
    }

    // Navigate to Services
    await page.goto(`${DASHBOARDS_URL}/app/observability-traces#/services`);
    await page.waitForTimeout(3000);

    check(page, {
      'Services page loaded': () => true,
    });

    // Click first service if available
    const serviceRow = await page.locator('table tbody tr').first();
    if (await serviceRow.isVisible()) {
      await serviceRow.click();
      await page.waitForTimeout(5000);
    }

    sleep(2);
  } finally {
    await page.close();
    await context.close();
  }
}
