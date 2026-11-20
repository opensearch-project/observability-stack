import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { InfraStack } from '../lib/infra-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { DemoNetwork } from '../lib/demo-workload';

const VPC_ID = 'vpc-0123456789abcdef0';
// What `cdk synth` caches in cdk.context.json for Vpc.fromLookup: one private (NAT) and one isolated subnet.
const LOOKUP_CONTEXT = {
  [`vpc-provider:account=123456789012:filter.vpc-id=${VPC_ID}:region=us-east-1:returnAsymmetricSubnets=true`]: {
    vpcId: VPC_ID, vpcCidrBlock: '10.0.0.0/16', ownerAccountId: '123456789012', availabilityZones: [],
    subnetGroups: [
      { name: 'Private', type: 'Private', subnets: [{ subnetId: 'subnet-0000000000000a001', cidr: '10.0.1.0/24', availabilityZone: 'us-east-1a', routeTableId: 'rtb-1' }] },
      { name: 'Isolated', type: 'Isolated', subnets: [{ subnetId: 'subnet-0000000000000b002', cidr: '10.0.2.0/24', availabilityZone: 'us-east-1b', routeTableId: 'rtb-2' }] },
    ],
  },
  'availability-zones:account=123456789012:region=us-east-1': ['us-east-1a', 'us-east-1b', 'us-east-1c'],
};

function synth(demoNetwork?: DemoNetwork) {
  const app = new cdk.App({ context: { 'aws:cdk:bundling-stacks': [], ...LOOKUP_CONTEXT } });
  const env = { account: '123456789012', region: 'us-east-1' };
  const infra = new InfraStack(app, 'ObsInfra', { env });
  const stack = new ObservabilityStack(app, 'ObservabilityStack', { env, infra, enableDemo: true, demoNetwork });
  return Template.fromStack(stack).toJSON();
}

const instanceOf = (t: any) => Object.values<any>(t.Resources).find((r) => r.Type === 'AWS::EC2::Instance').Properties;
const count = (t: any, type: string) => Object.values<any>(t.Resources).filter((r) => r.Type === type).length;

describe('DemoWorkload in an existing VPC', () => {
  it('uses a private subnet of the VPC and creates no VPC or NAT gateway', () => {
    const t = synth({ vpcId: VPC_ID });
    assert.equal(count(t, 'AWS::EC2::VPC') + count(t, 'AWS::EC2::NatGateway') + count(t, 'AWS::EC2::EIP'), 0);
    assert.equal(instanceOf(t).SubnetId, 'subnet-0000000000000a001');
  });

  it('uses demoSubnetId when it is given', () => {
    assert.equal(instanceOf(synth({ vpcId: VPC_ID, subnetId: 'subnet-0000000000000b002' })).SubnetId, 'subnet-0000000000000b002');
  });

  it('fails synth for a subnet that is not in the VPC', () => {
    assert.throws(() => synth({ vpcId: VPC_ID, subnetId: 'subnet-0000000000000c003' }), /is not a subnet of/);
  });
});

describe('DemoWorkload with demoAz', () => {
  it('creates the VPC in that zone', () => {
    const t = synth({ availabilityZone: 'us-east-1c' });
    const subnetId = instanceOf(t).SubnetId.Ref;
    assert.equal(t.Resources[subnetId].Properties.AvailabilityZone, 'us-east-1c');
  });
});

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
