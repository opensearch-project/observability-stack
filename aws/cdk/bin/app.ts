#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const opensearchType = (app.node.tryGetContext('opensearchType') as 'managed' | 'serverless') || 'managed';
const enableDemo = String(app.node.tryGetContext('enableDemo') ?? true) !== 'false';
const adminRoleArns = String(app.node.tryGetContext('adminRoleArns') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);
// Prefix for both stack names, so a second stack can live next to an existing one in the account
// (for example `-c stackNamePrefix=test-` deploys test-ObsInfra and test-ObservabilityStack).
const stackNamePrefix = String(app.node.tryGetContext('stackNamePrefix') ?? '');
if (stackNamePrefix && !/^[A-Za-z][A-Za-z0-9-]*$/.test(stackNamePrefix)) {
  throw new Error(`stackNamePrefix must start with a letter and contain only letters, digits and hyphens: ${stackNamePrefix}`);
}
const optionalString = (key: string, pattern: RegExp, example: string): string | undefined => {
  const value = app.node.tryGetContext(key);
  if (value === undefined || value === '') return undefined;
  if (!pattern.test(String(value))) throw new Error(`${key} must look like ${example}: ${value}`);
  return String(value);
};
// Where the demo instance runs. Default: a public subnet of the default VPC. Opt in to a private subnet behind a
// NAT gateway (-c demoPrivateSubnet=true) or to an existing VPC (-c demoVpcId, optionally -c demoSubnetId).
const demoNetwork = {
  privateSubnet: String(app.node.tryGetContext('demoPrivateSubnet') ?? false) === 'true',
  vpcId: optionalString('demoVpcId', /^vpc-[0-9a-f]{8,17}$/, 'vpc-0123456789abcdef0'),
  subnetId: optionalString('demoSubnetId', /^subnet-[0-9a-f]{8,17}$/, 'subnet-0123456789abcdef0'),
  availabilityZone: optionalString('demoAz', /^[a-z]{2}(-[a-z]+)+-\d[a-z]$/, 'us-east-1b'),
};
if (demoNetwork.subnetId && !demoNetwork.vpcId) throw new Error('demoSubnetId needs demoVpcId');
if (demoNetwork.privateSubnet && demoNetwork.vpcId) throw new Error('demoPrivateSubnet creates a VPC; leave it out with demoVpcId');
if (demoNetwork.availabilityZone && demoNetwork.vpcId) throw new Error('demoAz doesn\'t apply to an existing VPC; use demoSubnetId to place the instance');
if (!enableDemo && Object.values(demoNetwork).some(Boolean)) {
  console.warn('demoPrivateSubnet, demoVpcId, demoSubnetId and demoAz are ignored with -c enableDemo=false');
}
const optionalNumber = (key: string): number | undefined => {
  const value = app.node.tryGetContext(key);
  return value === undefined ? undefined : Number(value);
};

// Slow-changing infra: OpenSearch domain/collection, AMP workspace, DQS data source
const infra = new InfraStack(app, 'ObsInfra', {
  env,
  stackName: `${stackNamePrefix}ObsInfra`,
  opensearchType,
  ...(opensearchType === 'serverless' && {
    aossMinOcu: optionalNumber('aossMinOcu'),
    aossMaxOcu: optionalNumber('aossMaxOcu'),
  }),
  ...(opensearchType !== 'serverless' && {
    osInstanceType: 'r6g.large.search',
    osInstanceCount: 1,
    osVolumeSize: 100,
  }),
  adminRoleArns,
});

// Fast-iteration stack: FGAC, OSIS pipeline, OpenSearch App, UI init
new ObservabilityStack(app, 'ObservabilityStack', {
  env,
  stackName: `${stackNamePrefix}ObservabilityStack`,
  infra,
  minOcu: 1,
  maxOcu: 4,
  enableDemo,
  demoNetwork,
  adminRoleArns,
  // -c evaluationRetentionDays=<days>: evaluation indices are deleted after this many days (default 7, 0 keeps them)
  evaluationRetentionDays: optionalNumber('evaluationRetentionDays'),
});
