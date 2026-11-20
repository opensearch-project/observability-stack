import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IngestionPipeline, EVALUATION_INDEX, EVALUATION_TEMPLATE_JSON, evaluationPolicyJson } from './ingestion-pipeline';
import { OpenSearchAppConstruct } from './opensearch-app';
import { DemoWorkload } from './demo-workload';
import { InfraStack, InfraStackProps } from './infra-stack';

export interface ObservabilityStackProps extends cdk.StackProps, InfraStackProps {
  /** Name shown in the console; the stack is ObsStack-<displayName> and resources are tagged with it. */
  displayName: string;
  minOcu?: number;
  maxOcu?: number;
  enableDemo?: boolean;
  /** IAM role ARNs mapped to all_access and security_manager and made OpenSearch UI admins, e.g. the roles people use to open Dashboards. */
  adminRoleArns?: string[];
  /** Days before evaluation result indices are deleted on a managed domain (default 7; 0 keeps them). */
  evaluationRetentionDays?: number;
}

export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const infra = new InfraStack(this, 'Infra', props);
    const isServerless = infra.opensearchType === 'serverless';
    const backend = isServerless ? 'aossv2' : 'aos-domain';

    // Read by the console's Observability stacks page. The stack name and this Description
    // marker identify the stack without tags, which customers can remove.
    this.templateOptions.description =
      `OpenSearch Observability Stack - deployed with the observability-stack CDK. [obs-stack v2 ${backend}]`;
    // Tags.of a stack sets stack-level tags, which CloudFormation copies to every resource that supports tags.
    // Read by the CLI installer's list and destroy.
    cdk.Tags.of(this).add('observability-stack', this.stackName);
    cdk.Tags.of(this).add('opensearch:observability-stack', props.displayName);
    cdk.Tags.of(this).add('opensearch:observability-stack-source', 'cdk');
    cdk.Tags.of(this).add('opensearch:obs-stack-generation', 'v2');
    cdk.Tags.of(this).add('opensearch:obs-backend', backend);
    const version = this.node.tryGetContext('observabilityStackVersion');
    if (version) cdk.Tags.of(this).add('opensearch:observability-stack-version', String(version));

    for (const arn of props.adminRoleArns ?? []) {
      if (!/^arn:aws[a-z-]*:iam::\d{12}:role\/[\w+=,.@\/-]+$/.test(arn)) {
        throw new Error(`adminRoleArns entry is not an IAM role ARN: ${arn}`);
      }
    }

    const uiInitRole = iam.Role.fromRoleArn(this, 'UiInitRole', infra.uiInitRoleArn, { mutable: false });

    // FGAC role mapping (managed domains only — serverless uses IAM)
    let fgacMapping: cdk.CustomResource | undefined;
    let fgacServiceToken: string | undefined;
    if (!isServerless) {
      const fgacFn = new NodejsFunction(this, 'FgacMappingFn', {
        runtime: Runtime.NODEJS_22_X,
        handler: 'cfnHandler',
        entry: path.join(__dirname, '..', 'custom-resources', 'fgac-mapping', 'index.ts'),
        timeout: cdk.Duration.minutes(5),
        role: iam.Role.fromRoleArn(this, 'FgacAdminRole', infra.fgacAdminRoleArn, { mutable: false }),
        bundling: { externalModules: ['@aws-sdk/credential-provider-node'], minify: true },
      });

      fgacServiceToken = fgacFn.functionArn;
      fgacMapping = new cdk.CustomResource(this, 'FgacMapping', {
        serviceToken: fgacFn.functionArn,
        resourceType: 'Custom::FgacMapping',
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
        handler: 'cfnHandler',
        entry: path.join(__dirname, '..', 'custom-resources', 'eval-index', 'index.ts'),
        timeout: cdk.Duration.minutes(10),
        role: iam.Role.fromRoleArn(this, 'EvalIndexAdminRole', infra.fgacAdminRoleArn, { mutable: false }),
        bundling: { externalModules: ['@aws-sdk/credential-provider-node'], minify: true },
      });
      evalIndex = new cdk.CustomResource(this, 'EvalIndex', {
        serviceToken: evalIndexFn.functionArn,
        resourceType: 'Custom::EvaluationIndex',
        properties: {
          OpenSearchEndpoint: infra.domainEndpoint,
          Region: this.region,
          Alias: EVALUATION_INDEX,
          TemplateName: `${EVALUATION_INDEX}-index-template`,
          PolicyId: `${EVALUATION_INDEX}-policy`,
          Template: EVALUATION_TEMPLATE_JSON,
          Policy: evaluationPolicyJson(props.evaluationRetentionDays),
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
      // Runs as the FGAC admin role, whose es:ESHttp* policy is in the infra construct.
      evalIndex.node.addDependency(infra);
    }

    // OpenSearch Application + UI init
    const app = new OpenSearchAppConstruct(this, 'OpenSearchApp', {
      displayName: props.displayName,
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
      fgacMapping.node.addDependency(infra);
    }
    // Same order the separate infra stack gave: OSIS validates its role's es:DescribeDomain at create,
    // so the role's policy has to exist before the pipeline.
    pipeline.node.addDependency(infra);
    app.node.addDependency(infra);

    const enableDemo = props.enableDemo ?? false;
    // Records the synth-time demo choice for the console, which reads it to show or hide the demo step.
    new cdk.CfnParameter(this, 'DeployDemoWorkload', {
      type: 'String',
      default: String(enableDemo),
      allowedValues: [String(enableDemo)],
      description: 'Whether this stack deploys the demo workload. Set with -c enableDemo at synth time.',
    });
    if (enableDemo) {
      const demo = new DemoWorkload(this, 'DemoWorkload', {
        pipeline,
        opensearch: {
          serverless: isServerless,
          // Collection endpoints include the scheme; domain endpoints do not.
          url: isServerless ? infra.domainEndpoint : `https://${infra.domainEndpoint}`,
          arn: infra.domainArn,
          collectionName: infra.collectionName,
        },
      });
      // The eval canary reads agent spans. Managed domains map the demo role to readall.
      if (fgacServiceToken) {
        const demoFgac = new cdk.CustomResource(this, 'DemoFgacMapping', {
          serviceToken: fgacServiceToken,
          resourceType: 'Custom::FgacMapping',
          properties: {
            OpenSearchEndpoint: infra.domainEndpoint,
            RoleArns: JSON.stringify([demo.role.roleArn]),
            Region: this.region,
            FgacRoles: JSON.stringify(['readall']),
          },
        });
        demoFgac.node.addDependency(infra);
        // Both mappings write the security index; concurrent writes fail with a 409 version conflict.
        if (fgacMapping) demoFgac.node.addDependency(fgacMapping);
        demo.instance.node.addDependency(demoFgac);
      }
    }

    const osisEndpoint = cdk.Fn.join('', ['https://', cdk.Fn.select(0, pipeline.pipeline.attrIngestEndpointUrls)]);
    const out = (key: string, value: string) => new cdk.CfnOutput(this, key, { value });
    out('OpenSearchEndpoint', infra.domainEndpoint);
    out('PrometheusWorkspaceId', infra.ampWorkspaceId);
    out('OsisIngestEndpoint', osisEndpoint);
    // Output keys the console's stack detail page reads.
    out('ObsStackGeneration', 'V2');
    out('OSISEndpoint', osisEndpoint);
    out('OSISPipelineArn', pipeline.pipeline.attrPipelineArn);
    out(isServerless ? 'AOSSEndpoint' : 'DomainEndpoint', isServerless ? infra.domainEndpoint : `https://${infra.domainEndpoint}`);
    out(isServerless ? 'CollectionArn' : 'DomainArn', infra.domainArn);
    out('AMPEndpoint', infra.ampEndpoint);
    out('AmpWorkspaceArn', infra.ampWorkspaceArn);
    out('DirectQueryRoleArn', infra.dqsRoleArn);
    out('PrometheusDataSourceArn', infra.dqsDataSourceArn);
    out('AppEndpoint', app.appEndpoint);
    out('AppId', app.appId);
    out('WorkspaceId', app.workspaceId);
    out('WorkspaceUrl', app.workspaceUrl);
  }
}
