import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { applyRetention } from '../custom-resources/index-retention/index';

const ok = () => ({ ok: true, status: 200, text: async () => '{}' }) as Response;
const missing = () => ({ ok: false, status: 404, text: async () => 'index_not_found_exception' }) as Response;
const noSleep = async () => {};

describe('applyRetention', () => {
  it('sets <days>d on each index, retrying an index the pipeline has not created yet', async () => {
    const calls: string[] = [];
    let first = true;
    const sign = async (url: string, _m: 'PUT', body: string) => {
      calls.push(`${url} ${body}`);
      if (url.endsWith('/b/_settings') && first) { first = false; return missing(); }
      return ok();
    };
    const result = await applyRetention(sign, 'https://c', ['a', 'b'], '30', Date.now() + 60_000, noSleep);
    assert.deepEqual(result, { a: '30d', b: '30d' });
    assert.deepEqual(calls, [
      'https://c/a/_settings {"index.data.retention":"30d"}',
      'https://c/b/_settings {"index.data.retention":"30d"}',
      'https://c/b/_settings {"index.data.retention":"30d"}',
    ]);
  });

  it('fails with the last response once the deadline passes', async () => {
    await assert.rejects(applyRetention(async () => missing(), 'https://c', ['a'], '7', Date.now(), noSleep), /could not set retention on a: 404/);
  });
});
