import * as cdk from 'aws-cdk-lib';
import * as aoss from 'aws-cdk-lib/aws-opensearchserverless';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface OpenSearchServerlessConstructProps {
  collectionName: string;
}

export class OpenSearchServerlessConstruct extends Construct {
  public readonly collection: aoss.CfnCollection;
  public readonly collectionEndpoint: string;
  public readonly collectionArn: string;
  public readonly pipelineRole: iam.Role;

  constructor(scope: Construct, id: string, props: OpenSearchServerlessConstructProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const name = props.collectionName;

    // Encryption policy (required before collection creation)
    const encPolicy = new aoss.CfnSecurityPolicy(this, 'EncryptionPolicy', {
      name: `${name}-enc`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [{ ResourceType: 'collection', Resource: [`collection/${name}`] }],
        AWSOwnedKey: true,
      }),
    });

    // Network policy (public access for development)
    new aoss.CfnSecurityPolicy(this, 'NetworkPolicy', {
      name: `${name}-net`,
      type: 'network',
      policy: JSON.stringify([{
        Rules: [
          { ResourceType: 'collection', Resource: [`collection/${name}`] },
          { ResourceType: 'dashboard', Resource: [`collection/${name}`] },
        ],
        AllowFromPublic: true,
      }]),
    });

    // Collection
    this.collection = new aoss.CfnCollection(this, 'Collection', {
      name,
      type: 'SEARCH',
    });
    this.collection.addDependency(encPolicy);

    this.collectionEndpoint = this.collection.attrCollectionEndpoint;
    this.collectionArn = this.collection.attrArn;

    // IAM role for OSIS pipeline
    this.pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('osis-pipelines.amazonaws.com'),
    });
    this.pipelineRole.addToPolicy(new iam.PolicyStatement({
      actions: ['aoss:APIAccessAll', 'aoss:BatchGetCollection', 'aoss:DashboardsAccessAll'],
      resources: ['*'],
    }));
    this.pipelineRole.addToPolicy(new iam.PolicyStatement({
      actions: ['aps:RemoteWrite'],
      resources: ['*'],
    }));

    // Data access policy — grants the pipeline role index/collection permissions
    new aoss.CfnAccessPolicy(this, 'DataAccessPolicy', {
      name: `${name}-access`,
      type: 'data',
      policy: JSON.stringify([{
        Rules: [
          {
            ResourceType: 'index',
            Resource: [`index/${name}/*`],
            Permission: [
              'aoss:CreateIndex', 'aoss:UpdateIndex', 'aoss:DescribeIndex',
              'aoss:ReadDocument', 'aoss:WriteDocument',
            ],
          },
          {
            ResourceType: 'collection',
            Resource: [`collection/${name}`],
            Permission: [
              'aoss:CreateCollectionItems', 'aoss:DeleteCollectionItems',
              'aoss:UpdateCollectionItems', 'aoss:DescribeCollectionItems',
            ],
          },
        ],
        Principal: [this.pipelineRole.roleArn, `arn:aws:iam::${stack.account}:root`],
      }]),
    });
  }
}
