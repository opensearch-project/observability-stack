import * as cdk from 'aws-cdk-lib';
import * as aps from 'aws-cdk-lib/aws-aps';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { denyCreateLogGroup, functionLogGroup } from './function-log-group';

// https://docs.aws.amazon.com/opensearch-service/latest/developerguide/direct-query-prometheus-creating.html#direct-query-prometheus-manual-role-permissions
export const DQS_APS_ACTIONS = [
  'aps:QueryMetrics',
  'aps:GetLabels',
  'aps:GetSeries',
  'aps:GetMetricMetadata',
  'aps:ListAlerts',
  'aps:DescribeAlertManagerDefinition',
  'aps:GetAlertManagerStatus',
  'aps:ListAlertManagerAlerts',
  'aps:ListAlertManagerAlertGroups',
  'aps:ListAlertManagerReceivers',
  'aps:ListAlertManagerSilences',
  'aps:GetAlertManagerSilence',
  'aps:PutAlertManagerSilences',
  'aps:DeleteAlertManagerSilence',
  'aps:ListRuleGroupsNamespaces',
  'aps:DescribeRuleGroupsNamespace',
  'aps:CreateRuleGroupsNamespace',
  'aps:PutRuleGroupsNamespace',
  'aps:DeleteRuleGroupsNamespace',
];

export interface PrometheusConstructProps {
  domainArn: string;
  displayName: string;
  metricsRetentionDays: number;
}

export class PrometheusConstruct extends Construct {
  public readonly workspace: aps.CfnWorkspace;
  public readonly dqsRole: iam.Role;
  public readonly dataSourceArn: string;

  constructor(scope: Construct, id: string, props: PrometheusConstructProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);

    this.workspace = new aps.CfnWorkspace(this, 'Workspace', {
      alias: `obs-${props.displayName}-metrics`,
      workspaceConfiguration: { retentionPeriodInDays: props.metricsRetentionDays },
    });

    const dqsDataSourceName = `${props.displayName}_prometheus`;

    this.dqsRole = new iam.Role(this, 'DqsRole', {
      assumedBy: new iam.ServicePrincipal('directquery.opensearchservice.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': stack.account },
          ArnEquals: {
            'aws:SourceArn': `arn:${stack.partition}:opensearch:${stack.region}:${stack.account}:datasource/${dqsDataSourceName}`,
          },
        },
      }),
    });
    // Actions from the OpenSearch direct query Prometheus least-privilege sample policy.
    // AMP authorizes rule-groups-namespace CRUD against the rulegroupsnamespace ARN,
    // not the workspace ARN, so both resources are listed.
    this.dqsRole.addToPolicy(new iam.PolicyStatement({
      actions: DQS_APS_ACTIONS,
      resources: [
        this.workspace.attrArn,
        `arn:${stack.partition}:aps:${stack.region}:${stack.account}:rulegroupsnamespace/${this.workspace.attrWorkspaceId}/*`,
      ],
    }));
    this.dqsRole.addToPolicy(new iam.PolicyStatement({
      actions: ['aps:ListWorkspaces'],
      resources: ['*'],
    }));

    const dqsFn = new NodejsFunction(this, 'DqsFn', {
      logGroup: functionLogGroup(this, 'DqsFn'),
      runtime: Runtime.NODEJS_22_X,
      handler: 'cfnHandler',
      entry: path.join(__dirname, '..', 'custom-resources', 'dqs-datasource', 'index.ts'),
      timeout: cdk.Duration.minutes(5),
      bundling: { externalModules: ['@aws-sdk/*'], minify: true },
    });
    dqsFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'es:AddDirectQueryDataSource', 'es:DeleteDirectQueryDataSource', 'es:GetDirectQueryDataSource',
        'opensearch:AddDirectQueryDataSource', 'opensearch:DeleteDirectQueryDataSource', 'opensearch:GetDirectQueryDataSource',
      ],
      resources: ['*'],
    }));
    dqsFn.addToRolePolicy(denyCreateLogGroup());
    dqsFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [this.dqsRole.roleArn],
    }));

    const dataSource = new cdk.CustomResource(this, 'DqsDataSource', {
      serviceToken: dqsFn.functionArn,
      resourceType: 'Custom::PrometheusDataSource',
      properties: {
        DataSourceName: dqsDataSourceName,
        DataSourceType: {
          Prometheus: {
            RoleArn: this.dqsRole.roleArn,
            WorkspaceArn: this.workspace.attrArn,
          },
        },
        Description: 'Prometheus data source for observability stack',
      },
    });

    this.dataSourceArn = dataSource.getAttString('DataSourceArn');
  }
}
