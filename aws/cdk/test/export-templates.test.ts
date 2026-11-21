import { describe, it, before } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

describe('export-templates', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
  before(() => {
    execFileSync('npx', ['ts-node', 'scripts/export-templates.ts', '--version', 'v0.0.0-test', '--out', out],
      { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
  });

  for (const variant of ['domain', 'serverless', 'serverless-easy']) {
    it(`writes a self-contained ${variant} template`, () => {
      const t = JSON.parse(fs.readFileSync(path.join(out, `observability-stack-${variant}.json`), 'utf8'));
      const text = JSON.stringify(t);
      assert.ok(!text.includes('S3Key') && !text.includes('cdk-hnb659fds'), 'references a CDK asset');
      assert.ok(!t.Parameters.BootstrapVersion && !t.Rules?.CheckBootstrapVersion, 'needs CDK bootstrap');
      assert.ok(!t.Resources.CDKMetadata);
      for (const [id, r] of Object.entries<any>(t.Resources)) {
        if (r.Type === 'AWS::Lambda::Function') assert.ok(r.Properties.Code.ZipFile?.length > 0, `${id} is not inline`);
      }
      assert.equal(t.Parameters.StackDisplayName.Default, undefined);
      assert.equal(t.Parameters.AdminRoleArns.Default, undefined);
      assert.equal(t.Metadata.TemplateVersion, 'v0.0.0-test');
      assert.ok(text.includes('git clone --depth 1 --branch v0.0.0-test '), 'demo does not clone the version');
    });
  }
});
