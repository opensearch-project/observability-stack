import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IngestionPipeline } from './ingestion-pipeline';
import { OpenSearchAppConstruct } from './opensearch-app';
import { DemoWorkload } from './demo-workload';
import { InfraStack } from './infra-stack';

export interface ObservabilityStackProps extends cdk.StackProps {
  infra: InfraStack;
  minOcu?: number;
  maxOcu?: number;
  enableDemo?: boolean;
}

export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const { infra } = props;

    cdk.Tags.of(this).add('observability-stack', this.stackName);

    // FGAC role mapping
    const fgacFn = new NodejsFunction(this, 'FgacMappingFn', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '..', 'custom-resources', 'fgac-mapping', 'index.ts'),
      timeout: cdk.Duration.minutes(5),
      bundling: { externalModules: ['@aws-sdk/*'] },
    });
    secretsmanager.Secret.fromSecretCompleteArn(this, 'MasterPassword', infra.masterPasswordSecretArn).grantRead(fgacFn);

    const fgacProvider = new cr.Provider(this, 'FgacProvider', { onEventHandler: fgacFn });
    const fgacMapping = new cdk.CustomResource(this, 'FgacMapping', {
      serviceToken: fgacProvider.serviceToken,
      properties: {
        OpenSearchEndpoint: infra.domainEndpoint,
        MasterUserSecretArn: infra.masterPasswordSecretArn,
        MasterUserName: 'admin',
        RoleArns: JSON.stringify([infra.pipelineRoleArn]),
        Region: this.region,
      },
    });

    // OSIS pipeline
    const pipeline = new IngestionPipeline(this, 'IngestionPipeline', {
      domainEndpoint: infra.domainEndpoint,
      prometheusWorkspaceArn: infra.ampWorkspaceArn,
      prometheusWorkspaceId: infra.ampWorkspaceId,
      pipelineRoleArn: infra.pipelineRoleArn,
      region: this.region,
      minOcu: props.minOcu ?? 1,
      maxOcu: props.maxOcu ?? 4,
    });

    // OpenSearch Application + UI init
    const app = new OpenSearchAppConstruct(this, 'OpenSearchApp', {
      domainArn: infra.domainArn,
      domainEndpoint: infra.domainEndpoint,
      dqsDataSourceArn: infra.dqsDataSourceArn,
    });
    app.node.addDependency(fgacMapping);

    if (props.enableDemo ?? false) {
      new DemoWorkload(this, 'DemoWorkload', { pipeline });
    }

    new cdk.CfnOutput(this, 'OpenSearchEndpoint', { value: infra.domainEndpoint });
    new cdk.CfnOutput(this, 'PrometheusWorkspaceId', { value: infra.ampWorkspaceId });
    new cdk.CfnOutput(this, 'OsisIngestEndpoint', {
      value: cdk.Fn.join('', ['https://', cdk.Fn.select(0, pipeline.pipeline.attrIngestEndpointUrls)]),
    });
  }
}
