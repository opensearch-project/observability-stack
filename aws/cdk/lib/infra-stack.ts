import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { OpenSearchConstruct } from './opensearch';
import { PrometheusConstruct } from './prometheus';

export interface InfraStackProps extends cdk.StackProps {
  osInstanceType?: string;
  osInstanceCount?: number;
  osVolumeSize?: number;
}

export class InfraStack extends cdk.Stack {
  public readonly domainEndpoint: string;
  public readonly domainArn: string;
  public readonly masterPasswordSecretArn: string;
  public readonly pipelineRoleArn: string;
  public readonly ampWorkspaceArn: string;
  public readonly ampWorkspaceId: string;
  public readonly dqsDataSourceArn: string;
  public readonly dqsRoleArn: string;

  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('observability-stack', this.stackName);

    const opensearch = new OpenSearchConstruct(this, 'OpenSearch', {
      instanceType: props.osInstanceType ?? 'r6g.large.search',
      instanceCount: props.osInstanceCount ?? 1,
      volumeSize: props.osVolumeSize ?? 100,
    });

    const prometheus = new PrometheusConstruct(this, 'Prometheus', {
      domainArn: opensearch.domain.domainArn,
    });

    // Store for cross-stack refs
    this.domainEndpoint = opensearch.domain.domainEndpoint;
    this.domainArn = opensearch.domain.domainArn;
    this.masterPasswordSecretArn = opensearch.masterPasswordSecret.secretArn;
    this.pipelineRoleArn = opensearch.pipelineRole.roleArn;
    this.ampWorkspaceArn = prometheus.workspace.attrArn;
    this.ampWorkspaceId = prometheus.workspace.attrWorkspaceId;
    this.dqsDataSourceArn = prometheus.dataSourceArn;
    this.dqsRoleArn = prometheus.dqsRole.roleArn;

    // Exports
    const exp = (name: string, value: string) =>
      new cdk.CfnOutput(this, name, { value, exportName: `${this.stackName}-${name}` });

    exp('DomainEndpoint', this.domainEndpoint);
    exp('DomainArn', this.domainArn);
    exp('MasterPasswordSecretArn', this.masterPasswordSecretArn);
    exp('PipelineRoleArn', this.pipelineRoleArn);
    exp('AmpWorkspaceArn', this.ampWorkspaceArn);
    exp('AmpWorkspaceId', this.ampWorkspaceId);
    exp('DqsDataSourceArn', this.dqsDataSourceArn);
    exp('DqsRoleArn', this.dqsRoleArn);
  }
}
