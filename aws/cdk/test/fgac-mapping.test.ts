import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { mergeBackendRoles, parseFgacRoles, parseRoleArns } from '../custom-resources/fgac-mapping';

describe('CDK FGAC mapping', () => {
  it('maps all_access and security_manager by default', () => {
    for (const raw of [undefined, '', 'not json', '{}', '[]', '[1, "bad role!"]']) {
      assert.deepEqual(parseFgacRoles(raw), ['all_access', 'security_manager'], String(raw));
    }
  });

  it('maps only the listed security roles', () => {
    assert.deepEqual(parseFgacRoles('["readall"]'), ['readall']);
    assert.deepEqual(parseFgacRoles('["readall", "readall", 7]'), ['readall']);
  });

  it('keeps only IAM role ARNs', () => {
    const arn = 'arn:aws:iam::123456789012:role/demo';
    assert.deepEqual(parseRoleArns(JSON.stringify([arn, '*', 'arn:aws:iam::123456789012:user/x'])), [arn]);
    assert.deepEqual(parseRoleArns('oops'), []);
  });

  it('merges backend roles without wildcards or revoked roles', () => {
    assert.deepEqual(mergeBackendRoles(['*', 'a', 'old'], ['b', 'a'], ['old']), ['a', 'b']);
  });
});
