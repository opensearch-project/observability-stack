import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { mergeBackendRoles, parseFgacRoles, parseRoleArns, putBackendRoles } from '../custom-resources/fgac-mapping';

describe('CDK FGAC mapping', () => {
  it('maps all_access and security_manager when FgacRoles is absent', () => {
    for (const raw of [undefined, '']) {
      assert.deepEqual(parseFgacRoles(raw), ['all_access', 'security_manager']);
    }
  });

  it('maps only the listed security roles', () => {
    assert.deepEqual(parseFgacRoles('["readall"]'), ['readall']);
    assert.deepEqual(parseFgacRoles('["readall", "readall"]'), ['readall']);
  });

  it('rejects an unusable FgacRoles instead of granting admin', () => {
    for (const raw of ['not json', '{}', '[]', '["readall "]', '[1]', '["readall", 7]']) {
      assert.throws(() => parseFgacRoles(raw), /FgacRoles/, raw);
    }
  });

  it('keeps only IAM role ARNs', () => {
    const arn = 'arn:aws:iam::123456789012:role/demo';
    assert.deepEqual(parseRoleArns(JSON.stringify([arn, '*', 'arn:aws:iam::123456789012:user/x'])), [arn]);
    assert.deepEqual(parseRoleArns('oops'), []);
  });

  it('merges backend roles without wildcards or revoked roles', () => {
    assert.deepEqual(mergeBackendRoles(['*', 'a', 'old'], ['b', 'a'], ['old']), ['a', 'b']);
  });

  it('creates a role mapping that does not exist yet', async () => {
    const calls: string[] = [];
    const sign = async (_url: string, method: string, body?: string) => {
      calls.push(`${method} ${body}`);
      return new Response('{}', { status: method === 'PATCH' ? 404 : 200 });
    };
    await putBackendRoles(sign, 'https://d', 'readall', ['arn:aws:iam::123456789012:role/demo']);
    assert.deepEqual(calls.map((c) => c.split(' ')[0]), ['PATCH', 'PUT']);
    assert.equal(calls[1], 'PUT {"backend_roles":["arn:aws:iam::123456789012:role/demo"]}');
  });
});
