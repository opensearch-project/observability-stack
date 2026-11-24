import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { demoMonitorNames, ensureMonitors, monitorDefinitions } from '../custom-resources/ui-init/monitors';

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
    const request = async (method: 'GET' | 'POST' | 'DELETE', path: string, body?: any) => {
      if (method === 'GET') return { status: 200, data: { monitors: path.includes('Checkout') ? [{ name: 'OTel Demo - Checkout Errors' }] : [] } };
      posted.push(`${path} ${body.name}`);
      return body.monitor_type === 'cluster_metrics_monitor'
        ? { status: 200, data: { ok: false, resp: 'not supported' } }
        : { status: 200, data: { ok: true } };
    };
    const monitors = monitorDefinitions({ demo: true, exactIndexNames: true }).slice(0, 3);
    const result = await ensureMonitors(request, 'ws-1', 'ds-1', monitors);
    assert.equal(result, 'Observability Stack - Cluster Health Red: skipped (not supported); OTel Demo - Checkout Errors: exists; OTel Demo - Payment Failures: created');
    assert.deepEqual(posted, [
      '/w/ws-1/api/alerting/monitors?dataSourceId=ds-1 Observability Stack - Cluster Health Red',
      '/w/ws-1/api/alerting/monitors?dataSourceId=ds-1 OTel Demo - Payment Failures',
    ]);
  });

  it('deletes the demo monitors a stack without the demo still has', async () => {
    const deleted: string[] = [];
    const request = async (method: 'GET' | 'POST' | 'DELETE', path: string) => {
      if (method === 'DELETE') { deleted.push(path); return { status: 200, data: { ok: true } }; }
      if (method === 'GET') {
        return { status: 200, data: { monitors: path.includes('Cart') ? [{ id: 'm1', version: 3, name: 'OTel Demo - Cart Service Errors' }] : [] } };
      }
      return { status: 200, data: { ok: true } };
    };
    const result = await ensureMonitors(request, 'ws-1', 'ds-1', [], demoMonitorNames());
    assert.equal(result, 'OTel Demo - Cart Service Errors: removed');
    assert.deepEqual(deleted, ['/w/ws-1/api/alerting/monitors/m1?version=3&dataSourceId=ds-1']);
  });
});
