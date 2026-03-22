---
name: osd-config
description: Query OpenSearch Dashboards APIs for workspace configuration, index pattern discovery, APM correlation configs, and saved objects.
allowed-tools:
  - Bash
  - curl
---

## Connection Defaults

| Variable | Default | Description |
|---|---|---|
| `OSD_ENDPOINT` | `http://localhost:5601` | OpenSearch Dashboards base URL |
| `OPENSEARCH_USER` | `admin` | Username (same as OpenSearch) |
| `OPENSEARCH_PASSWORD` | `My_password_123!@#` | Password (same as OpenSearch) |

Note: All OSD API calls require the `osd-xsrf: true` header.

## Workspace Discovery

### List All Workspaces

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/workspaces/_list" \
  -H 'osd-xsrf: true'
```

### Get Workspace Details

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/workspaces/<WORKSPACE_ID>" \
  -H 'osd-xsrf: true'
```

### Associate Datasource with Workspace

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OSD_ENDPOINT/api/workspaces/_associate" \
  -H 'osd-xsrf: true' \
  -H 'Content-Type: application/json' \
  -d '{"workspaceId": "<WORKSPACE_ID>", "savedObjects": [{"type": "data-source", "id": "<DATASOURCE_ID>"}]}'
```

## Dashboards Settings

### Get Default Workspace

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/opensearch-dashboards/settings" \
  -H 'osd-xsrf: true'
```

## Index Pattern Discovery

### List All Index Patterns

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=index-pattern&per_page=100" \
  -H 'osd-xsrf: true'
```

### Workspace-Scoped Index Patterns

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/w/<WORKSPACE_ID>/api/saved_objects/_find?type=index-pattern&per_page=100" \
  -H 'osd-xsrf: true'
```

### Get Index Pattern Field Mappings

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/index-pattern/<INDEX_PATTERN_ID>" \
  -H 'osd-xsrf: true'
```

## Dataset Discovery

Datasets are an evolution of index patterns that classify indices by signal type (logs, traces, metrics). Users define which indices are logs vs traces through the Dashboards UI. See [Dataset Discovery documentation](https://docs.opensearch.org/latest/observing-your-data/exploring-observability-data/datasets/) for details.

To discover datasets programmatically, query the index patterns and check their `dataSourceType` or use the saved objects API to find index patterns with observability schema mappings:

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=index-pattern&per_page=100&fields=title&fields=dataSourceType" \
  -H 'osd-xsrf: true'
```

Index patterns created by the observability stack init script include schema mappings that identify their signal type (e.g., `otelLogs` for log indices, trace-specific time fields for trace indices). These mappings are visible in the index pattern's `attributes.fields` property.

## APM Configuration

### Get APM Correlation Config

The APM plugin stores `correlations` saved objects that define how traces, logs, and metrics are linked. Two correlation types are created by the init script:

- **`trace-to-logs-*`** — Links a trace index pattern to a log index pattern for cross-signal navigation
- **`APM-Config-*`** — Ties together the traces index, service map index, and Prometheus datasource for the APM UI

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=correlations&per_page=100" \
  -H 'osd-xsrf: true'
```

### Workspace-Scoped APM Config

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/w/<WORKSPACE_ID>/api/saved_objects/_find?type=correlations&per_page=100" \
  -H 'osd-xsrf: true'
```

## Saved Objects

### Count Saved Objects by Type

The `_find` API requires a `type` parameter. To get a count without loading objects, use `per_page=0`:

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=index-pattern&per_page=0" \
  -H 'osd-xsrf: true'
```

Common saved object types: `index-pattern`, `query`, `dashboard`, `visualization`, `config`, `correlations`, `data-source`, `data-connection`, `explore`.

### Find Correlations

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=correlations&per_page=100" \
  -H 'osd-xsrf: true'
```

### Find Data Sources (OpenSearch)

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=data-source&per_page=100" \
  -H 'osd-xsrf: true'
```

### Find Data Connections (Prometheus)

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=data-connection&per_page=100" \
  -H 'osd-xsrf: true'
```

### Find Explore Panels

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=explore&per_page=100" \
  -H 'osd-xsrf: true'
```

### Find Saved Queries

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=query&per_page=100" \
  -H 'osd-xsrf: true'
```

### Find Dashboards

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=dashboard&per_page=100" \
  -H 'osd-xsrf: true'
```

### Find Visualizations

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=visualization&per_page=100" \
  -H 'osd-xsrf: true'
```

## Data Connections

### List Prometheus Data Connections

To discover existing Prometheus data connections, use the saved objects API (the `data-connection` type):

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OSD_ENDPOINT/api/saved_objects/_find?type=data-connection&per_page=100" \
  -H 'osd-xsrf: true'
```

### Create Prometheus Data Connection

The init script creates Prometheus data connections via the direct query API:

```bash
curl -s -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OSD_ENDPOINT/api/directquery/dataconnections" \
  -H 'osd-xsrf: true' \
  -H 'Content-Type: application/json' \
  -d '{"name": "MyPrometheus", "connector": "prometheus", "allowedRoles": ["all_access"], "properties": {"prometheus.uri": "http://prometheus:9090", "prometheus.auth.type": "basicauth", "prometheus.auth.username": "", "prometheus.auth.password": ""}}'
```

## Dynamic Index Discovery via OpenSearch API

When OSD is not available, query OpenSearch directly to discover indices and field mappings:

### List All Observability Indices

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OPENSEARCH_ENDPOINT/_cat/indices?format=json&v" | python3 -c "
import sys, json
for idx in json.load(sys.stdin):
    name = idx['index']
    if any(p in name for p in ['otel-', 'logs-otel-', 'apm-']):
        print(f\"{name}  docs={idx['docs.count']}  size={idx['store.size']}\")"
```

### Get Trace Index Field Mappings

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OPENSEARCH_ENDPOINT/otel-v1-apm-span-*/_mapping?pretty"
```

### Get Log Index Field Mappings

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OPENSEARCH_ENDPOINT/logs-otel-v1-*/_mapping?pretty"
```

### Get Service Map Index Field Mappings

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  "$OPENSEARCH_ENDPOINT/otel-v2-apm-service-map-*/_mapping?pretty"
```

### PPL Describe for Field Discovery

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "describe otel-v1-apm-span-000001"}'
```

```bash
curl -sk -u "$OPENSEARCH_USER:$OPENSEARCH_PASSWORD" \
  -X POST "$OPENSEARCH_ENDPOINT/_plugins/_ppl" \
  -H 'Content-Type: application/json' \
  -d '{"query": "describe logs-otel-v1-000001"}'
```

## Default Index Patterns

When dynamic discovery is not possible, these are the default index patterns used by the observability stack:

| Signal | Index Pattern | Description |
|---|---|---|
| Traces | `otel-v1-apm-span-*` | Trace span data with serviceName, traceId, spanId |
| Logs | `logs-otel-v1-*` | Log entries with resource.attributes.service.name |
| Service Maps | `otel-v2-apm-service-map-*` | Service topology with sourceNode, targetNode |

## References

- [OpenSearch Dashboards Saved Objects API](https://opensearch.org/docs/latest/dashboards/management/saved-objects-api/) — API reference for saved objects
- [Dataset Discovery](https://docs.opensearch.org/latest/observing-your-data/exploring-observability-data/datasets/) — Datasets for classifying indices by signal type
- [PPL Language Reference](https://github.com/opensearch-project/sql/blob/main/docs/user/ppl/index.md) — PPL syntax for describe and other commands
