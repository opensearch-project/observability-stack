import * as cdk from 'aws-cdk-lib';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface OpenSearchConstructProps {
  instanceType: string;
  instanceCount: number;
  volumeSize: number;
}

export class OpenSearchConstruct extends Construct {
  public readonly domain: opensearch.Domain;
  public readonly pipelineRole: iam.Role;
  /** FGAC master user. The FGAC mapping Lambda runs as this role. */
  public readonly fgacAdminRole: iam.Role;

  constructor(scope: Construct, id: string, props: OpenSearchConstructProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

    this.fgacAdminRole = new iam.Role(this, 'FgacAdminRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
    });

    this.domain = new opensearch.Domain(this, 'Domain', {
      version: opensearch.EngineVersion.openSearch('3.7'),
      capacity: {
        dataNodeInstanceType: props.instanceType,
        dataNodes: props.instanceCount,
      },
      ebs: {
        volumeSize: props.volumeSize,
        volumeType: cdk.aws_ec2.EbsDeviceVolumeType.GP3,
      },
      nodeToNodeEncryption: true,
      encryptionAtRest: { enabled: true },
      enforceHttps: true,
      fineGrainedAccessControl: {
        masterUserArn: this.fgacAdminRole.roleArn,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    // FGAC authorizes each caller; this policy limits callers to signed requests from this account.
    // Set inline on the domain: the L2 accessPolicies prop applies it with a post-create
    // UpdateDomainConfig, and the domain rejects new data source associations while that processes.
    (this.domain.node.defaultChild as opensearch.CfnDomain).accessPolicies = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { AWS: `arn:${stack.partition}:iam::${stack.account}:root` },
        Action: 'es:ESHttp*',
        Resource: `arn:aws:es:${stack.region}:${stack.account}:domain/*/*`,
      }],
    };

    this.fgacAdminRole.addToPolicy(new iam.PolicyStatement({
      actions: ['es:ESHttp*'],
      resources: [this.domain.domainArn, `${this.domain.domainArn}/*`],
    }));

    // IAM role for OSIS pipeline
    this.pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('osis-pipelines.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': stack.account },
          ArnLike: { 'aws:SourceArn': `arn:${stack.partition}:osis:${stack.region}:${stack.account}:pipeline/*` },
        },
      }),
    });
    this.domain.grantReadWrite(this.pipelineRole);
    this.pipelineRole.addToPolicy(new iam.PolicyStatement({
      actions: ['es:DescribeDomain'],
      resources: [this.domain.domainArn],
    }));
    this.pipelineRole.addToPolicy(new iam.PolicyStatement({
      actions: ['aps:RemoteWrite'],
      resources: ['*'], // Will be scoped when AMP workspace is known
    }));
  }
}
