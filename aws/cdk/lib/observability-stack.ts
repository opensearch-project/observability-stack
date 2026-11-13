import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IngestionPipeline, EVALUATION_INDEX, EVALUATION_POLICY_JSON, EVALUATION_TEMPLATE_JSON } from './ingestion-pipeline';
import { OpenSearchAppConstruct } from './opensearch-app';
import { DemoWorkload } from './demo-workload';
import { InfraStack } from './infra-stack';

export interface ObservabilityStackProps extends cdk.StackProps {
  infra: InfraStack;
  minOcu?: number;
  maxOcu?: number;
  enableDemo?: boolean;
  /** IAM role ARNs mapped to all_access and security_manager and made OpenSearch UI admins, e.g. the roles people use to open Dashboards. */
  adminRoleArns?: string[];
}

export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const { infra } = props;

    cdk.Tags.of(this).add('observability-stack', this.stackName);

    const isServerless = infra.opensearchType === 'serverless';

    for (const arn of props.adminRoleArns ?? []) {
      if (!/^arn:aws[a-z-]*:iam::\d{12}:role\/[\w+=,.@\/-]+$/.test(arn)) {
        throw new Error(`adminRoleArns entry is not an IAM role ARN: ${arn}`);
      }
    }

    const uiInitRole = iam.Role.fromRoleArn(this, 'UiInitRole', infra.uiInitRoleArn, { mutable: false });

    // FGAC role mapping (managed domains only — serverless uses IAM)
    let fgacMapping: cdk.CustomResource | undefined;
    if (!isServerless) {
      const fgacFn = new NodejsFunction(this, 'FgacMappingFn', {
        runtime: Runtime.NODEJS_22_X,
        handler: 'handler',
        entry: path.join(__dirname, '..', 'custom-resources', 'fgac-mapping', 'index.ts'),
        timeout: cdk.Duration.minutes(5),
        role: iam.Role.fromRoleArn(this, 'FgacAdminRole', infra.fgacAdminRoleArn, { mutable: false }),
        bundling: { externalModules: ['@aws-sdk/credential-provider-node'] },
      });

      const fgacProvider = new cr.Provider(this, 'FgacProvider', { onEventHandler: fgacFn });
      fgacMapping = new cdk.CustomResource(this, 'FgacMapping', {
        serviceToken: fgacProvider.serviceToken,
        properties: {
          OpenSearchEndpoint: infra.domainEndpoint,
          RoleArns: JSON.stringify([infra.pipelineRoleArn, uiInitRole.roleArn, ...(props.adminRoleArns ?? [])]),
          Region: this.region,
        },
      });
    }

    // GenAI evaluation index (managed only): rollover policy, template and write alias. Serverless
    // collections have no ISM or aliases; the pipeline creates the index there.
    let evalIndex: cdk.CustomResource | undefined;
    if (!isServerless) {
      const evalIndexFn = new NodejsFunction(this, 'EvalIndexFn', {
        runtime: Runtime.NODEJS_22_X,
        handler: 'handler',
        entry: path.join(__dirname, '..', 'custom-resources', 'eval-index', 'index.ts'),
        timeout: cdk.Duration.minutes(10),
        role: iam.Role.fromRoleArn(this, 'EvalIndexAdminRole', infra.fgacAdminRoleArn, { mutable: false }),
        bundling: { externalModules: ['@aws-sdk/credential-provider-node'] },
      });
      const evalIndexProvider = new cr.Provider(this, 'EvalIndexProvider', { onEventHandler: evalIndexFn });
      evalIndex = new cdk.CustomResource(this, 'EvalIndex', {
        serviceToken: evalIndexProvider.serviceToken,
        properties: {
          OpenSearchEndpoint: infra.domainEndpoint,
          Region: this.region,
          Alias: EVALUATION_INDEX,
          TemplateName: `${EVALUATION_INDEX}-index-template`,
          PolicyId: `${EVALUATION_INDEX}-policy`,
          Template: EVALUATION_TEMPLATE_JSON,
          Policy: EVALUATION_POLICY_JSON,
        },
      });
    }

    // OSIS pipeline
    const pipeline = new IngestionPipeline(this, 'IngestionPipeline', {
      domainEndpoint: infra.domainEndpoint,
      prometheusWorkspaceArn: infra.ampWorkspaceArn,
      prometheusWorkspaceId: infra.ampWorkspaceId,
      pipelineRoleArn: infra.pipelineRoleArn,
      region: this.region,
      minOcu: props.minOcu ?? 1,
      maxOcu: props.maxOcu ?? 4,
      serverless: isServerless,
    });

    // The pipeline's sink would otherwise create a plain index with the alias name first.
    if (evalIndex) {
      pipeline.node.addDependency(evalIndex);
    }

    // OpenSearch Application + UI init
    const app = new OpenSearchAppConstruct(this, 'OpenSearchApp', {
      domainArn: infra.domainArn,
      domainEndpoint: infra.domainEndpoint,
      dqsDataSourceArn: infra.dqsDataSourceArn,
      uiInitRole,
      adminRoleArns: props.adminRoleArns,
      uiInitDependsOn: [pipeline],
    });
    if (!props.adminRoleArns?.length) {
      cdk.Annotations.of(this).addWarning(
        'No adminRoleArns set, so no IAM role you sign in with can open Dashboards. Redeploy with -c adminRoleArns=<role ARN>[,<role ARN>]. Each listed role also needs es:ESHttp* (managed) or aoss:APIAccessAll (serverless) in its own IAM policy.',
      );
    }
    if (fgacMapping) {
      app.node.addDependency(fgacMapping);
    }

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
