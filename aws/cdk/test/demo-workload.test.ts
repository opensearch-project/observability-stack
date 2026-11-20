import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { InfraStack } from '../lib/infra-stack';
import { ObservabilityStack } from '../lib/observability-stack';

function synth() {
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const env = { account: '123456789012', region: 'us-east-1' };
  const infra = new InfraStack(app, 'ObsInfra', { env });
  const stack = new ObservabilityStack(app, 'ObservabilityStack', { env, infra, enableDemo: true });
  return Template.fromStack(stack).toJSON();
}

describe('DemoWorkload', () => {
  const t = synth();
  const ofType = (type: string) => Object.entries<any>(t.Resources).filter(([, r]) => r.Type === type);

  it('runs the instance in the private subnet of its own VPC, without a public IP', () => {
    assert.equal(ofType('AWS::EC2::VPC').length, 1);
    assert.equal(ofType('AWS::EC2::NatGateway').length, 1);
    assert.equal(ofType('AWS::EC2::EIP').length, 1);
    const [[, instance]] = ofType('AWS::EC2::Instance');
    const subnetId = instance.Properties.SubnetId.Ref;
    assert.match(subnetId, /private/i);
    assert.equal(t.Resources[subnetId].Properties.MapPublicIpOnLaunch, false);
    assert.equal(instance.Properties.NetworkInterfaces, undefined);
  });

  it('writes the demo FGAC mapping after the stack FGAC mapping', () => {
    const mappings = Object.entries<any>(t.Resources).filter(([, r]) => r.Properties?.RoleArns !== undefined);
    const [[stackMapping]] = mappings.filter(([id]) => id !== 'DemoFgacMapping');
    assert.equal(mappings.length, 2);
    assert.ok((t.Resources.DemoFgacMapping.DependsOn ?? []).includes(stackMapping));
  });
});
