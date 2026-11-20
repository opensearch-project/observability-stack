import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/** A log group the stack owns, so deleting the stack removes it (Lambda's own would outlive the stack). */
export function functionLogGroup(scope: Construct, id: string): logs.LogGroup {
  return new logs.LogGroup(scope, `${id}Logs`, {
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });
}
