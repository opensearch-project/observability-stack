---
title: Application Monitoring
description: Monitor application performance with service maps, RED metrics, and service-level views
sidebar:
  label: APM
  order: 1
---

Application Monitoring gives you a real-time view of how your services are performing. It combines topology data stored in OpenSearch with time-series RED metrics (Rate, Errors, Duration) stored in Prometheus to surface health, latency, throughput, and error information across your distributed system.

## Navigation

In OpenSearch Dashboards, navigate to **Observability** > **Application Monitoring**. The sidebar shows:

- **Services** - catalog of all instrumented services with filtering, detail views, and correlation links
- **Application Map** - interactive topology graph of service dependencies

## Key capabilities

### Application Map

A live topology view of your distributed system. Filter by fault rate, error rate, or environment. Group services by any attribute configured in Data Prepper (such as `telemetry.sdk.language`). Click any service node to see health breakdowns and metric charts in a side panel. See [Application Map](/docs/apm/service-map/) for details.

### Services catalog

A filterable table of all instrumented services showing latency (P99), throughput, failure ratio, and environment. Panels above the table highlight the top services and dependency paths by fault rate. See [Services](/docs/apm/services/) for details.

### Service detail

Drill into any service to see three tabs:

- **Overview** - KPI cards (throughput, fault rate, error rate, availability, latency P99) with sparklines and trend arrows, latency by dependencies, requests by operations, and availability by operations charts.
- **Operations** - table of all operations with expandable rows showing per-operation request, fault, error, and latency charts.
- **Dependencies** - table of downstream dependencies with expandable rows showing per-dependency charts.

### Correlations

From any service or operation, open correlation flyouts to jump directly to related spans and logs. Correlation icons appear throughout the Services and Operations tables, linking APM data to the traces and logs in the Investigate section.

## How it works

![Architecture diagram showing microservices and infrastructure sending OTLP to the OTel Collector, which exports to Data Prepper. Data Prepper writes to OpenSearch and Prometheus, both queried by OpenSearch Dashboards.](/docs/images/apm/architecture.png)

1. Your applications and infrastructure emit telemetry via OpenTelemetry SDKs, auto-instrumentation, or the OTel API to the OTel Collector.
2. The Collector forwards trace data to Data Prepper over OTLP.
3. Data Prepper's `otel_apm_service_map` processor extracts service-to-service relationships and computes RED metrics.
4. Topology and raw trace data are indexed into OpenSearch. RED metrics are exported to Prometheus via remote write.
5. OpenSearch Dashboards queries both stores to render the Application Map, Services catalog, and service detail views.

## Configuring APM

To set up APM, complete the following steps:

1. **Create an Observability workspace** - APM features are only available within Observability workspaces. To learn how to enable and create workspaces, see [Workspace for OpenSearch Dashboards](https://opensearch.org/docs/latest/dashboards/workspace/workspace/).

2. **Instrument your application** - integrate [OpenTelemetry SDKs](https://opentelemetry.io/docs/instrumentation/) into your application code to generate trace and log data. See the [Send Data](/docs/send-data/opentelemetry/) section for instrumentation guides.

3. **Configure telemetry ingestion** - set up the OpenTelemetry Collector and Data Prepper to process and route telemetry to OpenSearch and Prometheus. See [Configuring Telemetry Ingestion](/docs/apm/configuring-telemetry-ingestion/).

4. **Configure APM in OpenSearch Dashboards** - create datasets, index patterns, and connect data sources in your Observability workspace. See [Setting Up APM](/docs/apm/configuring-apm/).

> **Note:** APM is distinct from the older [Trace analytics](https://opensearch.org/docs/latest/observing-your-data/trace/index/) and [Application analytics](https://opensearch.org/docs/latest/observing-your-data/app-analytics/) features. APM provides a more integrated experience that combines service topology, RED metrics, and in-context correlations into a single workflow.

## Prerequisites

- Data Prepper running with the trace analytics pipelines enabled (see [Configuring Telemetry Ingestion](/docs/apm/configuring-telemetry-ingestion/) for the full pipeline configuration)
- Trace data flowing via OTLP to the OTel Collector
- Prometheus configured to receive remote write from Data Prepper
- OpenSearch Dashboards with the Observability plugin and feature flags enabled (see [Configuring APM](#configuring-apm) above)
