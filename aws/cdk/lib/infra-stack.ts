import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { denyCreateLogGroup } from './function-log-group';
import { OpenSearchConstruct } from './opensearch';
import { OpenSearchServerlessConstruct } from './opensearch-serverless';
import { PrometheusConstruct } from './prometheus';

export interface InfraStackProps {
  opensearchType?: 'managed' | 'serverless';
  /** Days of metrics the Prometheus workspace keeps (default 150). */
  metricsRetentionDays?: number;
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

export class InfraStack extends Construct {
  public readonly opensearchType: string;
  public readonly domainEndpoint: string;
  public readonly domainArn: string;
  /** Serverless collection name; empty for managed domains. */
  public readonly collectionName: string;
  public readonly fgacAdminRoleArn: string;
  public readonly pipelineRoleArn: string;
  public readonly ampWorkspaceArn: string;
  public readonly ampWorkspaceId: string;
  public readonly ampEndpoint: string;
  public readonly dqsDataSourceArn: string;
  public readonly dqsRoleArn: string;
  public readonly uiInitRoleArn: string;

  public readonly pipelineRole: iam.Role;

  constructor(scope: Construct, id: string, props: InfraStackProps & {
    /** Resources are named obs-<displayName>-*. */
    displayName: string;
    /** The AdminRoleArns parameter, and whether it has entries. */
    adminRoleList?: string[];
    adminRoleListNotEmpty?: cdk.CfnCondition;
  }) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

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
    uiInitRole.addToPolicy(denyCreateLogGroup());
    this.uiInitRoleArn = uiInitRole.roleArn;

    if (this.opensearchType === 'serverless') {
      const collectionName = `obs-${props.displayName}`;
      const serverless = new OpenSearchServerlessConstruct(this, 'OpenSearchServerless', {
        collectionName,
        dataAccessRoleArns: [uiInitRole.roleArn],
        dataAccessRoleList: props.adminRoleList,
        dataAccessRoleListNotEmpty: props.adminRoleListNotEmpty,
        minOcu: props.aossMinOcu,
        maxOcu: props.aossMaxOcu,
      });

      this.domainEndpoint = serverless.collectionEndpoint;
      this.domainArn = serverless.collectionArn;
      this.collectionName = collectionName;
      this.fgacAdminRoleArn = '';
      this.pipelineRole = serverless.pipelineRole;
      this.pipelineRoleArn = serverless.pipelineRole.roleArn;
    } else {
      const opensearch = new OpenSearchConstruct(this, 'OpenSearch', {
        domainName: `obs-${props.displayName}`,
        instanceType: props.osInstanceType ?? 'r7g.large.search',
        instanceCount: props.osInstanceCount ?? 1,
        volumeSize: props.osVolumeSize ?? 100,
      });

      this.domainEndpoint = opensearch.domain.domainEndpoint;
      this.domainArn = opensearch.domain.domainArn;
      this.collectionName = '';
      this.fgacAdminRoleArn = opensearch.fgacAdminRole.roleArn;
      this.pipelineRole = opensearch.pipelineRole;
      this.pipelineRoleArn = opensearch.pipelineRole.roleArn;
    }

    const prometheus = new PrometheusConstruct(this, 'Prometheus', {
      domainArn: this.domainArn,
      displayName: props.displayName,
      metricsRetentionDays: props.metricsRetentionDays ?? 150,
    });

    this.ampWorkspaceArn = prometheus.workspace.attrArn;
    this.ampWorkspaceId = prometheus.workspace.attrWorkspaceId;
    this.ampEndpoint = prometheus.workspace.attrPrometheusEndpoint;
    this.dqsDataSourceArn = prometheus.dataSourceArn;
    this.dqsRoleArn = prometheus.dqsRole.roleArn;
  }
}
