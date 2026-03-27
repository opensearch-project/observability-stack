---
title: "Troubleshooting Dashboards"
description: "Diagnose and fix common issues with dashboard panels, visualizations, and performance"
---

When a dashboard panel shows unexpected data, errors, or loads slowly, these techniques help you pinpoint the problem.

## Inspect a panel

### Panel shows "No data"

| Possible cause | How to check | Fix |
|---|---|---|
| Time range doesn't cover the data | Check the dashboard time picker | Widen the time range or switch to "Last 1 hour" |
| Filter is too restrictive | Check the filter bar for active filters | Remove or loosen filters |
| Index pattern doesn't exist | Inspect → Request tab, check the source | Verify the index exists in OpenSearch |
| Query syntax error | Inspect → Response tab, look for error message | Fix the query syntax in the panel editor |

### Panel shows wrong data

- **Check filters:** Dashboard filters apply to all panels. A filter you added for one panel may be affecting others unexpectedly.
- **Check time zone:** The dashboard time picker and the data timestamps may be in different time zones. OpenSearch stores timestamps in UTC by default.
- **Check aggregation:** A panel showing `avg()` when you expected `sum()` will look very different. Open the panel editor and verify the aggregation function.

### Panel shows stale data

- Check auto-refresh - if it's disabled, the dashboard only updates when you manually refresh or change the time range
- Check the time range - "Last 1 hour" is relative and updates on refresh, but a custom absolute range (e.g., "March 4, 2pm–3pm") is fixed
- Check data ingestion - if the pipeline is delayed, the data may not have arrived yet

## Performance issues

### Dashboard loads slowly

1. **Identify the slow panel:** Open browser developer tools → Network tab → refresh the dashboard. Sort requests by duration to find the slowest query.
2. **Use panel inspect:** Open the slow panel's inspect view → Request tab. Look at the query - is it scanning too much data?
3. **Common fixes:**
   - Narrow the dashboard time range
   - Reduce the number of panels - each panel fires a separate query
   - Simplify expensive queries (remove joins, reduce distinct count operations)
   - Use `| head N` in PPL queries to limit result sets
   - For PromQL, use shorter range vectors (`[5m]` instead of `[1h]`)

### Individual panel is slow but others are fast

The slow panel likely has an expensive query. Use inspect to see the query and response time, then optimize:

- Add tighter filters early in the query pipeline
- Reduce the cardinality of `by` clauses in aggregations
- Check if the panel is querying a much larger index than the others
- Consider pre-aggregating data if the same expensive query runs on every refresh

### Dashboard causes browser to lag

This is usually a rendering problem, not a query problem:

- Too many data points in a single panel (e.g., a line chart with 100,000 points) - increase the `timechart span` to reduce granularity
- Too many panels on one dashboard - split into multiple focused dashboards
- Large data tables without pagination - add `| head 100` to limit rows

## Filter issues

### Filter applies to wrong panels

Dashboard filters apply to all panels by default. If a filter should only affect specific panels:

- Use the query within the panel itself instead of a dashboard filter

### Pinned filter from another dashboard is interfering

Pinned filters persist across dashboard navigation. Check the filter bar for pinned filters (they have a pin icon) and unpin or remove any that don't belong.

## Inspect a panel

Every dashboard panel has a built-in inspect tool that shows you exactly what's happening under the hood.

### Using panel inspect

1. Hover over the panel you want to debug
2. Click the panel menu (three dots or gear icon)
3. Select **Inspect**
4. You'll see tabs for:
   - **Data** - the raw data returned by the query, as a table. Check whether the values match what you expect.
   - **Request** - the exact query sent to OpenSearch, including any filters and time ranges the dashboard applied
   - **Response** - the raw JSON response from OpenSearch, including timing and metadata

### What to look for

- **Request tab:** Check that filters resolved correctly and the query matches what you expect.
- **Data tab:** Verify the columns and values. If a panel shows "No data" but the data tab has rows, the visualization configuration (axes, grouping) may be wrong.
- **Response tab:** Look for error messages, query execution time, and the number of hits. A query that returns 0 hits is a data or filter problem, not a visualization problem.

## Browser developer tools

For deeper debugging, use your browser's developer tools alongside panel inspect.

### Network tab

1. Open developer tools (`Cmd+Option+I` on macOS)
2. Switch to the **Network** tab
3. Refresh the dashboard or change the time range
4. Watch for requests to OpenSearch endpoints - each panel fires its own query
5. Look for:
   - **Failed requests** (red) - server errors, timeouts, or permission issues
   - **Slow requests** - sort by duration to find the panel that's dragging down the whole dashboard
   - **Response size** - very large responses can slow down rendering even if the query is fast

### Console tab

Check the browser console for JavaScript errors. Panel rendering failures sometimes show up here when the data shape doesn't match what the visualization expects.

## Getting help

When reporting a dashboard issue:

1. Use panel inspect to capture the request and response
2. Note the dashboard time range and any active filters
3. Check the browser console for errors
4. Try the same query directly in Discover - if it works there but not on the dashboard, the issue is in the panel configuration
5. Export the dashboard JSON (Share → Export) to preserve the exact configuration for debugging
6. Ask in the [#observability channel](https://opensearch.org/slack) on the OpenSearch Slack workspace - the community is active and responsive
7. Search or file an issue on the [OpenSearch GitHub repo](https://github.com/opensearch-project/OpenSearch-Dashboards) for bugs or feature requests
