---
title: Datasets
description: Create and manage datasets for organizing observability data in OpenSearch Dashboards
sidebar:
  order: 10
---

A _dataset_ represents a collection of indexes that you want to analyze together. Datasets provide a user-friendly way to organize and access your observability data in OpenSearch Dashboards. Datasets allow you to assign types, names, and descriptions to your data sources and indexes, making it easier to work with logs and traces.

Datasets offer several advantages over traditional index patterns:

- **User-friendly names**: Assign descriptive names instead of relying on index pattern syntax.
- **Descriptions**: Add context about what data the dataset contains.
- **Schema mappings**: Map fields from non-standard formats to OpenTelemetry-compatible fields for correlation.
- **Type-specific behavior**: Logs and traces datasets integrate with their respective Discover pages.

## Dataset types

OpenSearch supports the following dataset types.

| Type | Description | Use case |
|:-----|:------------|:---------|
| **Logs** | Generic log data for analytics and exploration | Application logs, system logs, access logs |
| **Traces** | OpenTelemetry span data ingested through OpenSearch Data Prepper | Distributed tracing, performance monitoring |

## Creating a logs dataset

To create a logs dataset, follow these steps:

1. In the workspace left navigation, select **Datasets**.

2. Select **Create dataset** and choose **Logs** from the dropdown menu.

3. In **Step 1: Select data**, select your data source. You can use wildcard patterns (for example, `logs-*`) to match multiple indexes.

   ![Selecting a data source](/docs/images/datasets/datasets-select-data-source.png)

4. In **Step 2: Configure data**, configure the dataset settings.

   ![Configuring logs dataset settings](/docs/images/datasets/datasets-configure-logs.png)

   You can configure the following settings:

   - **Name** -- Enter a descriptive name for the dataset.
   - **Description** (Optional) -- Add the data description.
   - **Time field**: Choose the timestamp field for time-based queries.
   - **Schema mappings** (Optional) -- Map your log fields to standard OpenTelemetry fields for correlation with traces:
     - **Trace ID field**: The field containing trace identifiers.
     - **Span ID field**: The field containing span identifiers.
     - **Service name field**: The field containing service names.
     - **Timestamp field**: The field containing event timestamps.

5. Select **Create dataset** to save your configuration.

## Creating a traces dataset

To create a traces dataset, follow these steps:

1. In the workspace left navigation, select **Datasets**.

2. Select **Create dataset** and choose **Traces** from the dropdown menu.

3. In **Step 1: Select data**, select your trace data source. The data source must reference indexes containing OpenTelemetry span data ingested using Data Prepper.

4. In **Step 2: Configure data**, configure the dataset settings.

   ![Configuring traces dataset settings](/docs/images/datasets/datasets-configure-traces.png)

   You can configure the following settings:

   - **Name** -- Enter a descriptive name for the dataset.
   - **Description** (Optional) -- Add the data description.
   - **Time field** -- Choose the timestamp field (typically, `startTime` or `@timestamp`).

5. Select **Create dataset** to save your configuration.

## Viewing datasets

After creating datasets, you can view and manage them from the **Datasets** page using the following steps:

1. In the workspace left navigation, select **Datasets**.

2. The list view displays all datasets with their names, types, and data sources.

   ![Datasets list view](/docs/images/datasets/datasets-list.png)

3. Select a dataset to view its details, including configuration settings and any correlations.

## Analyzing datasets in Discover pages

Datasets integrate with the Discover interface for exploring your data.

### Logs datasets

To analyze logs datasets, follow these steps:

1. Navigate to **Discover** > **Logs**.
2. From the dataset selector, select your logs dataset.
3. Use Piped Processing Language (PPL) queries to explore and analyze your log data.

### Traces datasets

To analyze traces datasets, follow these steps:

1. Navigate to **Discover** > **Traces**.
2. Select your traces dataset from the dataset selector.
3. Explore span data and trace flows.
