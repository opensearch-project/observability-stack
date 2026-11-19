#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
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
const optionalNumber = (key: string): number | undefined => {
  const value = app.node.tryGetContext(key);
  return value === undefined ? undefined : Number(value);
};

const stackName = String(app.node.tryGetContext('stackName') ?? '');
if (!/^[a-z][a-z0-9-]{1,15}[a-z0-9]$/.test(stackName)) {
  throw new Error('Set -c stackName=<name>: 3-17 characters, lowercase letters, digits and hyphens, starting with a letter. The stack is deployed as ObsStack-<name>.');
}

new ObservabilityStack(app, `ObsStack-${stackName}`, {
  env,
  displayName: stackName,
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
  minOcu: 1,
  maxOcu: 4,
  enableDemo,
  adminRoleArns,
  // -c evaluationRetentionDays=<days>: evaluation indices are deleted after this many days (default 7, 0 keeps them)
  evaluationRetentionDays: optionalNumber('evaluationRetentionDays'),
});
