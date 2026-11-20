import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AGENT_PANELS, agentPanelQuery, agentPanelObject } from '../custom-resources/ui-init/agent-panels';

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
