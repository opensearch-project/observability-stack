import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AGENT_PANELS, agentPanelQuery, agentPanelObject, datasetDataSource } from '../custom-resources/ui-init/agent-panels';

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
