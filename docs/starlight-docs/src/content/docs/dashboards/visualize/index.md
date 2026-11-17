---
title: "Creating visualizations using queries"
sidebar:
  order: 50
---
The _visualization editor_ lets you create visualizations by writing [Piped Processing Language (PPL)](/docs/ppl/) or Prometheus Query Language (PromQL) queries. The editor automatically maps query result fields to chart axes and suggests a chart type based on the shape of your data.

The OpenSearch Observability Stack includes the required OpenSearch Dashboards capabilities and data source connections out of the box. After the stack is running, open OpenSearch Dashboards and create visualizations from Discover or from a dashboard.

## Example data

The examples in this section use OpenSearch Dashboards sample datasets such as `opensearch_dashboards_sample_data_logs` and `opensearch_dashboards_sample_data_flights`. If you are visualizing telemetry produced by the Observability Stack, replace the sample dataset and field names with your logs, traces, or metrics datasets.

## Navigating the visualization editor UI

The following image shows the visualization editor interface.

![Visualization editor interface with callouts](/docs/images/dashboards/visualization-editor/visualization-editor-overview.png)

- The _time filter_ (A) selects the time range for query results.
- The _Update button_ (B) runs or refreshes the query.
- The _query editor_ (C) is where you write PPL queries.
- The _Saved queries_ dropdown (D) saves and loads reusable queries.
- The _configuration panel_ (E) contains the chart type selector, field mappings, and style settings.

## Creating a visualization

To open the visualization editor, use one of the following methods:

- From the left navigation menu, select **Explorer** > **Logs**, then select the **Visualization** tab.
- From a dashboard, select the add panel icon, then select **Visualization editor**. Classic visualization types are grouped under **More** in the same menu.
- From the **Create visualization** dialog, select **Create visualization**. For more information, see [Create visualization dialog](#create-visualization-dialog).

To create a visualization, follow these steps:

1. Select a dataset from the dataset selector in the query bar (for example, **opensearch_dashboards_sample_data_logs**).
1. Write a PPL query in the query editor. If you selected a dataset, start the query with a pipe character (`|`). Otherwise, specify the source explicitly using `source =`. For example, the following query counts log events per hour:

   ```sql
   source = opensearch_dashboards_sample_data_logs | stats count() by SPAN(@timestamp, 1h)
   ```
   

   If `opensearch_dashboards_sample_data_logs` is already selected as the dataset, you can omit the `source`:

   ```sql
   | stats count() by SPAN(@timestamp, 1h)
   ```
   

1. Select **Update** or press **Enter** to run the query.
1. The editor automatically selects a chart type and maps fields to axes based on your query results. To change the chart type, use the **Visualization type** dropdown.
1. To customize the field mapping, use the **Fields** panel.

### Create visualization dialog

The **Create visualization** dialog opens when you select **Create new** on an empty dashboard or create a new visualization from the **Visualize** page. The dialog presents the visualization editor as the recommended option, as shown in the following image.

![Create visualization dialog with the recommended visualization editor, focused-workflow links, and the expanded list of classic visualization types](/docs/images/dashboards/create-visualization-dialog.png)

The dialog contains the following options:

- **Visualization editor** (marked **Recommended**): Select **Create visualization** to open the visualization editor.
- **Or begin from a focused workflow**: Select **Visualize with Discover** or **Visualize with Metrics** to build the visualization from the Discover logs or metrics experience instead. Other links, such as **Maps**, appear when the plugin that provides them is installed.
- **Classic visualization types**: Maps, markdown, controls, TSVB, Vega, and other specialized types that are not yet in the visualization editor. This section is collapsed by default. Select **Show types** to expand it, then use the filter box to search for a type. The dialog remembers whether you left the section expanded.

### Building PPL queries without code

When the query language is PPL, the query panel in the visualization editor includes a **Code** / **Builder** toggle. Select **Builder** to compose the query from menus with the PPL Query Builder instead of writing PPL by hand. The editor opens in **Code** mode.

If a query you wrote in **Code** mode cannot be represented in the builder, **Builder** is disabled and its tooltip explains why. The toggle is not available for PromQL queries. For details about the builder controls, see [Building queries with the PPL Query Builder](/docs/investigate/discover-logs/#building-queries-with-the-ppl-query-builder).

## Using dashboard variables

You can use dashboard variables to create dynamic, interactive visualizations. Variables let you switch between filter values, metrics, time intervals, and aggregation functions without editing the query. Reference variables in your PPL or PromQL queries using `$variableName` or `${variableName}` syntax.

For more information, see [Dashboard variables](/docs/dashboards/variables/).

## Saving a visualization

To save a visualization, select **Save** (or **Save and back** if you opened the editor from a dashboard). Enter a name for the visualization and select **Save**.

If you opened the visualization editor from a dashboard, the visualization is automatically added to that dashboard after saving. If you created the visualization from **Explorer** > **Logs**, save it first, then add it to a dashboard manually.

## Saving and reusing queries

To save a PPL query for reuse, select **Saved queries** > **Save query**. In the dialog, configure the following options.

| Option | Description |
| --- | --- |
| **Save as new query** | When selected, saves the query as a new entry rather than overwriting an existing one. |
| **Name** | A name for the saved query. |
| **Description** | An optional description of the query. |
| **Include filters** | When enabled, saves the currently applied filters along with the query. |
| **Include time filter** | When enabled, saves the current time range along with the query. |

Select **Save changes** to save the query.

To load a previously saved query, select **Saved queries** > **Open query**, then select a query from the list and select the **Open query** button. The saved query is loaded into the query editor.

## Visualization types

The following table lists the supported visualization types and their expected data shapes.

| Chart type | Data shape |
| :--- | :--- |
| [Area chart](/docs/dashboards/visualize/area-chart/) | One date field + one or more numeric fields (supports stacking) |
| [Bar chart](/docs/dashboards/visualize/bar-chart/) | One or more categorical or date fields + one or more numeric fields |
| [Bar gauge chart](/docs/dashboards/visualize/bar-gauge-chart/) | One or more numeric fields (single values) |
| [Gauge chart](/docs/dashboards/visualize/gauge-chart/) | One numeric field (single value) |
| [Heatmap](/docs/dashboards/visualize/heatmap-chart/) | Two categorical or date fields + one numeric field |
| [Histogram](/docs/dashboards/visualize/histogram-chart/) | One numeric field (distribution) |
| [Line chart](/docs/dashboards/visualize/line-chart/) | One date field + one or more numeric fields |
| [Metric chart](/docs/dashboards/visualize/metric-chart/) | One numeric field (single value) |
| [Pie chart](/docs/dashboards/visualize/pie-chart/) | One categorical field + one numeric field |
| [Sankey chart](/docs/dashboards/visualize/sankey-chart/) | Two categorical fields (source and target) + one numeric field (flow value) |
| [Scatter plot](/docs/dashboards/visualize/scatter-chart/) | Two or more numeric fields |
| [State timeline](/docs/dashboards/visualize/state-timeline-chart/) | One date field + one categorical field (state values) |
| [Table](/docs/dashboards/visualize/table-chart/) | Any combination of fields (displays raw data) |

## Configuring visualizations

Shared configuration options (fields, split, axes, tooltip, legend, thresholds, and more) apply across multiple visualization types. For details, see [Configuring visualizations in the visualization editor](/docs/dashboards/visualize/configuring-visualizations/).

## Related documentation

- [PPL](/docs/ppl/)
- [Dashboard variables](/docs/dashboards/variables/)
- [Creating dashboards](/docs/dashboards/build/)
