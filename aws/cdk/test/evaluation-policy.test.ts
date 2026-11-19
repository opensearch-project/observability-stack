import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EVALUATION_POLICY_JSON, evaluationPolicyJson } from '../lib/ingestion-pipeline';

describe('evaluationPolicyJson', () => {
  it('defaults to a delete state after 7 days', () => {
    const p = JSON.parse(evaluationPolicyJson()).policy;
    const write = p.states.find((s: any) => s.name === p.default_state);
    assert.deepEqual(write.transitions, [{ state_name: 'delete', conditions: { min_index_age: '7d' } }]);
    assert.deepEqual(p.states.at(-1), { name: 'delete', actions: [{ delete: {} }], transitions: [] });
  });

  it('keeps the rollover-only policy for 0 and rejects invalid values', () => {
    assert.equal(evaluationPolicyJson(0), EVALUATION_POLICY_JSON);
    assert.throws(() => evaluationPolicyJson(-1), /whole number/);
    assert.throws(() => evaluationPolicyJson(1.5), /whole number/);
  });

  it('builds the same policy as the CLI installer', async () => {
    const cli = path.join(__dirname, '..', '..', 'cli-installer', 'src', 'evaluation-index.mjs');
    if (!fs.existsSync(cli)) return;
    // Real dynamic import (ts-node would turn import() into require(), which cannot load ESM)
    const load = new Function('u', 'return import(u)') as (u: string) => Promise<any>;
    const { evaluationPolicy } = await load(pathToFileURL(cli).href);
    for (const days of [0, 7, 30]) {
      assert.deepEqual(JSON.parse(evaluationPolicyJson(days)), evaluationPolicy(days), `${days} days`);
    }
  });
});
