---
title: Anomaly Detection
description: Detect anomalies in your observability data using machine learning
---

OpenSearch Anomaly Detection uses machine learning to automatically identify unusual patterns in your time-series data. It learns the normal behavior of your metrics and alerts you when something deviates from the expected pattern - without requiring manual threshold configuration.

## Key concepts

- **Detector**: A configuration that defines what data to monitor, which features (aggregations) to track, and how often to check. Each detector uses the Random Cut Forest (RCF) algorithm to model normal behavior.
- **Features**: The aggregations a detector monitors - for example, average CPU usage, request count, or error rate over a time window.
- **Real-time detection**: The detector runs continuously and flags anomalies as new data arrives. Results are available within the detection interval (typically 1-10 minutes).
- **Historical detection**: Run a detector against past data to identify anomalies retroactively. Useful for validating detector configuration or investigating past incidents.
- **Anomaly grade**: A score from 0 to 1 indicating how severe the anomaly is. Higher grades mean the data point is further from expected behavior.
- **Confidence**: How certain the model is in its prediction. Confidence increases as the detector processes more data.

## How it fits the Observability Stack

Anomaly detection works on any time-series data indexed in OpenSearch. Common observability use cases:

| Use case | Feature to monitor |
|---|---|
| Latency spikes | Average or P95 request duration from trace data |
| Error surges | Count of error-level log entries |
| Traffic anomalies | Request rate from service metrics |
| Resource exhaustion | CPU or memory usage from infrastructure metrics |

## Demo detectors

When the example agents or the OpenTelemetry Demo run against the local OpenSearch, an init container creates and starts a set of detectors over the demo's spans, the same way the demo alerting monitors are created. Each detector also gets an alerting monitor (named `... Anomaly`) that fires when the anomaly grade is above 0.7 and the confidence is above 0.5. The monitor uses the same query as the **Set up alerts** button in Anomaly Detection, so Alerting shows it as an anomaly detector monitor and links it to the detector.

| Detector | Demo | Watches (one model per entity) | What fires it |
|---|---|---|---|
| `agent-invocation-latency-errors` | Example agents | Average latency and error count of agent runs (`invoke_agent` spans), per agent | Control panel preset **Latency Spike** (weather agent), when the spike stands out from the default preset's background faults |
| `agent-tool-errors-latency` | Example agents | Average latency and error count of tool calls (`execute_tool` spans), per tool | **Latency Spike** (weather tool), same caveat |
| `agent-llm-token-usage` | Example agents | LLM tokens and call count (`chat` spans), per agent service | **Chaos** (more agent runs, more tokens) |
| `otel-demo-service-traffic-errors` | OpenTelemetry Demo | Request count and error count of server and consumer spans, per service | Feature flags `paymentFailure` (payment, checkout, frontend), `cartFailure` (cart), `kafkaQueueProblems` (accounting and fraud-detection message volume), `loadGeneratorFloodHomepage` (frontend traffic) |
| `otel-demo-service-latency` | OpenTelemetry Demo | Average latency of server and consumer spans, per service | Feature flags `kafkaQueueProblems` (fraud-detection), `cartFailure` (cart, checkout) |

To see them work:

1. Wait for the detectors to train. They run every minute, and a model needs about 35 minutes of data, so on a fresh stack the detectors show **Initializing** for roughly the first 40 minutes. The init container waits for that much data and then restarts any detector that hasn't trained yet.
2. Wait for confidence to build. Confidence starts near 0 right after training and passes 0.5 about 25 minutes later, so the monitors can fire about 65 minutes after a fresh bring-up.
3. Toggle a fault in the travel agent control panel (`http://localhost:8085`) or the OpenTelemetry Demo feature flag UI (`http://localhost:8080/feature`), and open the detector's **Anomaly overview**.

A detector flags the change, so a fault that stays on is marked when it starts, not for every minute it runs. The detectors only flag increases in latency, errors and tokens (a suppression rule ignores values below the expected one), so a fault isn't flagged again when it stops. Request count is flagged in both directions, because a traffic drop can mean an outage. The OpenTelemetry Demo latency detector also ignores increases of 10 ms or less, because several of its services answer in about a millisecond and tiny absolute changes look large to the model. Latency has its own OpenTelemetry Demo detector because it's the noisiest per-service signal, and sharing a model with it makes smaller error spikes harder to catch. The OpenTelemetry Demo gives the clearest results: its services are quiet until a flag is turned on. The example agents' default control panel preset already injects faults into half the requests, and the agents absorb most of them (few spans end in error status), so their detectors respond mainly to large changes such as **Chaos**.

The demo detectors are high-cardinality (one model per entity). OpenSearch allows 10 such detectors per cluster by default (`plugins.anomaly_detection.max_multi_entity_anomaly_detectors`), and the demos use 5 of them.

## Getting started

1. Open OpenSearch Dashboards and navigate to **Anomaly Detection** (under the main menu).
2. Click **Create detector**.
3. Select the index to monitor (e.g., `logs-otel-v1*` or a metrics index).
4. Define one or more **features** - aggregations over fields in your data.
5. Set the **detection interval** (how often the detector evaluates).
6. Optionally configure a **category field** to run detection per group (e.g., per service name).
7. Start the detector in real-time mode.
8. View results on the detector's dashboard - anomaly grade, confidence, and feature values over time.

## Pairing with alerting

Combine anomaly detection with [Alerting](/docs/alerting/) to get notified when anomalies are detected. Create a [log rule](/docs/alerting/unified-alerts/create-rules/#log-rule-ppl) that queries the anomaly results index and fires when the anomaly grade exceeds a threshold — for example:

```
source=.opendistro-anomaly-results* | where anomaly_grade > 0.7 | stats count() as anomalies
```
```
where anomalies > 0
```

Detectors also appear in the **Rules** catalog of the [Unified Alerts View](/docs/alerting/unified-alerts/), so their alerts surface alongside your log and metric rules.

## Learn more

For the full reference - including detector APIs, tuning parameters, and multi-category detection - see the [Anomaly Detection documentation](https://docs.opensearch.org/latest/observing-your-data/ad/index/) in the official OpenSearch docs.
