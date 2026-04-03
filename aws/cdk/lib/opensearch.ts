import * as cdk from 'aws-cdk-lib';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface OpenSearchConstructProps {
  instanceType: string;
  instanceCount: number;
  volumeSize: number;
}

export class OpenSearchConstruct extends Construct {
  public readonly domain: opensearch.Domain;
  public readonly pipelineRole: iam.Role;
  public readonly masterPasswordSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: OpenSearchConstructProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

    this.masterPasswordSecret = new secretsmanager.Secret(this, 'MasterPassword', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludePunctuation: false,
        passwordLength: 24,
      },
    });

    this.domain = new opensearch.Domain(this, 'Domain', {
      version: opensearch.EngineVersion.openSearch('3.5'),
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
        masterUserName: 'admin',
        masterUserPassword: this.masterPasswordSecret.secretValueFromJson('password'),
      },
      accessPolicies: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.AnyPrincipal()],
          actions: ['es:*'],
          resources: [`arn:aws:es:${stack.region}:${stack.account}:domain/*/*`],
        }),
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // IAM role for OSIS pipeline
    this.pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('osis-pipelines.amazonaws.com'),
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
