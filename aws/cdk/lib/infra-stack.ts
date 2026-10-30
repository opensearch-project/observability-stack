import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { OpenSearchConstruct } from './opensearch';
import { OpenSearchServerlessConstruct } from './opensearch-serverless';
import { PrometheusConstruct } from './prometheus';

export interface InfraStackProps extends cdk.StackProps {
  opensearchType?: 'managed' | 'serverless';
  osInstanceType?: string;
  osInstanceCount?: number;
  osVolumeSize?: number;
  /** IAM role ARNs given data access on serverless collections. */
  adminRoleArns?: string[];
  /** Serverless collection group minimum indexing and search OCU (default 0). */
  aossMinOcu?: number;
  /** Serverless collection group maximum indexing and search OCU (default 16). */
  aossMaxOcu?: number;
}

export class InfraStack extends cdk.Stack {
  public readonly opensearchType: string;
  public readonly domainEndpoint: string;
  public readonly domainArn: string;
  public readonly fgacAdminRoleArn: string;
  public readonly pipelineRoleArn: string;
  public readonly ampWorkspaceArn: string;
  public readonly ampWorkspaceId: string;
  public readonly dqsDataSourceArn: string;
  public readonly dqsRoleArn: string;
  public readonly uiInitRoleArn: string;

  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('observability-stack', this.stackName);

    this.opensearchType = props.opensearchType ?? 'managed';

    // Runs the UI init Lambda in ObservabilityStack. Defined here so the serverless data
    // access policy can list it; the Lambda imports it, so its permissions are attached here.
    const uiInitRole = new iam.Role(this, 'UiInitRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
    });
    uiInitRole.addToPolicy(new iam.PolicyStatement({
      actions: ['es:*', 'opensearch:*', 'aoss:*'],
      resources: ['*'],
    }));
    this.uiInitRoleArn = uiInitRole.roleArn;

    if (this.opensearchType === 'serverless') {
      const collectionName = `obs-${this.stackName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32);
      const serverless = new OpenSearchServerlessConstruct(this, 'OpenSearchServerless', {
        collectionName,
        dataAccessRoleArns: [uiInitRole.roleArn, ...(props.adminRoleArns ?? [])],
        minOcu: props.aossMinOcu,
        maxOcu: props.aossMaxOcu,
      });

      this.domainEndpoint = serverless.collectionEndpoint;
      this.domainArn = serverless.collectionArn;
      this.fgacAdminRoleArn = '';
      this.pipelineRoleArn = serverless.pipelineRole.roleArn;
    } else {
      const opensearch = new OpenSearchConstruct(this, 'OpenSearch', {
        instanceType: props.osInstanceType ?? 'r6g.large.search',
        instanceCount: props.osInstanceCount ?? 1,
        volumeSize: props.osVolumeSize ?? 100,
      });

      this.domainEndpoint = opensearch.domain.domainEndpoint;
      this.domainArn = opensearch.domain.domainArn;
      this.fgacAdminRoleArn = opensearch.fgacAdminRole.roleArn;
      // Stacks deployed with basic-auth FGAC import this ARN; keep the export so they can update.
      this.exportValue(opensearch.masterPasswordSecret.secretArn);
      this.pipelineRoleArn = opensearch.pipelineRole.roleArn;
    }

    const prometheus = new PrometheusConstruct(this, 'Prometheus', {
      domainArn: this.domainArn,
    });

    this.ampWorkspaceArn = prometheus.workspace.attrArn;
    this.ampWorkspaceId = prometheus.workspace.attrWorkspaceId;
    this.dqsDataSourceArn = prometheus.dataSourceArn;
    this.dqsRoleArn = prometheus.dqsRole.roleArn;

    // Exports
    const exp = (name: string, value: string) =>
      new cdk.CfnOutput(this, name, { value, exportName: `${this.stackName}-${name}` });

    exp('OpenSearchType', this.opensearchType);
    exp('DomainEndpoint', this.domainEndpoint);
    exp('DomainArn', this.domainArn);
    exp('PipelineRoleArn', this.pipelineRoleArn);
    exp('AmpWorkspaceArn', this.ampWorkspaceArn);
    exp('AmpWorkspaceId', this.ampWorkspaceId);
    exp('DqsDataSourceArn', this.dqsDataSourceArn);
    exp('DqsRoleArn', this.dqsRoleArn);
  }
}
