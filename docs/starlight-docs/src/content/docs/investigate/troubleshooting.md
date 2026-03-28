---
title: "Troubleshooting Queries"
description: "Diagnose and fix common issues with PPL and PromQL queries in Discover"
---

When a query returns unexpected results, no results, or errors, these techniques help you figure out what's going wrong.

## Common query issues

### No results returned

| Possible cause | How to check | Fix |
|---|---|---|
| Time range too narrow | Check the date picker - does it cover when the data was ingested? | Widen the time range |
| Wrong index pattern | Check `source =` in PPL or the index selector | Switch to the correct index (e.g., `logs-otel-v1*` not `logs-otel-v1`) |
| Filter too restrictive | Check the filter bar for active filters | Remove or loosen filters |
| Field name mismatch | Check the network payload for the exact field names | Use autocomplete to verify field names, or check the index mapping |
| Data hasn't been ingested | Check the index exists and has recent documents | Verify your data pipeline is running |

### Query syntax errors

PPL syntax errors usually point to the exact position of the problem. Common mistakes:

- Missing pipe (`|`) between commands
- Using `=` instead of `==` in `where` clauses (PPL uses `=` for equality, not `==`)
- Quoting issues - field names with dots (like `severity.text`) don't need quotes, but string values do
- Using `AND`/`OR` without proper parentheses for precedence
- REX capture group names containing underscores (not allowed - use letters and digits only)

### Query takes too long or times out

- Narrow the time range - this is the single biggest performance lever
- Add `where` clauses early in the pipeline to filter before aggregating
- Avoid `join` and `subquery` on large indices without tight filters on both sides
- Add `| head N` to limit result sets
- For `stats dc()` on high-cardinality fields, consider whether you really need exact distinct counts
- Check if the OpenSearch cluster is under resource pressure (high CPU, memory, or disk usage)

### Insufficient resources error

This means the query exceeded the cluster's memory or compute limits. To work around it:

- Reduce the time range significantly (try `earliest=-15m` instead of hours)
- Remove expensive operations like `join`, `subquery`, or `eventstats` and simplify the query
- Break complex queries into smaller steps - run the inner query first, note the results, then build the outer query
- If on a local development cluster (like observability-stack), the resource limits are tight by design - simplify queries or increase Docker resource allocation

### Results look wrong

- Check for null values in fields you're aggregating - nulls can skew `avg()`, `count()`, and other stats. Use `fillnull` to handle them
- Verify field types - aggregating on a string field that looks numeric won't work as expected
- Check for duplicate events - if data is being ingested from multiple pipelines, you may be double-counting
- Look at the raw data (`| fields *`) before aggregating to confirm the data looks right at the source

## PromQL-specific issues

### No data points

- Verify the metric name exists - use autocomplete or the metrics explorer to browse available metrics
- Check label names and values - PromQL label matchers are case-sensitive
- Ensure the scrape interval covers your range vector - `rate(metric[1m])` needs at least 2 data points within 1 minute

### Unexpected NaN or Inf values

- `NaN` usually means division by zero - add a `> 0` filter to the denominator
- `Inf` can appear in `histogram_quantile()` when there aren't enough buckets - check that the `le` label exists and has sufficient values
- Missing `rate()` around counters - counters only go up, so raw values aren't useful. Always wrap counters in `rate()` or `increase()`

### Rate returns 0 when data exists

- The range vector window might be too small - if your scrape interval is 30s, use at least `[1m]` for `rate()`
- Counter resets (service restarts) can cause `rate()` to return 0 for one interval - this is normal

## Browser developer tools

When the above techniques don't resolve the issue, your browser's developer tools can show you exactly what's happening between the Discover UI and OpenSearch.

### Inspect network requests

1. Open developer tools (right-click → **Inspect**, or `Cmd+Option+I` on macOS)
2. Switch to the **Network** tab
3. Run your query in Discover
4. Look for the request to the OpenSearch query endpoint (typically a POST to `/_plugins/_ppl` or `/_plugins/_query`)
5. Click the request to see:
   - **Request payload** - the exact query sent to OpenSearch, including any filters or time ranges the UI added
   - **Response body** - the raw data returned, before the UI formats it
   - **Status code** - 200 (success), 400 (bad query syntax), 500 (server error), etc.
   - **Timing** - how long the query took to execute

This is especially useful when the UI shows an unhelpful error message. The response body often contains a more detailed error from the query engine.

### What to look for in the payload

- Check that the time range in the request matches what you expect - the UI may be adding time filters you didn't write
- Look for additional `where` clauses injected by dashboard filters or Discover's filter bar
- Verify the index pattern in the `source` matches your intended target
- Check for query size limits (`size`, `head`) that might be truncating results

## Getting help

If you've exhausted these techniques:

1. Copy the exact query and error message
2. Check the network response body for detailed error information
3. Try running a simplified version of the query (just `source = index | head 10`) to confirm basic connectivity
4. Check OpenSearch cluster health and resource usage
5. Consult the [PPL documentation](https://github.com/opensearch-project/sql/blob/main/docs/user/ppl/index.md) or [PromQL documentation](https://prometheus.io/docs/prometheus/latest/querying/basics/) for syntax reference
6. Ask in the [#observability channel](https://opensearch.org/slack) on the OpenSearch Slack workspace - the community is active and responsive
7. Search or file an issue on the [OpenSearch GitHub repo](https://github.com/opensearch-project/OpenSearch) for bugs or feature requests
