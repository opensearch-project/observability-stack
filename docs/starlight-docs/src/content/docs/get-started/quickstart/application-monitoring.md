---
title: Explore Application Monitoring
description: Follow traces from a distributed application into service maps, RED metrics, and related logs
---

This quickstart is for backend and platform engineers who want to understand a
distributed application from the outside in. You will start with trace data,
open the service map, inspect RED metrics, and follow a service back to its
traces and logs.

## Before you begin

You need:

- A running Observability Stack. The default example services generate trace data.
- Or the OpenTelemetry Demo enabled in `.env` with
  `INCLUDE_COMPOSE_OTEL_DEMO=docker-compose.otel-demo.yml`.
- An Observability workspace in OpenSearch Dashboards with APM configured.

For a clean local setup, follow the [installation guide](/docs/get-started/installation/).
The OpenTelemetry Demo is especially useful here because it produces telemetry
from multiple services and shows real dependency paths.

## 1. Open Application Monitoring

1. Open [OpenSearch Dashboards](http://localhost:5601).
2. Open **Observability** → **Application Monitoring**.
3. Select **Services**.

You should see a service catalog with request rate, failure rate, and latency
information. Select a service to open its detail view.

![Application Monitoring Services view showing service health, latency, throughput, and failure rate.](/docs/images/apm/services-home.png)

If the catalog is empty, see [Troubleshooting APM](/docs/apm/troubleshooting/).

## 2. Explore the service map

1. In **Application Monitoring**, select **Application Map**.
2. Set the time range to include the request you generated.
3. Select a service node to view its request, latency, error, and fault metrics.
4. Select **View details** to open the service detail view.

The map is built from propagated trace context. A missing edge usually means a
downstream service did not receive or forward the W3C `traceparent` header.

![Application Map showing service dependencies and request flow.](/docs/images/apm/application-map.png)

## 3. Read the RED metrics

For each service, look for:

- **Rate**: request volume over the selected time range
- **Errors**: client-side failures, usually HTTP 4xx responses
- **Duration**: request latency, including percentile charts such as P50, P90, and P99
- **Faults**: server-side failures, usually HTTP 5xx responses

Use the service detail view to compare operations and downstream dependencies.
This helps distinguish a slow service from a slow dependency.

## 4. Jump from a service to traces and logs

1. From a service or operation, open the correlation actions.
2. Choose **View traces** to inspect individual spans.
3. Choose **View logs** to inspect log events for the same service and time range.

Log links require a trace dataset and log dataset with a configured correlation.
See [Correlations](/docs/investigate/correlations/) if the log action is not
available.

## 5. Create a useful failure signal

If you enabled the OpenTelemetry Demo, use its feature flag page to turn on a
failure scenario. Return to **Application Monitoring** and watch the affected
service's fault rate and dependency path change.

This is a quick way to confirm that the stack is receiving new telemetry and
that the service map and RED metrics are being updated.

## What to do next

- [Application Monitoring](/docs/apm/) - understand the APM components and configuration
- [Application Map](/docs/apm/service-map/) - learn the map filters and grouping options
- [Services](/docs/apm/services/) - inspect service and operation details
- [Troubleshooting APM](/docs/apm/troubleshooting/) - diagnose missing traces, services, or metrics
