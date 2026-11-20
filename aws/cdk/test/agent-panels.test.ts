import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AGENT_PANELS, agentPanelQuery, agentPanelObject, datasetDataSource, syncAgentDashboard } from '../custom-resources/ui-init/agent-panels';

const byId = (id: string) => AGENT_PANELS.find((p) => p.id === id)!;

describe('agentPanelQuery', () => {
  it('counts documents for a pie, dropping those without the field and capping at 10', () => {
    const q = agentPanelQuery(byId('llm-requests-by-model'));
    assert.equal(q.chartType, 'pie');
    assert.equal(q.query, 'source = otel-v1-apm-span* | where isnotnull(`attributes.gen_ai.request.model`) | stats count() as value by `attributes.gen_ai.request.model` | sort - value | head 10');
    assert.deepEqual(q.axesMapping, { size: 'value', color: 'attributes.gen_ai.request.model' });
  });

  it('sums a metric into a horizontal bar (category on y, value on x), ranked and capped', () => {
    const q = agentPanelQuery(byId('token-usage-by-agent'));
    assert.equal(q.chartType, 'bar');
    assert.match(q.query, /stats sum\(`attributes\.gen_ai\.usage\.input_tokens`\) as value by `attributes\.gen_ai\.agent\.name` \| sort - value \| head 10$/);
    assert.deepEqual(q.axesMapping, { x: 'value', y: 'attributes.gen_ai.agent.name' });
  });

  it('null-checks both the category and the split field, and splits by colour', () => {
    const q = agentPanelQuery(byId('agent-ops-by-service'));
    assert.match(q.query, /where isnotnull\(`serviceName`\) and isnotnull\(`attributes\.gen_ai\.operation\.name`\)/);
    assert.deepEqual(q.axesMapping, { x: 'value', y: 'serviceName', color: 'attributes.gen_ai.operation.name' });
  });
});

