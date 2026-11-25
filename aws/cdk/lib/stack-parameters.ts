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
  logRetentionDays: number;
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
  /** Unset with minimal parameters, where the demo always runs. */
  public readonly deployDemo?: cdk.CfnCondition;
  public readonly minOcu: number;
  public readonly maxOcu: number;
  public readonly metricsRetentionDays: number;
  public readonly amiId: string;
  public readonly osInstanceType?: string;
  public readonly osInstanceCount?: number;
  public readonly osVolumeSize?: number;
  public readonly aossMinOcu?: number;
  public readonly aossMaxOcu?: number;
  /** Days serverless log, trace and service map indices keep data (serverless only). */
  public readonly logRetentionDays?: number;

  /**
   * `minimal` keeps only StackDisplayName and AdminRoleArns, as the console's serverless-easy template does: the other
   * choices take their defaults as constants, and the demo always runs.
   */
  constructor(scope: Construct, id: string, serverless: boolean, d: StackParameterDefaults, minimal = false, optimized = false) {
    super(scope, id);
    const stack = cdk.Stack.of(this);
    const param = (name: string, props: cdk.CfnParameterProps) => {
      const p = new cdk.CfnParameter(stack, name, props);
      p.overrideLogicalId(name);
      return p;
    };
    const num = (name: string, props: cdk.CfnParameterProps) =>
      minimal ? Number(props.default) : param(name, props).valueAsNumber;
    const str = (name: string, props: cdk.CfnParameterProps) =>
      minimal ? String(props.default) : param(name, props).valueAsString;

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
    if (!minimal) {
      const deployDemo = param('DeployDemoWorkload', {
        type: 'String',
        default: String(d.enableDemo),
        allowedValues: ['true', 'false'],
        description: "Run the OpenTelemetry demo on an EC2 instance (t3.xlarge, billed while running) so the stack has telemetry immediately. Update the stack with 'false' to remove it.",
      });
      this.deployDemo = new cdk.CfnCondition(stack, 'DeployDemo', { expression: cdk.Fn.conditionEquals(deployDemo.valueAsString, 'true') });
      this.deployDemo.overrideLogicalId('DeployDemo');
    }

    if (!serverless) {
      this.osInstanceType = str('DomainInstanceType', optimized ? {
        type: 'String',
        default: d.osInstanceType,
        allowedPattern: '(or1|or2|om2|oi2)\\.[a-z0-9]+\\.search',
        constraintDescription: 'must be an OpenSearch Optimized instance type (or1.*, or2.*, om2.*, oi2.*).',
        description: 'Data node instance type. Optimized-engine domains need an OpenSearch Optimized family.',
      } : {
        type: 'String',
        default: d.osInstanceType,
        allowedPattern: '[a-z0-9]+\\.[a-z0-9]+\\.search',
        constraintDescription: 'must be an OpenSearch Service instance type, such as r7g.large.search.',
        description: 'Data node instance type.',
      });
      this.osInstanceCount = num('DomainInstanceCount', { type: 'Number', default: d.osInstanceCount, minValue: 1 });
      this.osVolumeSize = num('DomainVolumeGB', { type: 'Number', default: d.osVolumeSize, minValue: 10 });
    }
    this.minOcu = num('MinOCU', { type: 'Number', default: d.minOcu, description: 'Ingestion pipeline minimum OCU.' });
    this.maxOcu = num('MaxOCU', { type: 'Number', default: d.maxOcu, description: 'Ingestion pipeline maximum OCU.' });
    if (serverless) {
      this.aossMinOcu = num('CollectionMinOCU', { type: 'Number', default: d.aossMinOcu, minValue: 0, description: 'Collection group minimum indexing and search OCU.' });
      this.aossMaxOcu = num('CollectionMaxOCU', { type: 'Number', default: d.aossMaxOcu, minValue: 1, description: 'Collection group maximum indexing and search OCU.' });
    }
    this.metricsRetentionDays = num('MetricsRetentionDays', {
      type: 'Number', default: d.metricsRetentionDays, minValue: 1, description: 'Retention for metrics in the Prometheus workspace.',
    });
    if (serverless) {
      this.logRetentionDays = num('LogRetentionDays', {
        type: 'Number', default: d.logRetentionDays, minValue: 1, maxValue: 3650,
        description: 'Days to keep log, trace and service-map data (index.data.retention on each index).',
      });
    }
    const ami = '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64';
    this.amiId = minimal ? `{{resolve:ssm:${ami}}}` : param('LatestAl2023Ami', {
      type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>',
      default: ami,
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
