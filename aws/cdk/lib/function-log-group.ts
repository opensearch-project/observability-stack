import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/** A log group the stack owns, so deleting the stack removes it (Lambda's own would outlive the stack). */
export function functionLogGroup(scope: Construct, id: string): logs.LogGroup {
  return new logs.LogGroup(scope, `${id}Logs`, {
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });
}

/**
 * Lambda creates a missing log group when it writes, so the last invocation of a stack delete would recreate the
 * group after CloudFormation removed it. The stack creates every function's group, so its roles never need to.
 */
export function denyCreateLogGroup(): iam.PolicyStatement {
  return new iam.PolicyStatement({ effect: iam.Effect.DENY, actions: ['logs:CreateLogGroup'], resources: ['*'] });
}
