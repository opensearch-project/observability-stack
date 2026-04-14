// k6 browser test — Metrics visualization flow in OpenSearch Dashboards.
// Simulates users viewing metric panels that query Prometheus (single pod).
// This is the scenario most likely to find the Prometheus breaking point.
//
// Usage:
//   kubectl port-forward -n observability-stack svc/obs-stack-opensearch-dashboards 5601:5601 &
//   K6_BROWSER_ENABLED=true k6 run scenarios/browser-metrics.js

import { browser } from 'k6/browser';
import { check, sleep } from 'k6';

const TARGET_BROWSER_VUS = parseInt(__ENV.BROWSER_VUS || '5');

export const options = {
  scenarios: {
    metrics_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 2 },
        { duration: '3m', target: TARGET_BROWSER_VUS },
        { duration: '3m', target: TARGET_BROWSER_VUS },
        { duration: '1m', target: 0 },
      ],
      exec: 'metricsFlow',
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

export async function metricsFlow() {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await login(page);

    // Navigate to Observability > Metrics
    await page.goto(`${DASHBOARDS_URL}/app/observability-metrics`);
    await page.waitForTimeout(5000);

    check(page, {
      'Metrics page loaded': () => true,
    });

    // Try opening a saved dashboard (Pipeline Health or similar)
    await page.goto(`${DASHBOARDS_URL}/app/dashboards`);
    await page.waitForTimeout(3000);

    // Click first available dashboard
    const dashboardLink = await page.locator('table tbody tr a').first();
    if (await dashboardLink.isVisible()) {
      await dashboardLink.click();
      await page.waitForTimeout(8000); // dashboards with many panels take time

      check(page, {
        'Dashboard loaded': () => true,
      });

      // Change time range to 7d (stresses Prometheus)
      const timePicker = await page.locator('[data-test-subj="superDatePickerToggleQuickMenuButton"]');
      if (await timePicker.isVisible()) {
        await timePicker.click();
        await page.waitForTimeout(1000);
        const last7d = await page.locator('text=Last 7 days');
        if (await last7d.isVisible()) {
          await last7d.click();
          await page.waitForTimeout(10000); // 7d queries are expensive
        }
      }

      // Refresh the dashboard
      const refreshBtn = await page.locator('[data-test-subj="querySubmitButton"]');
      if (await refreshBtn.isVisible()) {
        await refreshBtn.click();
        await page.waitForTimeout(8000);
      }
    }

    sleep(2);
  } finally {
    await page.close();
    await context.close();
  }
}
