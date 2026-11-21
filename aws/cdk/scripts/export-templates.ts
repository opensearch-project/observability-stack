/**
 * Writes the self-contained CloudFormation templates the OpenSearch console deploys:
 * dist/templates/observability-stack-<variant>.json, one per backend.
 *
 *   npx ts-node scripts/export-templates.ts [--version <git tag>] [--out <dir>]
 *
 * Each template is this CDK app's synthesized stack with the Lambda bundles inlined as Code.ZipFile, so it
 * needs no CDK bootstrap or asset bucket. --version is the tag the demo instance clones and the template
 * reports; it defaults to the current commit.
 */
import * as cdk from 'aws-cdk-lib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { ObservabilityStack } from '../lib/observability-stack';

const VARIANTS = [
  { name: 'domain', opensearchType: 'managed' as const },
  { name: 'serverless', opensearchType: 'serverless' as const },
  // Name and admin roles only; everything else at its default.
  { name: 'serverless-easy', opensearchType: 'serverless' as const, minimalParameters: true },
];
// The console supplies these; a default would make them optional in the create form.
const REQUIRED_PARAMETERS = ['StackDisplayName', 'AdminRoleArns'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const version = arg('version') ?? commit;
const outDir = path.resolve(arg('out') ?? path.join(__dirname, '..', 'dist', 'templates'));
fs.mkdirSync(outDir, { recursive: true });

for (const variant of VARIANTS) {
  const app = new cdk.App({
    outdir: fs.mkdtempSync(path.join(os.tmpdir(), 'obs-stack-export-')),
    analyticsReporting: false,
    context: { 'aws:cdk:enable-path-metadata': false, 'aws:cdk:enable-asset-metadata': true,
      observabilityStackVersion: version, observabilityStackSource: 'console' },
  });
  const stack = new ObservabilityStack(app, 'ObsStack-template', {
    synthesizer: new cdk.DefaultStackSynthesizer({ generateBootstrapVersionRule: false }),
    displayName: 'template',
    opensearchType: variant.opensearchType,
    enableDemo: true,
    minimalParameters: variant.minimalParameters,
  });
  const assembly = app.synth();
  const template = assembly.getStackByName(stack.stackName).template;

  for (const [id, resource] of Object.entries<any>(template.Resources)) {
    const assetPath = resource.Metadata?.['aws:asset:path'];
    if (resource.Type === 'AWS::Lambda::Function' && assetPath) {
      const dir = path.join(assembly.directory, assetPath);
      const files = fs.readdirSync(dir);
      if (files.length !== 1 || files[0] !== 'index.js') {
        throw new Error(`${id}: expected a single index.js bundle to inline, found ${files.join(', ')}`);
      }
      resource.Properties.Code = { ZipFile: fs.readFileSync(path.join(dir, 'index.js'), 'utf8') };
    } else if (assetPath) {
      throw new Error(`${id} (${resource.Type}) uses an asset, which a self-contained template can't carry`);
    }
    delete resource.Metadata;
  }
  for (const name of REQUIRED_PARAMETERS) delete template.Parameters[name].Default;
  template.Metadata = {
    TemplateVersion: version,
    OssSource: { Repository: 'https://github.com/opensearch-project/observability-stack', Commit: commit },
  };

  const file = path.join(outDir, `observability-stack-${variant.name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(template, null, 2)}\n`);
  console.log(`${file} (${fs.statSync(file).size} bytes)`);
}
