import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ObservabilityStack } from '../lib/observability-stack';

// The Observability stack page of the Amazon OpenSearch Service console lists stacks named ObsStack-<name> and reads
// their Description marker, tags, resource types, outputs and parameters. These tests pin that contract, plus the
// names, conditions and ordering a template generated from this stack (scripts/export-templates.ts) relies on.
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
  describe(`Amazon OpenSearch Service console's Observability stack page (${opensearchType})`, () => {
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
      } else {
        assert.ok(t.has('Custom::IndexRetention'), 'missing Custom::IndexRetention');
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
        : ['StackDisplayName', 'AdminRoleArns', 'DeployDemoWorkload', 'MinOCU', 'MaxOCU', 'CollectionMinOCU', 'CollectionMaxOCU', 'MetricsRetentionDays', 'LogRetentionDays', 'LatestAl2023Ami'];
      assert.deepEqual(Object.keys(template.Parameters).filter((k) => k !== 'BootstrapVersion'), expected);
      assert.equal(template.Parameters.DeployDemoWorkload.Default, 'true');
      assert.equal(template.Parameters.StackDisplayName.Default, 'contract');
    });

    it('puts the demo in the default VPC without naming a VPC or subnet', () => {
      const of = (type: string) => Object.values<any>(template.Resources).filter((r) => r.Type === type);
      assert.equal(of('AWS::EC2::VPC').length, 0);
      const [sg] = of('AWS::EC2::SecurityGroup');
      assert.equal(sg.Properties.VpcId, undefined);
      assert.equal(sg.Properties.SecurityGroupEgress, undefined, 'egress rules need a VpcId');
      assert.equal(of('AWS::EC2::Instance')[0].Properties.SubnetId, undefined);
    });

    it('creates every demo resource only under the DeployDemo condition', () => {
      const demo = Object.entries<any>(template.Resources).filter(([id]) => id.startsWith('DemoWorkload'));
      assert.ok(demo.length > 0);
      for (const [id, r] of demo) assert.equal(r.Condition, 'DeployDemo', id);
      assert.equal(template.Outputs.DemoInstanceId.Condition, 'DeployDemo');
      if (opensearchType === 'managed') assert.equal(template.Resources.DemoFgacMapping?.Condition, 'DeployDemo');
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
        const roleRef = r.Properties.Role['Fn::GetAtt']?.[0];
        const policies = Object.values<any>(template.Resources).filter((p) => p.Type === 'AWS::IAM::Policy'
          && p.Properties.Roles.some((x: any) => x.Ref === roleRef || JSON.stringify(x).includes(roleRef)));
        const denied = policies.some((p) => p.Properties.PolicyDocument.Statement.some(
          (st: any) => st.Effect === 'Deny' && ([] as string[]).concat(st.Action).includes('logs:CreateLogGroup')));
        assert.ok(denied, `${id}'s role can recreate its log group after a delete`);
      }
    });
  }
});

describe('create ordering in one stack (managed)', () => {
  const { template } = synth('managed');
  const fgacPolicy = Object.keys(template.Resources).find(
    (k) => template.Resources[k].Type === 'AWS::IAM::Policy' && k.includes('FgacAdminRole'));

  it('writes the demo FGAC mapping after the stack FGAC mapping, not at the same time', () => {
    assert.ok((template.Resources.DemoFgacMapping.DependsOn ?? []).includes('FgacMapping'));
  });

  it('creates the OSIS pipeline, application and custom resources after the FGAC admin role policy', () => {
    assert.ok(fgacPolicy, 'no FGAC admin role policy');
    for (const [id, r] of Object.entries<any>(template.Resources)) {
      if (!['AWS::OSIS::Pipeline', 'AWS::OpenSearchService::Application'].includes(r.Type) && !r.Type.startsWith('Custom::')) continue;
      if (r.Type === 'Custom::PrometheusDataSource') continue; // no domain access
      assert.ok((r.DependsOn ?? []).includes(fgacPolicy), `${id} (${r.Type}) does not depend on ${fgacPolicy}`);
    }
  });
});

describe('names from StackDisplayName', () => {
  const join = (...parts: unknown[]) => ({ 'Fn::Join': ['', parts] });
  const ref = { Ref: 'StackDisplayName' };
  const props = (t: any, type: string) => Object.values<any>(t.Resources).filter((r) => r.Type === type).map((r) => r.Properties);

  it('names the managed backend like the console templates', () => {
    const { template: t } = synth('managed');
    assert.deepEqual(props(t, 'AWS::OSIS::Pipeline')[0].PipelineName, join('obs-', ref, '-ingest'));
    assert.deepEqual(props(t, 'AWS::APS::Workspace')[0].Alias, join('obs-', ref, '-metrics'));
    // Hyphens in the name become underscores: data source names allow [a-z0-9_] only.
    assert.deepEqual(props(t, 'Custom::PrometheusDataSource')[0].DataSourceName,
      { 'Fn::Join': ['_', [{ 'Fn::Join': ['_', { 'Fn::Split': ['-', ref] }] }, 'prometheus']] });
    assert.deepEqual(props(t, 'AWS::OpenSearchService::Domain')[0].DomainName, join('obs-', ref));
  });

  it('names the serverless collection obs-<name>', () => {
    const { template: t } = synth('serverless');
    assert.deepEqual(props(t, 'AWS::OpenSearchServerless::Collection')[0].Name, join('obs-', ref));
  });

  it('ends the application name with part of the stack ID, so a retry after a failed create gets a new name', () => {
    const { template: t } = synth('managed');
    const name = props(t, 'AWS::OpenSearchService::Application')[0].Name['Fn::Join'];
    assert.deepEqual(name[1].slice(0, 3), ['obs', ref, 'app']);
    assert.match(JSON.stringify(name[1][3]), /AWS::StackId/);
  });
});

