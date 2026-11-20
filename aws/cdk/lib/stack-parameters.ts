import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** Defaults come from -c context, so `cdk deploy -c ...` and a template filled in by the console set the same values. */
export interface StackParameterDefaults {
  displayName: string;
  adminRoleArns: string[];
  enableDemo: boolean;
  osInstanceType: string;
  osInstanceCount: number;
  osVolumeSize: number;
  minOcu: number;
  maxOcu: number;
  aossMinOcu: number;
  aossMaxOcu: number;
  metricsRetentionDays: number;
}

/**
 * The template's parameters. Names and constraints match the console's observability stack templates:
 * the console prefills them by name, so they are a contract.
 */
export class StackParameters extends Construct {
  public readonly displayName: string;
  public readonly adminRoleArns: string[];
  /** True when AdminRoleArns has at least one entry. */
  public readonly hasAdminRoleArns: cdk.CfnCondition;
  public readonly deployDemo: cdk.CfnCondition;
  public readonly minOcu: number;
  public readonly maxOcu: number;
  public readonly metricsRetentionDays: number;
  public readonly amiId: string;
  public readonly osInstanceType?: string;
  public readonly osInstanceCount?: number;
  public readonly osVolumeSize?: number;
  public readonly aossMinOcu?: number;
  public readonly aossMaxOcu?: number;

  constructor(scope: Construct, id: string, serverless: boolean, d: StackParameterDefaults) {
    super(scope, id);
    const stack = cdk.Stack.of(this);
    const param = (name: string, props: cdk.CfnParameterProps) => {
      const p = new cdk.CfnParameter(stack, name, props);
      p.overrideLogicalId(name);
      return p;
    };

    this.displayName = param('StackDisplayName', {
      type: 'String',
      default: d.displayName,
      description: 'Observability stack name (3-17 chars, lowercase, hyphens). Resources are named obs-<name>-*.',
      allowedPattern: '[a-z][a-z0-9-]*[a-z0-9]',
      minLength: 3,
      maxLength: 17,
    }).valueAsString;
    this.adminRoleArns = param('AdminRoleArns', {
      type: 'CommaDelimitedList',
      default: d.adminRoleArns.join(','),
      description: 'IAM role ARNs that administer the OpenSearch UI application and get data access. The console fills in the role you are signed in with.',
    }).valueAsList;
    this.hasAdminRoleArns = new cdk.CfnCondition(stack, 'HasAdminRoleArns', {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals(cdk.Fn.join('', this.adminRoleArns), '')),
    });
    this.hasAdminRoleArns.overrideLogicalId('HasAdminRoleArns');
    const deployDemo = param('DeployDemoWorkload', {
      type: 'String',
      default: String(d.enableDemo),
      allowedValues: ['true', 'false'],
      description: "Run the OpenTelemetry demo on an EC2 instance (t3.xlarge, billed while running) so the stack has telemetry immediately. Update the stack with 'false' to remove it.",
    });
    this.deployDemo = new cdk.CfnCondition(stack, 'DeployDemo', { expression: cdk.Fn.conditionEquals(deployDemo.valueAsString, 'true') });
    this.deployDemo.overrideLogicalId('DeployDemo');

    if (!serverless) {
      this.osInstanceType = param('DomainInstanceType', {
        type: 'String',
        default: d.osInstanceType,
        allowedPattern: '[a-z0-9]+\\.[a-z0-9]+\\.search',
        constraintDescription: 'must be an OpenSearch Service instance type, such as r7g.large.search.',
        description: 'Data node instance type.',
      }).valueAsString;
      this.osInstanceCount = param('DomainInstanceCount', { type: 'Number', default: d.osInstanceCount, minValue: 1 }).valueAsNumber;
      this.osVolumeSize = param('DomainVolumeGB', { type: 'Number', default: d.osVolumeSize, minValue: 10 }).valueAsNumber;
    }
    this.minOcu = param('MinOCU', { type: 'Number', default: d.minOcu, description: 'Ingestion pipeline minimum OCU.' }).valueAsNumber;
    this.maxOcu = param('MaxOCU', { type: 'Number', default: d.maxOcu, description: 'Ingestion pipeline maximum OCU.' }).valueAsNumber;
    if (serverless) {
      this.aossMinOcu = param('CollectionMinOCU', { type: 'Number', default: d.aossMinOcu, minValue: 0, description: 'Collection group minimum indexing and search OCU.' }).valueAsNumber;
      this.aossMaxOcu = param('CollectionMaxOCU', { type: 'Number', default: d.aossMaxOcu, minValue: 1, description: 'Collection group maximum indexing and search OCU.' }).valueAsNumber;
    }
    this.metricsRetentionDays = param('MetricsRetentionDays', {
      type: 'Number', default: d.metricsRetentionDays, minValue: 1, description: 'Retention for metrics in the Prometheus workspace.',
    }).valueAsNumber;
    this.amiId = param('LatestAl2023Ami', {
      type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>',
      default: '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64',
      description: 'Image for the demo instance. Leave the default.',
    }).valueAsString;
  }
}

/**
 * A JSON array string of `items` followed by the entries of the list parameter `list`, built with intrinsics.
 * `listNotEmpty` leaves the list out when it's empty, which would otherwise add a "" entry.
 */
export function jsonArray(items: string[], list: string[] = [], listNotEmpty?: cdk.CfnCondition): string {
  const join = (xs: string[]) => cdk.Fn.join('', ['["', cdk.Fn.join('","', xs), '"]']);
  if (!list.length || !listNotEmpty) return join(items);
  return cdk.Fn.conditionIf(listNotEmpty.logicalId, join([...items, cdk.Fn.join('","', list)]), join(items)).toString();
}
