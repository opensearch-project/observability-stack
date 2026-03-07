---
title: Correlations
description: Link trace datasets with logs datasets to accelerate root cause analysis
sidebar:
  order: 60
---

Correlations allow you to link trace datasets with logs datasets, enabling you to view related log entries when analyzing distributed traces. Correlating datasets helps you quickly identify the root cause of issues by connecting trace spans to their corresponding application logs.

When troubleshooting distributed systems, you often need to correlate data across multiple sources. A trace might show that a request failed, but the detailed error information is in your application logs. Using correlations, you can:

- Link a single trace dataset to up to five logs datasets.
- View related logs directly from the span details panel.
- Navigate seamlessly between trace analysis and log exploration.

## Correlation requirements

For correlations to work correctly, your logs data must include the following fields that can be mapped to trace context.

| Field | Purpose |
|:------|:--------|
| **Trace ID** | Links log entries to specific traces |
| **Span ID** | Links log entries to specific spans |
| **Service name** | Filters logs by service |
| **Timestamp** | Orders log entries chronologically |

If your logs do not follow OpenTelemetry conventions, configure schema mappings in your logs dataset to map your custom field names to these standard fields.

## Creating a trace-to-logs correlation

To create a correlation between a trace dataset and logs datasets, follow these steps:

1. Navigate to **Datasets** in the left navigation.

2. Select the trace dataset you want to correlate with logs.

3. In the dataset details page, select the **Correlated datasets** tab.

   ![Trace dataset Correlated datasets tab](/docs/images/datasets/correlations-trace-dataset-tab.png)

4. Select **Configure correlation**.

5. In the **Configure correlation** dialog, select up to five logs datasets to correlate with this trace dataset.

   ![Configure correlation dialog](/docs/images/datasets/correlations-configure-dialog.png)

6. Select **Save** to create the correlation.

7. The correlated logs datasets now appear in the **Correlated datasets** table.

   ![Created correlation in table](/docs/images/datasets/correlations-created-table.png)

## Viewing correlations in logs datasets

You can view the trace datasets that are correlated with a logs dataset from the logs dataset details:

1. Navigate to **Datasets** in the left navigation.

2. Select a logs dataset that has been correlated with a trace dataset.

3. Select the **Correlated traces** tab to view trace datasets linked with this logs dataset.

   ![Logs dataset Correlated traces tab](/docs/images/datasets/correlations-logs-dataset-tab.png)

:::note
This view is read-only. To modify correlations, you must edit them from the trace dataset.
:::

## Using correlations in the Traces page

After creating correlations, you can access related logs when analyzing traces.

### Viewing related logs in span details

1. Navigate to **Discover** > **Traces**.

2. Select a trace to view its details.

3. Select a span within the trace to open the **Span details**.

4. In **Span details**, select the **Logs** tab to open **Related logs**. The related logs are retrieved by matching the trace ID from the span to log entries in your correlated logs datasets.

   ![Span details with related logs](/docs/images/datasets/correlations-span-details-logs.png)

5. Select a log entry to view its full details or navigate to the **Logs** page for further exploration.

## Managing correlations

You can edit or remove correlations from the trace dataset details page.

### Editing correlations

To modify an existing correlation, follow these steps:

1. Navigate to **Datasets** in the left navigation and select the trace dataset you want to modify.
2. Select the **Correlated datasets** tab.
3. Select **Configure correlation** to modify the list of correlated logs datasets.
4. Add or remove datasets as needed.
5. Select **Save** to apply changes.

### Removing correlations

To remove a correlation:

1. Navigate to **Datasets** in the left navigation and select the trace dataset you want to modify.
2. Select the **Correlated datasets** tab.
3. Delete the configured correlations using the delete icon.
