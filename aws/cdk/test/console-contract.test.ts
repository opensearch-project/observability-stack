import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ObservabilityStack } from '../lib/observability-stack';

// What the Amazon OpenSearch Service console's Observability stack page reads from a stack.
function synth(opensearchType: 'managed' | 'serverless') {
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new ObservabilityStack(app, 'ObsStack-contract', {
    env: { account: '123456789012', region: 'us-east-1' },
    displayName: 'contract',
    opensearchType,
    enableDemo: true,
  });
  return { stack, template: Template.fromStack(stack).toJSON() };
}

const types = (t: any) => new Set(Object.values<any>(t.Resources).map((r) => r.Type));

for (const [opensearchType, backend, storageType, outputs] of [
  ['managed', 'aos-domain', 'AWS::OpenSearchService::Domain', ['DomainEndpoint', 'DomainArn']],
  ['serverless', 'aossv2', 'AWS::OpenSearchServerless::Collection', ['AOSSEndpoint', 'CollectionArn']],
] as const) {
  describe(`console contract (${opensearchType})`, () => {
    const { stack, template } = synth(opensearchType);

    it('ends the Description with the generation and backend marker', () => {
      assert.match(template.Description, new RegExp(`\\[obs-stack v2 ${backend}\\]$`));
    });

    it('sets the generation and backend stack tags', () => {
      const tags = stack.tags.tagValues();
      assert.equal(tags['opensearch:obs-stack-generation'], 'v2');
      assert.equal(tags['opensearch:obs-backend'], backend);
      assert.equal(tags['opensearch:observability-stack'], 'contract');
      assert.equal(tags['observability-stack'], 'ObsStack-contract');
    });

    it('tags resources from the parameters', () => {
      const ws = Object.values<any>(template.Resources).find((r) => r.Type === 'AWS::APS::Workspace');
      const tag = (k: string) => ws.Properties.Tags.find((t: any) => t.Key === k)?.Value;
      assert.deepEqual(tag('opensearch:observability-stack'), { Ref: 'StackDisplayName' });
      assert.deepEqual(tag('observability-stack'), { Ref: 'AWS::StackName' });
    });

    it('uses the resource types the console maps to provisioning steps', () => {
      const t = types(template);
      for (const type of [storageType, 'AWS::OSIS::Pipeline', 'AWS::APS::Workspace', 'AWS::OpenSearchService::Application',
        'Custom::PrometheusDataSource', 'Custom::WorkspaceSeeder', 'AWS::EC2::Instance']) {
        assert.ok(t.has(type), `missing ${type}`);
      }
      if (opensearchType === 'managed') {
        for (const type of ['Custom::FgacMapping', 'Custom::EvaluationIndex']) assert.ok(t.has(type), `missing ${type}`);
      }
    });

    it('emits the outputs the console reads', () => {
      for (const key of ['ObsStackGeneration', 'OSISEndpoint', 'OSISPipelineArn', 'AMPEndpoint', 'AmpWorkspaceArn',
        'DirectQueryRoleArn', 'PrometheusDataSourceArn', 'AppEndpoint', 'AppId', 'WorkspaceId', 'WorkspaceUrl',
        'DemoInstanceId', ...outputs]) {
        assert.ok(template.Outputs?.[key], `missing output ${key}`);
      }
      assert.equal(template.Outputs.ObsStackGeneration.Value, 'V2');
    });

    it('has the parameters the console prefills, by name', () => {
      const expected = opensearchType === 'managed'
        ? ['StackDisplayName', 'AdminRoleArns', 'DeployDemoWorkload', 'DomainInstanceType', 'DomainInstanceCount', 'DomainVolumeGB', 'MinOCU', 'MaxOCU', 'MetricsRetentionDays', 'LatestAl2023Ami']
        : ['StackDisplayName', 'AdminRoleArns', 'DeployDemoWorkload', 'MinOCU', 'MaxOCU', 'CollectionMinOCU', 'CollectionMaxOCU', 'MetricsRetentionDays', 'LatestAl2023Ami'];
      assert.deepEqual(Object.keys(template.Parameters).filter((k) => k !== 'BootstrapVersion'), expected);
      assert.equal(template.Parameters.DeployDemoWorkload.Default, 'true');
      assert.equal(template.Parameters.StackDisplayName.Default, 'contract');
    });

    it('creates every demo resource only under the DeployDemo condition', () => {
      const demo = Object.entries<any>(template.Resources).filter(([id]) => id.startsWith('DemoWorkload'));
      assert.ok(demo.length > 0);
      for (const [id, r] of demo) assert.equal(r.Condition, 'DeployDemo', id);
      assert.equal(template.Outputs.DemoInstanceId.Condition, 'DeployDemo');
    });
  });
}

describe('teardown', () => {
  for (const type of ['managed', 'serverless'] as const) {
    it(`writes every function's logs to a log group the ${type} stack deletes`, () => {
      const { template } = synth(type);
      for (const [id, r] of Object.entries<any>(template.Resources)) {
        if (r.Type !== 'AWS::Lambda::Function') continue;
        const ref = r.Properties.LoggingConfig?.LogGroup?.Ref;
        assert.ok(ref, `${id} has no log group`);
        assert.equal(template.Resources[ref].Type, 'AWS::Logs::LogGroup');
        assert.equal(template.Resources[ref].DeletionPolicy, 'Delete');
      }
    });
  }
});

describe('create ordering in one stack (managed)', () => {
  const { template } = synth('managed');
  const fgacPolicy = Object.keys(template.Resources).find(
    (k) => template.Resources[k].Type === 'AWS::IAM::Policy' && k.includes('FgacAdminRole'));

  it('creates the OSIS pipeline, application and custom resources after the FGAC admin role policy', () => {
    assert.ok(fgacPolicy, 'no FGAC admin role policy');
    for (const [id, r] of Object.entries<any>(template.Resources)) {
      if (!['AWS::OSIS::Pipeline', 'AWS::OpenSearchService::Application'].includes(r.Type) && !r.Type.startsWith('Custom::')) continue;
      if (r.Type === 'Custom::PrometheusDataSource') continue; // no domain access
      assert.ok((r.DependsOn ?? []).includes(fgacPolicy), `${id} (${r.Type}) does not depend on ${fgacPolicy}`);
    }
  });
});
