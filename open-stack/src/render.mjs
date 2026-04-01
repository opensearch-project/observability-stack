/**
 * Renders the OSI pipeline YAML configuration from the resolved config.
 * Uses index_type for logs, traces, and service-map sinks.
 */

// ── Sink config helpers ──────────────────────────────────────────────────────

function logsSinkConfig() {
  return `\
        index_type: log-analytics-plain`;
}

function tracesSinkConfig() {
  return `\
        index_type: trace-analytics-plain-raw`;
}

function serviceMapSinkConfig() {
  return `\
        index_type: otel-v2-apm-service-map`;
}

// ── Pipeline renderer ────────────────────────────────────────────────────────

export function renderPipeline(cfg) {
  const name = cfg.pipelineName;

  return `\
version: '2'
extension:
  osis_configuration_metadata:
    builder_type: visual

# Main OTLP pipeline - receives all telemetry and routes by signal type
otlp-pipeline:
  source:
    otlp:
      logs_path: '/${name}/v1/logs'
      traces_path: '/${name}/v1/traces'
      metrics_path: '/${name}/v1/metrics'
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

# Log processing pipeline
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
${logsSinkConfig()}
        aws:
          region: '${cfg.region}'
          sts_role_arn: "${cfg.iamRoleArn}"

# Trace fan-out pipeline
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

# Raw trace storage pipeline
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
${tracesSinkConfig()}
        aws:
          region: '${cfg.region}'
          sts_role_arn: "${cfg.iamRoleArn}"

# Service map generation pipeline (APM)
service-map-pipeline:
  source:
    pipeline:
      name: otel-traces-pipeline
  processor:
    - otel_apm_service_map:
        db_path: /tmp/otel-apm-service-map
        group_by_attributes:
          - telemetry.sdk.language
        window_duration: ${cfg.serviceMapWindow}
  route:
    - otel_apm_service_map_route: 'getEventType() == "SERVICE_MAP"'
    - service_processed_metrics: 'getEventType() == "METRIC"'
  sink:
    - opensearch:
        hosts:
          - '${cfg.opensearchEndpoint}'
        aws:
          region: '${cfg.region}'
          sts_role_arn: "${cfg.iamRoleArn}"
        routes:
          - otel_apm_service_map_route
${serviceMapSinkConfig()}
    - prometheus:
        url: '${cfg.prometheusUrl}'
        aws:
          region: '${cfg.region}'
        routes:
          - service_processed_metrics

# Metrics processing pipeline
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
