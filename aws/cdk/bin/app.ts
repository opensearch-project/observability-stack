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

// Slow-changing infra: OpenSearch domain/collection, AMP workspace, DQS data source
const infra = new InfraStack(app, 'ObsInfra', {
  env,
  opensearchType,
  ...(opensearchType !== 'serverless' && {
    osInstanceType: 'r6g.large.search',
    osInstanceCount: 1,
    osVolumeSize: 100,
  }),
});

// Fast-iteration stack: FGAC, OSIS pipeline, OpenSearch App, UI init
new ObservabilityStack(app, 'ObservabilityStack', {
  env,
  infra,
  minOcu: 1,
  maxOcu: 4,
  enableDemo: true,
});
