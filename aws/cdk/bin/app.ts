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
  adminRoleArns,
});