/** Every Fn::If on the condition named `condition`, anywhere in `value`. */
function findIfs(value: unknown, condition: string): unknown[][] {
  if (Array.isArray(value)) return value.flatMap((v) => findIfs(v, condition));
  if (value && typeof value === 'object') {
    const ifArgs = (value as any)['Fn::If'];
    const own = Array.isArray(ifArgs) && ifArgs[0] === condition ? [ifArgs] : [];
    return [...own, ...Object.values(value).flatMap((v) => findIfs(v, condition))];
  }
  return [];
}

describe('conditions', () => {
  it('creates the pipeline role only when the stack is named ObsStack-<StackDisplayName>', () => {
    const { template: t } = synth('managed');
    assert.deepEqual(t.Conditions.StackNameOk['Fn::Equals'][0], { Ref: 'AWS::StackName' });
    const pipeline = Object.values<any>(t.Resources).find((r) => r.Type === 'AWS::OSIS::Pipeline');
    const roleId = pipeline.Properties.PipelineRoleArn['Fn::GetAtt'][0];
    assert.equal(t.Resources[roleId].Condition, 'StackNameOk');
  });

  for (const type of ['managed', 'serverless'] as const) {
    it(`leaves an empty AdminRoleArns out of the role lists (${type})`, () => {
      const { template: t } = synth(type);
      const lists = Object.values<any>(t.Resources).flatMap((r) => {
        const p = r.Properties ?? {};
        if (r.Type === 'Custom::FgacMapping' && r.Properties.FgacRoles === undefined) return [p.RoleArns];
        if (r.Type === 'AWS::OpenSearchService::Application') return [p.AppConfigs[0].Value];
        if (r.Type === 'AWS::OpenSearchServerless::AccessPolicy' && JSON.stringify(p.Policy).includes('AdminRoleArns')) return [p.Policy];
        return [];
      });
      assert.equal(lists.length, 2);
      for (const value of lists) {
        const ifs = findIfs(value, 'HasAdminRoleArns');
        assert.equal(ifs.length, 1, `not conditional on HasAdminRoleArns: ${JSON.stringify(value).slice(0, 120)}`);
        const [, withList, withoutList] = ifs[0];
        assert.ok(JSON.stringify(withList).includes('"Ref":"AdminRoleArns"'));
        assert.ok(!JSON.stringify(withoutList).includes('AdminRoleArns'));
      }
      assert.deepEqual(t.Conditions.HasAdminRoleArns['Fn::Not'][0]['Fn::Equals'][1], '');
    });
  }
});

describe('serverless index retention', () => {
  const { template: t } = synth('serverless');
  const [id, r] = Object.entries<any>(t.Resources).find(([, x]) => x.Type === 'Custom::IndexRetention')!;

  it('sets LogRetentionDays on the indices the pipeline writes, after the pipeline exists', () => {
    assert.deepEqual(r.Properties.IndexNames, ['logs-otel-v1', 'otel-v1-apm-span', 'otel-v2-apm-service-map']);
    assert.deepEqual(r.Properties.RetentionDays, { Ref: 'LogRetentionDays' });
    const pipelineId = Object.keys(t.Resources).find((k) => t.Resources[k].Type === 'AWS::OSIS::Pipeline');
    assert.ok(r.DependsOn.includes(pipelineId), `${id} does not wait for the pipeline`);
  });

  it('runs as a role the collection data access policy admits', () => {
    const fn = t.Resources[r.Properties.ServiceToken['Fn::GetAtt'][0]];
    const roleId = fn.Properties.Role['Fn::GetAtt'][0];
    const policy = Object.values<any>(t.Resources).find((x) => x.Type === 'AWS::OpenSearchServerless::AccessPolicy' && x.Properties.Type === 'data'
      && !JSON.stringify(x.Properties.Policy).includes('demo-read'));
    assert.ok(JSON.stringify(policy.Properties.Policy).includes(`"Fn::GetAtt":["${roleId}","Arn"]`));
  });
});

describe('minimal parameters (the serverless-easy template)', () => {
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new ObservabilityStack(app, 'ObsStack-easy', {
    env: { account: '123456789012', region: 'us-east-1' },
    displayName: 'easy', opensearchType: 'serverless', enableDemo: true, minimalParameters: true,
  });
  const t = Template.fromStack(stack).toJSON();

  it('has only StackDisplayName and AdminRoleArns, and the easy marker', () => {
    assert.deepEqual(Object.keys(t.Parameters).filter((k) => k !== 'BootstrapVersion'), ['StackDisplayName', 'AdminRoleArns']);
    assert.match(t.Description, /\[obs-stack v2 aossv2 easy\]$/);
  });

  it('fixes the other choices at their defaults and always runs the demo', () => {
    const r = (type: string) => Object.values<any>(t.Resources).find((x) => x.Type === type);
    assert.deepEqual([r('AWS::OSIS::Pipeline').Properties.MinUnits, r('AWS::OSIS::Pipeline').Properties.MaxUnits], [1, 4]);
    assert.equal(r('AWS::APS::Workspace').Properties.WorkspaceConfiguration.RetentionPeriodInDays, 150);
    assert.equal(String(r('Custom::IndexRetention').Properties.RetentionDays), '30');
    assert.match(r('AWS::EC2::Instance').Properties.ImageId, /^\{\{resolve:ssm:/);
    assert.equal(r('AWS::EC2::Instance').Condition, undefined);
    assert.equal(t.Conditions.DeployDemo, undefined);
  });
});
