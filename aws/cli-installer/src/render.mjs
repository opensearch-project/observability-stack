/**
 * Renders the OSI pipeline YAML configuration from the resolved config.
 * Dispatches to managed (index_type) or serverless (template_content) renderer.
 */

export function renderPipeline(cfg) {
  if (cfg.opensearchType === 'serverless') return renderServerlessPipeline(cfg);
  return renderManagedPipeline(cfg);
}

// ── Managed (AOS) sink config helpers ───────────────────────────────────────

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

// ── Managed pipeline renderer ───────────────────────────────────────────────

function renderManagedPipeline(cfg) {
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

// ── Serverless (AOSS) template content ──────────────────────────────────────

const LOGS_TEMPLATE_CONTENT = JSON.stringify({"version":1,"template":{"mappings":{"date_detection":false,"_source":{"enabled":true},"dynamic_templates":[{"long_resource_attributes":{"mapping":{"type":"long"},"path_match":"resource.attributes.*","match_mapping_type":"long"}},{"double_resource_attributes":{"mapping":{"type":"double"},"path_match":"resource.attributes.*","match_mapping_type":"double"}},{"string_resource_attributes":{"mapping":{"type":"keyword","ignore_above":256},"path_match":"resource.attributes.*","match_mapping_type":"string"}},{"long_scope_attributes":{"mapping":{"type":"long"},"path_match":"instrumentationScope.attributes.*","match_mapping_type":"long"}},{"double_scope_attributes":{"mapping":{"type":"double"},"path_match":"instrumentationScope.attributes.*","match_mapping_type":"double"}},{"string_scope_attributes":{"mapping":{"type":"keyword","ignore_above":256},"path_match":"instrumentationScope.attributes.*","match_mapping_type":"string"}},{"long_attributes":{"mapping":{"type":"long"},"path_match":"attributes.*","match_mapping_type":"long"}},{"double_attributes":{"mapping":{"type":"double"},"path_match":"attributes.*","match_mapping_type":"double"}},{"string_attributes":{"mapping":{"type":"keyword","ignore_above":256},"path_match":"attributes.*","match_mapping_type":"string"}}],"properties":{"droppedAttributesCount":{"type":"integer"},"instrumentationScope":{"properties":{"droppedAttributesCount":{"type":"integer"},"schemaUrl":{"type":"keyword","ignore_above":256},"name":{"type":"keyword","ignore_above":128},"version":{"type":"keyword","ignore_above":64}}},"resource":{"properties":{"droppedAttributesCount":{"type":"integer"},"schemaUrl":{"type":"keyword","ignore_above":256}}},"severity":{"properties":{"number":{"type":"integer"},"text":{"type":"keyword","ignore_above":32}}},"body":{"type":"text"},"@timestamp":{"type":"date_nanos"},"time":{"type":"date_nanos"},"observedTime":{"type":"date_nanos"},"traceId":{"type":"keyword","ignore_above":32},"spanId":{"type":"keyword","ignore_above":16},"flags":{"type":"long"}}}}});

const TRACES_TEMPLATE_CONTENT = JSON.stringify({"version":1,"template":{"mappings":{"date_detection":false,"_source":{"enabled":true},"dynamic_templates":[{"long_resource_attributes":{"mapping":{"type":"long"},"path_match":"resource.attributes.*","match_mapping_type":"long"}},{"double_resource_attributes":{"mapping":{"type":"double"},"path_match":"resource.attributes.*","match_mapping_type":"double"}},{"string_resource_attributes":{"mapping":{"type":"keyword","ignore_above":256},"path_match":"resource.attributes.*","match_mapping_type":"string"}},{"long_scope_attributes":{"mapping":{"type":"long"},"path_match":"instrumentationScope.attributes.*","match_mapping_type":"long"}},{"double_scope_attributes":{"mapping":{"type":"double"},"path_match":"instrumentationScope.attributes.*","match_mapping_type":"double"}},{"string_scope_attributes":{"mapping":{"type":"keyword","ignore_above":256},"path_match":"instrumentationScope.attributes.*","match_mapping_type":"string"}},{"long_attributes":{"mapping":{"type":"long"},"path_match":"attributes.*","match_mapping_type":"long"}},{"double_attributes":{"mapping":{"type":"double"},"path_match":"attributes.*","match_mapping_type":"double"}},{"string_attributes":{"mapping":{"type":"keyword","ignore_above":256},"path_match":"attributes.*","match_mapping_type":"string"}}],"properties":{"droppedAttributesCount":{"type":"integer"},"instrumentationScope":{"properties":{"droppedAttributesCount":{"type":"integer"},"schemaUrl":{"type":"keyword","ignore_above":256},"name":{"type":"keyword","ignore_above":128},"version":{"type":"keyword","ignore_above":64}}},"resource":{"properties":{"droppedAttributesCount":{"type":"integer"},"schemaUrl":{"type":"keyword","ignore_above":256}}},"traceId":{"type":"keyword","ignore_above":32},"spanId":{"type":"keyword","ignore_above":16},"parentSpanId":{"type":"keyword","ignore_above":16},"name":{"ignore_above":1024,"type":"keyword"},"traceState":{"ignore_above":1024,"type":"keyword"},"traceGroup":{"ignore_above":1024,"type":"keyword"},"traceGroupFields":{"properties":{"endTime":{"type":"date_nanos"},"durationInNanos":{"type":"long"},"statusCode":{"type":"integer"}}},"kind":{"type":"keyword","ignore_above":32},"serviceName":{"type":"keyword","ignore_above":256},"startTime":{"type":"date_nanos"},"endTime":{"type":"date_nanos"},"@timestamp":{"type":"date_nanos"},"time":{"type":"date_nanos"},"status":{"properties":{"code":{"type":"integer"},"message":{"type":"keyword","ignore_above":2048}}},"durationInNanos":{"type":"long"},"events":{"type":"nested","properties":{"name":{"type":"keyword","ignore_above":256},"attributes":{"type":"object"},"droppedAttributesCount":{"type":"integer"},"time":{"type":"date_nanos"}}},"droppedEventsCount":{"type":"integer"},"links":{"type":"nested","properties":{"traceId":{"type":"keyword","ignore_above":32},"spanId":{"type":"keyword","ignore_above":16},"traceState":{"ignore_above":1024,"type":"keyword"},"attributes":{"type":"object"},"droppedAttributesCount":{"type":"integer"}}},"droppedLinksCount":{"type":"integer"}}}}});

const SERVICE_MAP_TEMPLATE_CONTENT = JSON.stringify({"version":0,"template":{"mappings":{"date_detection":false,"dynamic_templates":[{"long_group_by_attributes":{"path_match":"*.groupByAttributes.*","match_mapping_type":"long","mapping":{"type":"long"}}},{"double_group_by_attributes":{"path_match":"*.groupByAttributes.*","match_mapping_type":"double","mapping":{"type":"double"}}},{"string_group_by_attributes":{"path_match":"*.groupByAttributes.*","match_mapping_type":"string","mapping":{"type":"keyword"}}},{"long_operation_attributes":{"path_match":"*.attributes.*","match_mapping_type":"long","mapping":{"type":"long"}}},{"double_operation_attributes":{"path_match":"*.attributes.*","match_mapping_type":"double","mapping":{"type":"double"}}},{"string_operation_attributes":{"path_match":"*.attributes.*","match_mapping_type":"string","mapping":{"type":"keyword"}}}],"_source":{"enabled":true},"properties":{"sourceNode":{"properties":{"type":{"type":"keyword"},"keyAttributes":{"properties":{"environment":{"type":"keyword"},"name":{"type":"keyword"}}},"groupByAttributes":{"type":"object","dynamic":"true"}}},"targetNode":{"properties":{"type":{"type":"keyword"},"keyAttributes":{"properties":{"environment":{"type":"keyword"},"name":{"type":"keyword"}}},"groupByAttributes":{"type":"object","dynamic":"true"}}},"sourceOperation":{"properties":{"name":{"type":"keyword"},"attributes":{"type":"object","dynamic":"true"}}},"targetOperation":{"properties":{"name":{"type":"keyword"},"attributes":{"type":"object","dynamic":"true"}}},"nodeConnectionHash":{"type":"keyword"},"operationConnectionHash":{"type":"keyword"},"timestamp":{"type":"date","format":"strict_date_optional_time||epoch_millis"}}}}});

// ── Serverless sink config helpers ──────────────────────────────────────────

function serverlessLogsSinkConfig() {
  return `\
        index: 'logs-otel-v1'
        template_type: 'index-template'
        template_content: '${LOGS_TEMPLATE_CONTENT}'`;
}

function serverlessTracesSinkConfig() {
  return `\
        index: 'otel-v1-apm-span'
        template_type: 'index-template'
        template_content: '${TRACES_TEMPLATE_CONTENT}'`;
}

function serverlessServiceMapSinkConfig() {
  return `\
        index: 'otel-v2-apm-service-map'
        template_type: 'index-template'
        template_content: '${SERVICE_MAP_TEMPLATE_CONTENT}'`;
}

// ── Serverless pipeline renderer ────────────────────────────────────────────

function renderServerlessPipeline(cfg) {
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
${serverlessLogsSinkConfig()}
        aws:
          serverless: true
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
${serverlessTracesSinkConfig()}
        aws:
          serverless: true
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
          serverless: true
          region: '${cfg.region}'
          sts_role_arn: "${cfg.iamRoleArn}"
        routes:
          - otel_apm_service_map_route
${serverlessServiceMapSinkConfig()}
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
