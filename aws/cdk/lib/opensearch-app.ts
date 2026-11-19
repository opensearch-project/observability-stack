import * as cdk from 'aws-cdk-lib';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface OpenSearchAppConstructProps {
  domainArn: string;
  domainEndpoint: string;
  dqsDataSourceArn: string;
  uiInitRole: iam.IRole;
  /** IAM role ARNs made OpenSearch UI application admins, in addition to the UI init role. */
  adminRoleArns?: string[];
  /**
   * Resources UI init must wait for. The ingestion pipeline creates the indices from its templates
   * when it starts, and UI init stores each index pattern's fields from them.
   */
  uiInitDependsOn?: Construct[];
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
      actions: ['es:*', 'aoss:BatchGetCollection'],
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
        AdminRoleArns: JSON.stringify([props.uiInitRole.roleArn, ...(props.adminRoleArns ?? [])]),
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
      role: props.uiInitRole,
      bundling: { externalModules: ['@aws-sdk/credential-provider-node'] },
    });
    const uiInitProvider = new cr.Provider(this, 'UiInitProvider', { onEventHandler: uiInitFn });

    const uiInit = new cdk.CustomResource(this, 'UiInit', {
      serviceToken: uiInitProvider.serviceToken,
      properties: {
        AppEndpoint: this.appEndpoint,
        Region: stack.region,
      },
    });
    uiInit.node.addDependency(app);
    for (const dep of props.uiInitDependsOn ?? []) uiInit.node.addDependency(dep);

    // Field re-sync. UI init stores each index pattern's fields once, from the pipeline's templates,
    // before telemetry has created the dynamic ones (gen_ai.*, span and resource attributes). Without
    // this the stored lists stay short and dashboards fail with "Could not locate that
    // index-pattern-field" until someone refreshes them by hand. It appends missing fields, never
    // removes or rewrites existing ones, and writes nothing when the lists are already complete.
    // It reuses the UI init role, which is already an application admin.
    const fieldResyncFn = new NodejsFunction(this, 'FieldResyncFn', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '..', 'custom-resources', 'field-resync', 'index.ts'),
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      role: props.uiInitRole,
      // One run at a time, so overlapping invocations cannot write the same pattern twice.
      reservedConcurrentExecutions: 1,
      environment: {
        APP_ENDPOINT: this.appEndpoint,
        REGION: stack.region,
        WORKSPACE_ID: uiInit.getAttString('WorkspaceId'),
      },
      bundling: { externalModules: ['@aws-sdk/credential-provider-node'] },
    });
    new events.Rule(this, 'FieldResyncSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.LambdaFunction(fieldResyncFn)],
    });

    new cdk.CfnOutput(stack, 'OpenSearchAppEndpoint', { value: this.appEndpoint });
    new cdk.CfnOutput(stack, 'DashboardUrl', {
      // app/home is not a workspace app and redirects to the workspace picker.
      value: `${this.appEndpoint}/w/${uiInit.getAttString('WorkspaceId')}/app/dashboards#/view/observability-overview-dashboard`,
    });
  }
}
