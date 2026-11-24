import { describe, it, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { sendResponse, withCfnResponse } from '../custom-resources/shared/cfn-response';

const event = {
  RequestType: 'Create' as const, ResponseURL: 'https://example.invalid/response', StackId: 'stack',
  RequestId: 'req', LogicalResourceId: 'Res',
};
const context = { logStreamName: 'stream', getRemainingTimeInMillis: () => 60_000 };
const realFetch = globalThis.fetch;

function captureFetch() {
  const sent: any[] = [];
  globalThis.fetch = (async (_url: string, init: any) => {
    sent.push({ body: JSON.parse(init.body), headers: init.headers, method: init.method });
    return { ok: true, status: 200 } as Response;
  }) as typeof fetch;
  return sent;
}

describe('withCfnResponse', () => {
  afterEach(() => { globalThis.fetch = realFetch; });

  it('sends SUCCESS with the physical id and data', async () => {
    const sent = captureFetch();
    await withCfnResponse(async () => ({ PhysicalResourceId: 'pid', Data: { A: '1' } }))(event, context);
    assert.equal(sent[0].method, 'PUT');
    assert.equal(sent[0].headers['content-type'], '');
    assert.deepEqual(
      { Status: sent[0].body.Status, PhysicalResourceId: sent[0].body.PhysicalResourceId, Data: sent[0].body.Data },
      { Status: 'SUCCESS', PhysicalResourceId: 'pid', Data: { A: '1' } });
  });

  it('sends FAILED with the error message', async () => {
    const sent = captureFetch();
    await withCfnResponse(async () => { throw new Error('boom'); })(event, context);
    assert.equal(sent[0].body.Status, 'FAILED');
    assert.equal(sent[0].body.Reason, 'boom');
    assert.equal(sent[0].body.PhysicalResourceId, 'stream');
  });

  it('keeps the physical id CloudFormation sent on Delete', async () => {
    const sent = captureFetch();
    const del = { ...event, RequestType: 'Delete' as const, PhysicalResourceId: 'stream-from-failed-create' };
    await withCfnResponse(async () => ({ PhysicalResourceId: 'ui-init' }))(del, context);
    assert.equal(sent[0].body.PhysicalResourceId, 'stream-from-failed-create');
  });

  it('retries the response PUT', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) throw new Error('socket hang up');
      return { ok: calls > 2, status: calls > 2 ? 200 : 503 } as Response;
    }) as typeof fetch;
    await sendResponse('https://example.invalid/response', '{}', 5, 1);
    assert.equal(calls, 3);
    globalThis.fetch = (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch;
    await assert.rejects(sendResponse('https://example.invalid/response', '{}', 2, 1), /after 2 attempts: status 500/);
  });

  it('sends FAILED before the function would time out', async () => {
    const sent = captureFetch();
    const short = { ...context, getRemainingTimeInMillis: () => 10_500 };
    await withCfnResponse(() => new Promise(() => {}))(event, short);
    assert.equal(sent[0].body.Status, 'FAILED');
    assert.match(sent[0].body.Reason, /Timed out/);
  });
});
