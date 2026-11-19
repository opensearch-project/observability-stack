import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import {
  ensureAgentEvalsSetup, evalsConfigBody, evalsDatasetAttributes, OsuiApi,
} from '../custom-resources/ui-init/agent-evals';

// An in-memory saved objects API over one workspace.
function fakeOsui(seed: { patterns?: any[]; correlations?: any[] } = {}) {
  const objects: Record<string, any[]> = { 'index-pattern': [...(seed.patterns ?? [])], correlations: [...(seed.correlations ?? [])] };
  let n = 0;
  const api: OsuiApi = {
    async get(p) { return { status: 200, data: { saved_objects: objects[/type=([a-z-]+)/.exec(p)![1]] } }; },
    async post(p, body: any) {
      const o = { id: `new-${++n}`, ...body };
      objects[/saved_objects\/([a-z-]+)$/.exec(p)![1]].push(o);
      return { status: 200, data: o };
    },
    async put(p, body: any) {
      const [, type, id] = /saved_objects\/([a-z-]+)\/(.+)$/.exec(p)!;
      const o = objects[type].find((x) => x.id === id);
      Object.assign(o.attributes, body.attributes);
      return { status: 200, data: o };
    },
  };
  return { api, objects };
}

describe('CDK Agent Evaluations UI setup', () => {
  it('creates the evaluations dataset and config once', async () => {
    const { api, objects } = fakeOsui();
    const first = await ensureAgentEvalsSetup(api, { wsId: 'ws', dsId: 'ds', tracesId: 't' });
    const second = await ensureAgentEvalsSetup(api, { wsId: 'ws', dsId: 'ds', tracesId: 't' });
    assert.equal(first.datasetCreated && first.configCreated, true);
    assert.equal(second.datasetCreated || second.configCreated, false);
    assert.equal(objects['index-pattern'].length, 1);
    assert.equal(objects.correlations.length, 1);
    assert.equal(objects.correlations[0].attributes.correlationType, 'AgentEvals-Config-ws');
    assert.deepEqual(objects['index-pattern'][0].references, [{ id: 'ds', name: 'dataSource', type: 'data-source' }]);
  });

  it('builds the same saved objects as the CLI installer', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cli = require(path.join(__dirname, '..', '..', 'cli-installer', 'src', 'agent-evals-ui.mjs'));
    assert.deepEqual(evalsDatasetAttributes(), cli.evalsDatasetAttributes());
    assert.deepEqual(evalsConfigBody('ws', 't', 'e'), cli.evalsConfigBody('ws', 't', 'e'));
  });
});
