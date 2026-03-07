---
title: "Sharing Dashboards"
description: "Share dashboards, export reports, and manage dashboard best practices"
---

Once you've built a dashboard, share it with the people who need it — team members, on-call engineers, or stakeholders.

## Share with team members

Dashboards are accessible to anyone with the appropriate OpenSearch permissions. Share by:
- Sending the dashboard URL directly — the URL includes the dashboard ID and current time range
- Adding the dashboard to a team's bookmarked dashboards list
- Referencing it in runbooks and incident response documentation

### Share a snapshot

For sharing a point-in-time view (e.g., during a post-incident review):
1. Set the dashboard to the time range you want to capture
2. Select **Share** → **Snapshot**
3. The snapshot preserves the exact state — data, time range, and filters

Snapshots are read-only and don't update with new data. They're a record of what the dashboard looked like at a specific moment.

### Export options

| Format | Use case |
|---|---|
| PDF | Attach to incident reports, share with non-OpenSearch users |
| PNG | Embed in presentations, documentation, or chat |
| CSV (per panel) | Export raw data for analysis in spreadsheets or notebooks |
| Dashboard JSON | Back up dashboard configuration, migrate between environments |

### Importing and exporting dashboard definitions

Export a dashboard as JSON to:
- Version control your dashboard definitions alongside your code
- Migrate dashboards between OpenSearch environments (dev → staging → prod)
- Share dashboard templates across teams

Import by navigating to **Dashboards** → **Import** and uploading the JSON file. Update index patterns to match the target environment.

## Dashboard best practices

### Design for the audience

- **On-call engineers:** prioritize real-time data, error rates, and latency. Keep it scannable — if something is wrong, it should be obvious in 5 seconds.
- **Team leads:** include trend data, error rate trends, and week-over-week comparisons. These dashboards are checked daily, not during incidents.
- **Stakeholders:** high-level summaries — availability percentage, request volume, key business metrics. Minimize technical detail.

### Keep dashboards focused

A dashboard that tries to show everything shows nothing useful. Each dashboard should answer a specific set of questions:
- "Is my service healthy right now?" → operational dashboard
- "What happened during the incident?" → incident response dashboard
- "Are we meeting our availability targets?" → availability tracking dashboard

If a dashboard has more than 10–12 panels, consider splitting it into multiple focused dashboards.

### Use consistent conventions

- Same color for the same service across all panels
- Same Y-axis units for comparable metrics (don't mix milliseconds and seconds)
- Same time range across all panels (avoid per-panel overrides unless necessary)
- Consistent naming for panels: `[Signal] What it measures` (e.g., "Error rate by service")

### Version control your dashboards

Export dashboard JSON and commit it to your repository. This gives you:
- History of dashboard changes
- Ability to roll back if someone breaks a dashboard
- Reproducible dashboards across environments
- Code review for dashboard changes

## Next steps

- [Build a Dashboard](/docs/dashboards/build/) — create dashboards, add panels, and arrange layouts
- [Discover Logs](/docs/investigate/discover-logs/) — build log queries for dashboard panels
- [Discover Traces](/docs/investigate/discover-traces/) — build trace queries for dashboard panels
- [Discover Metrics](/docs/investigate/discover-metrics/) — build PromQL queries for metrics panels
