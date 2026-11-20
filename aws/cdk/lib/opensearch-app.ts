import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { jsonArray } from './stack-parameters';

export interface OpenSearchAppConstructProps {
  /** Stack display name; the application is named obs-<displayName>-app. */
  displayName: string;
  domainArn: string;
  domainEndpoint: string;
  dqsDataSourceArn: string;
  uiInitRole: iam.IRole;
  /** IAM role ARNs made OpenSearch UI application admins, in addition to the UI init role. */
  adminRoleArns?: string[];
  /** Set when adminRoleArns is a list parameter: whether it has entries. */
  adminRoleArnsNotEmpty?: cdk.CfnCondition;
  /**
   * Resources UI init must wait for. The ingestion pipeline creates the indices from its templates
   * when it starts, and UI init stores each index pattern's fields from them.
   */
  uiInitDependsOn?: Construct[];
}

export class OpenSearchAppConstruct extends Construct {
  public readonly application: opensearch.CfnApplication;
  public readonly appId: string;
  public readonly appEndpoint: string;
  public readonly workspaceId: string;
  public readonly workspaceUrl: string;

  constructor(scope: Construct, id: string, props: OpenSearchAppConstructProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    // A failed create leaves the application behind outside the stack; the stack ID suffix keeps a retry from colliding with it.
    const createId = cdk.Fn.select(0, cdk.Fn.split('-', cdk.Fn.select(2, cdk.Fn.split('/', stack.stackId))));
    const appName = cdk.Fn.join('-', ['obs', props.displayName, 'app', createId]);

    this.application = new opensearch.CfnApplication(this, 'Application', {
      name: appName,
      appConfigs: [{
        key: 'opensearchDashboards.dashboardAdmin.groups',
        value: jsonArray([props.uiInitRole.roleArn], props.adminRoleArns, props.adminRoleArnsNotEmpty),
      }],
      dataSources: [
        { dataSourceArn: props.domainArn },
        { dataSourceArn: props.dqsDataSourceArn },
      ],
    });

    this.appId = this.application.attrId;
    // The service does not return the endpoint as an attribute; this is its fixed format.
    this.appEndpoint = `https://application-${appName}-${this.appId}.${stack.region}.opensearch.amazonaws.com`;

    // UI init Lambda
    const uiInitFn = new NodejsFunction(this, 'UiInitFn', {
      runtime: Runtime.NODEJS_22_X,
      handler: 'cfnHandler',
      entry: path.join(__dirname, '..', 'custom-resources', 'ui-init', 'index.ts'),
      timeout: cdk.Duration.minutes(10),
      memorySize: 256,
      role: props.uiInitRole,
      bundling: { externalModules: ['@aws-sdk/credential-provider-node'], minify: true },
    });

    const uiInit = new cdk.CustomResource(this, 'UiInit', {
      serviceToken: uiInitFn.functionArn,
      resourceType: 'Custom::WorkspaceSeeder',
      properties: {
        AppEndpoint: this.appEndpoint,
        Region: stack.region,
      },
    });
    uiInit.node.addDependency(this.application);
    for (const dep of props.uiInitDependsOn ?? []) uiInit.node.addDependency(dep);

    this.workspaceId = uiInit.getAttString('WorkspaceId');
    this.workspaceUrl = `${this.appEndpoint}/w/${this.workspaceId}/app/home`;

    new cdk.CfnOutput(stack, 'OpenSearchAppEndpoint', { value: this.appEndpoint });
    new cdk.CfnOutput(stack, 'DashboardUrl', {
      // app/home is not a workspace app and redirects to the workspace picker.
      value: `${this.appEndpoint}/w/${this.workspaceId}/app/dashboards#/view/observability-overview-dashboard`,
    });
  }
}
