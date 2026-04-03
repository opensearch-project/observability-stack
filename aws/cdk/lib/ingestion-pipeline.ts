import * as cdk from 'aws-cdk-lib';
import * as osis from 'aws-cdk-lib/aws-osis';
import { Construct } from 'constructs';

export interface IngestionPipelineProps {
  domainEndpoint: string;
  prometheusWorkspaceArn: string;
  prometheusWorkspaceId: string;
  pipelineRoleArn: string;
  region: string;
  minOcu: number;
  maxOcu: number;
}

export class IngestionPipeline extends Construct {
  public readonly pipeline: osis.CfnPipeline;
  public readonly pipelineName: string;

  constructor(scope: Construct, id: string, props: IngestionPipelineProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    this.pipelineName = `obs-stack-${stack.stackName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 28);

    const opensearchEndpoint = `https://${props.domainEndpoint}`;
    const prometheusUrl = `https://aps-workspaces.${props.region}.amazonaws.com/workspaces/${props.prometheusWorkspaceId}/api/v1/remote_write`;

    this.pipeline = new osis.CfnPipeline(this, 'Pipeline', {
      pipelineName: this.pipelineName,
      minUnits: props.minOcu,
      maxUnits: props.maxOcu,
      pipelineConfigurationBody: renderPipelineYaml({
        pipelineName: this.pipelineName,
        opensearchEndpoint,
        prometheusUrl,
        region: props.region,
        roleArn: props.pipelineRoleArn,
      }),
    });
  }
}

function renderPipelineYaml(cfg: {
  pipelineName: string;
  opensearchEndpoint: string;
  prometheusUrl: string;
  region: string;
  roleArn: string;
}): string {
  return `\
version: '2'
otlp-pipeline:
  source:
    otlp:
      logs_path: '/${cfg.pipelineName}/v1/logs'
      traces_path: '/${cfg.pipelineName}/v1/traces'
      metrics_path: '/${cfg.pipelineName}/v1/metrics'
  route:
    - logs: 'getEventType() == "LOG"'
    - traces: 'getEventType() == "TRACE"'
    - metrics: 'getEventType() == "METRIC"'
  processor: []
  sink:
    - pipeline:
        name: otel-logs-pipeline
        routes:
          - logs
    - pipeline:
        name: otel-traces-pipeline
        routes:
          - traces
    - pipeline:
        name: otel-metrics-pipeline
        routes:
          - metrics

otel-logs-pipeline:
  source:
    pipeline:
      name: otlp-pipeline
  processor:
    - copy_values:
        entries:
          - from_key: "time"
            to_key: "@timestamp"
  sink:
    - opensearch:
        hosts:
          - '${cfg.opensearchEndpoint}'
        index_type: log-analytics-plain
        aws:
          region: '${cfg.region}'
          sts_role_arn: "${cfg.roleArn}"

otel-traces-pipeline:
  source:
    pipeline:
      name: otlp-pipeline
  processor: []
  sink:
    - pipeline:
        name: traces-raw-pipeline
        routes: []
    - pipeline:
        name: service-map-pipeline
        routes: []

traces-raw-pipeline:
  source:
    pipeline:
      name: otel-traces-pipeline
  processor:
    - otel_traces:
  sink:
    - opensearch:
        hosts:
          - '${cfg.opensearchEndpoint}'
        index_type: trace-analytics-plain-raw
        aws:
          region: '${cfg.region}'
          sts_role_arn: "${cfg.roleArn}"

service-map-pipeline:
  source:
    pipeline:
      name: otel-traces-pipeline
  processor:
    - otel_apm_service_map:
        db_path: /tmp/otel-apm-service-map
        group_by_attributes:
          - telemetry.sdk.language
        window_duration: 30s
  route:
    - otel_apm_service_map_route: 'getEventType() == "SERVICE_MAP"'
    - service_processed_metrics: 'getEventType() == "METRIC"'
  sink:
    - opensearch:
        hosts:
          - '${cfg.opensearchEndpoint}'
        aws:
          region: '${cfg.region}'
          sts_role_arn: "${cfg.roleArn}"
        routes:
          - otel_apm_service_map_route
        index_type: otel-v2-apm-service-map
    - prometheus:
        url: '${cfg.prometheusUrl}'
        aws:
          region: '${cfg.region}'
        routes:
          - service_processed_metrics

otel-metrics-pipeline:
  source:
    pipeline:
      name: otlp-pipeline
  processor:
    - otel_metrics:
  sink:
    - prometheus:
        url: '${cfg.prometheusUrl}'
        aws:
          region: '${cfg.region}'
`;
}
