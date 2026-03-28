---
title: "ml"
description: "Apply machine learning algorithms in your query pipeline - anomaly detection and clustering without external tools."
---

import { Aside } from '@astrojs/starlight/components';

<Aside type="tip" title="Stable - since 2.5">
This command has a fixed API.
</Aside>

The `ml` command applies machine learning algorithms from the ML Commons plugin directly in your PPL query pipeline. It supports anomaly detection using Random Cut Forest (RCF) and clustering using k-means, running train-and-predict operations in a single step.

<Aside type="note">
The `ml` command requires `plugins.calcite.enabled` to be set to `false`.
</Aside>

## Syntax

**Anomaly detection (time-series):**

```sql
ml action='train' algorithm='rcf' time_field=<field> [<parameters>]
```

**Anomaly detection (batch/non-time-series):**

```sql
ml action='train' algorithm='rcf' [<parameters>]
```

**K-means clustering:**

```sql
ml action='train' algorithm='kmeans' [<parameters>]
```

## Arguments

### RCF time-series parameters

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `time_field=<field>` | Yes | -- | The timestamp field for time-series analysis. |
| `number_of_trees=<int>` | No | `30` | Number of trees in the forest. |
| `shingle_size=<int>` | No | `8` | Consecutive records in a shingle (sliding window). |
| `sample_size=<int>` | No | `256` | Sample size for stream samplers. |
| `output_after=<int>` | No | `32` | Minimum data points before results are produced. |
| `time_decay=<float>` | No | `0.0001` | Decay factor for stream samplers. |
| `anomaly_rate=<float>` | No | `0.005` | Expected anomaly rate (0.0 to 1.0). |
| `date_format=<string>` | No | `yyyy-MM-dd HH:mm:ss` | Format of the time field. |
| `time_zone=<string>` | No | `UTC` | Time zone of the time field. |
| `category_field=<field>` | No | -- | Group input by category; prediction runs independently per group. |

### RCF batch (non-time-series) parameters

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `number_of_trees=<int>` | No | `30` | Number of trees in the forest. |
| `sample_size=<int>` | No | `256` | Random samples per tree from training data. |
| `output_after=<int>` | No | `32` | Minimum data points before results are produced. |
| `training_data_size=<int>` | No | Full dataset | Size of the training dataset. |
| `anomaly_score_threshold=<float>` | No | `1.0` | Score threshold above which a point is anomalous. |
| `category_field=<field>` | No | -- | Group input by category; prediction runs independently per group. |

### K-means parameters

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `centroids=<int>` | No | `2` | Number of clusters. |
| `iterations=<int>` | No | `10` | Maximum iterations for convergence. |
| `distance_type=<type>` | No | `EUCLIDEAN` | Distance metric: `COSINE`, `L1`, or `EUCLIDEAN`. |

## Output fields

### RCF time-series output

The command appends these fields to each row:

| Field | Description |
|-------|-------------|
| `score` | Anomaly score (higher = more anomalous). |
| `anomaly_grade` | Anomaly grade (0.0 = normal, higher = more anomalous). |

### RCF batch output

| Field | Description |
|-------|-------------|
| `score` | Anomaly score. |
| `anomalous` | Boolean indicating whether the point is anomalous (`True`/`False`). |

### K-means output

| Field | Description |
|-------|-------------|
| `ClusterID` | The cluster assignment (integer starting from 0). |

## Usage notes

- For time-series RCF, ensure data is ordered by the time field before passing to `ml`. The algorithm expects sequential data.
- The `output_after` parameter controls the warm-up period. The first N data points will have a score of 0 while the model learns normal patterns.
- Batch RCF treats each data point independently, making it suitable for detecting outliers in non-sequential data.
- K-means works best when numeric fields are on similar scales. Consider normalizing with `eval` before clustering.
- Use `category_field` to run independent models per category (e.g., per service), avoiding cross-contamination between different baseline behaviors.

## Examples

### Detect anomalous latency in time-series data

Aggregate span duration into 1-minute buckets and detect anomalies:

```sql
source = otel-v1-apm-span-*
| stats avg(durationInNanos) as avg_latency by span(startTime, 1m) as minute
| ml action='train' algorithm='rcf' time_field='minute'
| where anomaly_grade > 0
| sort - anomaly_grade
```

### Time-series anomaly detection by service

Run independent anomaly detection per service:

```sql
source = otel-v1-apm-span-*
| stats avg(durationInNanos) as avg_latency by span(startTime, 1m) as minute, serviceName
| ml action='train' algorithm='rcf' time_field='minute' category_field='serviceName'
| where anomaly_grade > 0
```

### Batch outlier detection on request durations

Detect unusually slow spans without considering time ordering:

```sql
source = otel-v1-apm-span-*
| ml action='train' algorithm='rcf'
| where anomalous = 'True'
```

### Cluster services by error and latency behavior

Use k-means to group services into behavioral clusters based on error rate and average latency:

```sql
source = otel-v1-apm-span-*
| stats avg(durationInNanos) as avg_duration, count() as total, sum(case(status.code = 2, 1 else 0)) as errors by serviceName
| eval error_rate = errors * 100.0 / total
| ml action='train' algorithm='kmeans' centroids=3
```

### Tune anomaly detection sensitivity

Lower the `anomaly_rate` and increase `shingle_size` for stricter detection with more context:

```sql
source = otel-v1-apm-span-*
| stats avg(durationInNanos) as avg_latency by span(startTime, 1m) as minute
| ml action='train' algorithm='rcf' time_field='minute' anomaly_rate=0.001 shingle_size=16
| where anomaly_grade > 0
```

## Extended examples

### End-to-end latency anomaly investigation (OTel)

Detect anomalous latency spikes and then find the specific traces responsible:

```sql
source = otel-v1-apm-span-*
| stats avg(durationInNanos) as avg_latency, max(durationInNanos) as max_latency by span(startTime, 5m) as window, serviceName
| ml action='train' algorithm='rcf' time_field='window' category_field='serviceName'
| where anomaly_grade > 0
| sort - anomaly_grade
| head 10
```

After identifying the anomalous time windows, investigate individual traces:

```sql
source = otel-v1-apm-span-*
| where serviceName = 'checkout'
| sort - durationInNanos
| head 20
```

### Cluster OTel services by operational profile

Group services by their token usage, latency, and throughput characteristics to identify operational tiers:

```sql
source = otel-v1-apm-span-*
| stats avg(durationInNanos) as avg_duration, count() as throughput by serviceName
| eval avg_duration_ms = avg_duration / 1000000
| ml action='train' algorithm='kmeans' centroids=3 distance_type=EUCLIDEAN
```

## See also

- [stats](/docs/ppl/commands/stats/) -- aggregate data before feeding to ML algorithms
- [eventstats](/docs/ppl/commands/eventstats/) -- append aggregation results alongside original events
- [trendline](/docs/ppl/commands/trendline/) -- simple and weighted moving averages
- [eval](/docs/ppl/commands/eval/) -- normalize fields before clustering
