import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface OpenSearchAppConstructProps {
  domainArn: string;
  domainEndpoint: string;
  dqsDataSourceArn: string;
}

export class OpenSearchAppConstruct extends Construct {
  public readonly appId: string;
  public readonly appEndpoint: string;

  constructor(scope: Construct, id: string, props: OpenSearchAppConstructProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const appName = `obs-${stack.stackName}-${cdk.Names.uniqueId(this).slice(-8)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30);

    const appFn = new NodejsFunction(this, 'AppFn', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '..', 'custom-resources', 'opensearch-app', 'index.ts'),
      timeout: cdk.Duration.minutes(10),
      bundling: { externalModules: ['@aws-sdk/*'] },
    });
    appFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['es:*'],
      resources: ['*'],
    }));
    appFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:CreateServiceLinkedRole'],
      resources: ['*'],
    }));

    const appProvider = new cr.Provider(this, 'AppProvider', { onEventHandler: appFn });

    const app = new cdk.CustomResource(this, 'Application', {
      serviceToken: appProvider.serviceToken,
      properties: {
        AppName: appName,
        DomainDataSource: props.domainArn,
        DqsDataSource: props.dqsDataSourceArn,
      },
    });

    this.appId = app.getAttString('AppId');
    this.appEndpoint = app.getAttString('AppEndpoint');

    // UI init Lambda
    const uiInitFn = new NodejsFunction(this, 'UiInitFn', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '..', 'custom-resources', 'ui-init', 'index.ts'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 256,
      bundling: { externalModules: ['@aws-sdk/credential-provider-node'] },
    });
    uiInitFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['es:*', 'opensearch:*', 'aoss:*'],
      resources: ['*'],
    }));

    const uiInitProvider = new cr.Provider(this, 'UiInitProvider', { onEventHandler: uiInitFn });

    const uiInit = new cdk.CustomResource(this, 'UiInit', {
      serviceToken: uiInitProvider.serviceToken,
      properties: {
        AppEndpoint: this.appEndpoint,
        Region: stack.region,
      },
    });
    uiInit.node.addDependency(app);

    new cdk.CfnOutput(stack, 'OpenSearchAppEndpoint', { value: this.appEndpoint });
    new cdk.CfnOutput(stack, 'DashboardUrl', {
      value: `${this.appEndpoint}/w/${uiInit.getAttString('WorkspaceId')}/app/home`,
    });
  }
}