describe('agentPanelObject', () => {
  it('builds a PPL explore object over the traces pattern with no aggregation fields', () => {
    const o = agentPanelObject(byId('tool-usage-stats'), 'traces-id');
    const search = JSON.parse(o.attributes.kibanaSavedObjectMeta.searchSourceJSON);
    assert.equal(search.query.language, 'PPL');
    assert.deepEqual(search.query.dataset, {
      id: 'traces-id', title: 'otel-v1-apm-span*', type: 'INDEX_PATTERN', language: 'PPL', timeFieldName: 'endTime', signalType: 'traces',
    });
    assert.deepEqual(o.references, [{ name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern', id: 'traces-id' }]);
    assert.equal(JSON.parse(o.attributes.visualization).chartType, 'pie');
  });

  it('has a unique id for every panel', () => {
    assert.equal(new Set(AGENT_PANELS.map((p) => p.id)).size, AGENT_PANELS.length);
  });
});

describe('datasetDataSource', () => {
  it('builds the dataset data source from the data-source saved object', () => {
    assert.deepEqual(
      datasetDataSource({ id: 'ds-1', attributes: { title: 'my-collection', dataSourceEngineType: 'OpenSearch Serverless', dataSourceVersion: '' } }),
      { id: 'ds-1', title: 'my-collection', type: 'OpenSearch Serverless', version: '' },
    );
  });

  it('falls back to the id and the OpenSearch engine when attributes are missing', () => {
    assert.deepEqual(datasetDataSource({ id: 'ds-1' }), { id: 'ds-1', title: 'ds-1', type: 'OpenSearch', version: '' });
  });

  it('is undefined without a data source', () => {
    assert.equal(datasetDataSource(undefined), undefined);
    assert.equal(datasetDataSource({}), undefined);
  });

  it('puts the data source on the panel dataset, and omits it when there is none', () => {
    const ds = { id: 'ds-1', title: 't', type: 'OpenSearch Serverless', version: '' };
    const withDs = JSON.parse(agentPanelObject(AGENT_PANELS[0], 'traces-id', ds).attributes.kibanaSavedObjectMeta.searchSourceJSON);
    assert.deepEqual(withDs.query.dataset.dataSource, ds);
    const without = JSON.parse(agentPanelObject(AGENT_PANELS[0], 'traces-id').attributes.kibanaSavedObjectMeta.searchSourceJSON);
    assert.equal('dataSource' in without.query.dataset, false);
  });
});

describe('syncAgentDashboard', () => {
  type Call = { op: 'post' | 'put' | 'del'; path: string };
  const isDash = (path: string) => path.includes('/dashboard/');
  const fake = (status: (c: Call) => number | Error) => {
    const calls: Call[] = [];
    const run = (op: Call['op']) => async (path: string) => {
      const c = { op, path }; calls.push(c);
      const s = status(c);
      if (s instanceof Error) throw s;
      return { status: s };
    };
    return { calls, api: { post: run('post'), put: run('put'), del: run('del') } };
  };
  const dels = (calls: { op: string }[]) => calls.map((c, i) => (c.op === 'del' ? i : -1)).filter((i) => i >= 0);
  const lastDashSave = (calls: { op: string; path: string }[]) => Math.max(...calls.map((c, i) => (c.op !== 'del' && isDash(c.path) ? i : -1)));

  it('creates panels and the dashboard, then deletes the legacy visualizations', async () => {
    const { api, calls } = fake(() => 200);
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.dashboard, 'created');
    assert.equal(r.panelIds.length, AGENT_PANELS.length);
    assert.equal(r.removedLegacy.length, AGENT_PANELS.length);
    assert.ok(dels(calls).every((i) => i > lastDashSave(calls)), 'legacy objects are deleted after the dashboard save');
  });

  it('updates an existing workspace: 409 on panels and dashboard becomes PUT, then deletes legacy', async () => {
    const { api, calls } = fake((c) => (c.op === 'post' ? 409 : 200));
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.dashboard, 'updated');
    assert.equal(r.panelIds.length, AGENT_PANELS.length);
    assert.ok(calls.some((c) => c.op === 'put' && isDash(c.path)));
    assert.ok(dels(calls).every((i) => i > lastDashSave(calls)));
  });

  it('keeps the legacy visualizations when the dashboard save fails (the old dashboard still references them)', async () => {
    const { api, calls } = fake((c) => (isDash(c.path) ? (c.op === 'post' ? 409 : 500) : 200));
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.dashboard, 'failed');
    assert.equal(dels(calls).length, 0);
    assert.match(r.warnings.join(' '), /dashboard not saved: HTTP 500/);
  });

  it('keeps the legacy visualizations when the dashboard request throws', async () => {
    const { api, calls } = fake((c) => (isDash(c.path) ? new Error('timeout') : 200));
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.dashboard, 'failed');
    assert.equal(dels(calls).length, 0);
  });

  it('keeps a panel that exists (409) on the dashboard even when its update fails', async () => {
    const { api } = fake((c) => (c.op === 'post' ? (isDash(c.path) ? 200 : 409) : c.op === 'put' ? 500 : 200));
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.panelIds.length, AGENT_PANELS.length);
    assert.equal(r.warnings.length, AGENT_PANELS.length);
  });

  it('leaves a panel that could not be saved off the dashboard and keeps going', async () => {
    const { api } = fake((c) => (c.path.endsWith('/explore/tool-usage-stats') ? 500 : 200));
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.panelIds.length, AGENT_PANELS.length - 1);
    assert.ok(!r.panelIds.includes('tool-usage-stats'));
    assert.equal(r.dashboard, 'created');
  });

  it('does not save a dashboard when no panel was saved', async () => {
    const { api, calls } = fake(() => 500);
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.dashboard, 'skipped');
    assert.equal(calls.filter((c) => isDash(c.path)).length, 0);
  });
});

describe('agentPanelQuery roles for other chart types', () => {
  it('gives a non-pie panel with no metric or split horizontal bar roles, not pie roles', () => {
    const q = agentPanelQuery({ id: 'x', title: 'X', type: 'horizontal_bar', field: 'f' });
    assert.equal(q.chartType, 'bar');
    assert.deepEqual(q.axesMapping, { x: 'value', y: 'f' });
  });
});
