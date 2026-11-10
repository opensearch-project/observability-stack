---
title: Forecasting
description: Predict future values of time-series observability data
---

OpenSearch Forecasting extends the anomaly detection framework to predict future values of your time-series data. Use it to anticipate capacity needs, predict traffic patterns, and proactively address issues before they occur.

## Key concepts

- **Forecaster**: A configuration similar to an anomaly detector that defines what data to forecast, which features to predict, and the forecast horizon.
- **Forecast horizon**: How far into the future to predict. The forecaster generates predicted values for each interval up to the horizon.
- **Features**: The aggregations to forecast - the same feature types used in anomaly detection (averages, counts, sums, etc.).
- **Confidence intervals**: Each predicted value includes upper and lower bounds indicating the range of expected values.

## How it fits the Observability Stack

Forecasting is useful for capacity planning and proactive operations:

| Use case | What to forecast |
|---|---|
| Capacity planning | Disk usage, memory consumption, index size |
| Traffic prediction | Request rate, connection count |
| Cost estimation | Ingestion volume, storage growth |
| SLA management | Latency trends, error rate trajectory |

## Demo forecasters

With the example agents or the OpenTelemetry Demo running against the local OpenSearch, the same init container that creates the [demo detectors](/docs/anomaly-detection/#demo-detectors) also creates and starts these forecasters. Each predicts one value per minute, 30 minutes ahead:

| Forecaster | Demo | Forecasts |
|---|---|---|
| `agent-request-volume-forecast` | Example agents | Requests per minute for each agent (server spans) |
| `agent-llm-token-forecast` | Example agents | Total LLM tokens per minute across the agents |
| `otel-demo-frontend-traffic-forecast` | OpenTelemetry Demo | Frontend requests per minute |

Like the detectors, a forecaster needs about 35 minutes of data before its first forecast. To see actual values leave the forecast band, change the traffic: the **Chaos** and **Cascading Failure** presets in the travel agent control panel run the canary three times as often (and spend more tokens), and the `loadGeneratorFloodHomepage` feature flag floods the OpenTelemetry Demo frontend with roughly 18 times its normal traffic.

## Getting started

1. Open OpenSearch Dashboards and navigate to **Forecasting** (available alongside Anomaly Detection).
2. Create a **forecaster** by selecting an index and defining features to predict.
3. Set the **forecast horizon** - how many intervals ahead to predict.
4. Run the forecaster to generate predictions.
5. View predicted values alongside actual data to validate accuracy.

## Pairing with alerting

Combine forecasting with [Alerting](/docs/alerting/) to get notified when forecasts predict a threshold breach — for example, when forecasted disk usage is predicted to exceed 80% within the next 24 hours. Create a [log rule](/docs/alerting/unified-alerts/create-rules/#log-rule-ppl) against the forecast results index, or a [metric rule](/docs/alerting/unified-alerts/create-rules/#metric-rule-promql) on a forecasted metric series.

Forecasters also appear in the **Rules** catalog of the [Unified Alerts View](/docs/alerting/unified-alerts/), so their alerts surface alongside your log and metric rules.

## Learn more

For the full reference - including forecaster APIs, tuning parameters, and supported aggregation types - see the [Forecasting documentation](https://docs.opensearch.org/latest/observing-your-data/forecast/index/) in the official OpenSearch docs.
