import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'path';
import { spawnSync } from 'child_process';

// bin/app.ts reads -c values when it starts; CDK_CONTEXT_JSON is how the CDK CLI passes them.
function runApp(context: Record<string, string>) {
  return spawnSync(process.execPath, ['--require', 'ts-node/register', path.join(__dirname, '..', 'bin', 'app.ts')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, CDK_CONTEXT_JSON: JSON.stringify({ 'aws:cdk:bundling-stacks': [], ...context }) },
    encoding: 'utf8',
  });
}

describe('bin/app.ts', () => {
  for (const bad of ['', 'ab', 'Has-Caps', '1starts-with-digit', 'ends-with-', 'name_with_underscore', 'eighteen-chars-xyz']) {
    it(`rejects stackName ${JSON.stringify(bad)}`, () => {
      const r = runApp(bad ? { stackName: bad } : {});
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Set -c stackName=<name>/);
    });
  }

  it('accepts a valid stackName', () => {
    const r = runApp({ stackName: 'my-stack-01' });
    assert.equal(r.status, 0, r.stderr);
  });
});
