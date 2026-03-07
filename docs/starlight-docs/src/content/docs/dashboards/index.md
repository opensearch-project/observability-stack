---
title: "Dashboards & Visualize"
description: "Build, customize, and share observability dashboards in OpenSearch"
---

Dashboards are where investigation results become operational views. In OpenSearch, dashboards combine visualizations from logs, traces, and metrics into a single pane — giving teams a shared, real-time picture of system health.

## What dashboards are for

Dashboards serve different audiences and purposes:

| Use case | Example |
|---|---|
| Operational monitoring | Service health overview with error rates, latency, and throughput |
| Incident response | Real-time view of affected services, error spikes, and trace failures |
| Capacity planning | Resource utilization trends over days or weeks |
| Availability tracking | Service uptime, error rates, and availability percentages |
| Post-incident review | Side-by-side comparison of metrics before and after a deployment |

## How dashboards connect to Discover

Dashboards and Discover work together. The typical workflow:

1. Investigate in Discover — build a query, explore the data, find the right visualization
2. Save the visualization to a dashboard (new or existing)
3. The dashboard panel stays live, updating as new data arrives
4. When something looks wrong on a dashboard, click through to Discover to dig deeper

You can also build visualizations directly within the dashboard editor without going through Discover first.

## Dashboard structure

A dashboard is a collection of panels arranged on a grid. Each panel contains:

- A data source (index pattern or saved query)
- A query (PPL for logs/traces, PromQL for metrics)
- A visualization type (line chart, bar chart, table, etc.)
- Optional configuration (axes, legends, thresholds, colors)

Panels can be resized, rearranged, and configured independently. The dashboard's time range picker applies to all panels simultaneously, keeping everything in sync.

## Dashboard filters

Filters let you narrow the data across all panels at once without editing individual queries. They sit in the filter bar at the top of the dashboard, alongside the time range picker.

### Adding filters

1. Select **Add filter** in the filter bar
2. Choose a field (e.g., `resource.attributes.service.name`, `severity.text`, `service_name`)
3. Pick an operator — `is`, `is not`, `is one of`, `exists`, etc.
4. Set the value (e.g., `checkout-service`)
5. The filter applies to every panel on the dashboard immediately

You can stack multiple filters. They combine with AND logic — all conditions must match.

### Filter use cases

| Scenario | Filter |
|---|---|
| Focus on one service during an incident | `resource.attributes.service.name` is `checkout-service` |
| Exclude noisy debug logs | `severity.text` is not `DEBUG` |
| Show only error-related data | `severity.text` is one of `ERROR, FATAL` |
| Filter to a specific environment | `resource.attributes.deployment.environment` is `production` |

### Pinned vs. unpinned filters

- **Unpinned filters** apply only to the current dashboard session. Navigate away and they're gone.
- **Pinned filters** persist across dashboard navigation and page reloads. Pin a filter by clicking the filter pill and selecting **Pin**.

Pin filters when you're investigating a specific service or environment and want the context to follow you as you switch between dashboards.

### Filters and template variables (coming soon)

Currently, dashboards support global filters for narrowing data across all panels. Template variable support — dropdowns that let you switch between services, environments, or time intervals — is planned for a future release. Once available, variables will complement filters by providing reusable, designed-in drill-down controls.

## Getting started

- [Build a Dashboard](/docs/dashboards/build/) — create dashboards, add panels, choose visualization types, and arrange layouts
- [Sharing Dashboards](/docs/dashboards/sharing/) — share, export, and best practices
- [Troubleshooting](/docs/dashboards/troubleshooting/) — diagnose panel issues, inspect queries, and fix common problems
