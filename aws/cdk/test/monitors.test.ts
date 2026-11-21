import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ensureMonitors, monitorDefinitions } from '../custom-resources/ui-init/monitors';

describe('monitorDefinitions', () => {
  it('has the stack health monitor, plus the five demo monitors with the demo', () => {
    assert.deepEqual(monitorDefinitions({ demo: false, exactIndexNames: false }).map((m) => m.name), ['Observability Stack - Cluster Health Red']);
    assert.equal(monitorDefinitions({ demo: true, exactIndexNames: false }).length, 6);
  });

  it('uses exact index names for serverless collections', () => {
    const text = JSON.stringify(monitorDefinitions({ demo: true, exactIndexNames: true }));
    assert.ok(!text.includes('*'), 'a pattern matches nothing on a collection');
    assert.ok(text.includes('source=otel-v1-apm-span |') && text.includes('source=logs-otel-v1 |'));
  });
});

describe('ensureMonitors', () => {
  it('creates missing monitors, keeps existing ones and reports what the backend rejects', async () => {
    const posted: string[] = [];
    const request = async (method: 'GET' | 'POST', path: string, body?: any) => {
      if (method === 'GET') return { status: 200, data: { monitors: path.includes('Checkout') ? [{ name: 'OTel Demo - Checkout Errors' }] : [] } };
      posted.push(`${path} ${body.name}`);
      return body.monitor_type === 'cluster_metrics_monitor'
        ? { status: 200, data: { ok: false, resp: 'not supported' } }
        : { status: 200, data: { ok: true } };
    };
    const monitors = monitorDefinitions({ demo: true, exactIndexNames: true }).slice(0, 3);
    const result = await ensureMonitors(request, 'ds-1', monitors);
    assert.equal(result, 'Observability Stack - Cluster Health Red: skipped (not supported); OTel Demo - Checkout Errors: exists; OTel Demo - Payment Failures: created');
    assert.deepEqual(posted, [
      '/api/alerting/monitors?dataSourceId=ds-1 Observability Stack - Cluster Health Red',
      '/api/alerting/monitors?dataSourceId=ds-1 OTel Demo - Payment Failures',
    ]);
  });
});
