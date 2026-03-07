---
title: "Ingest API"
description: "Send pre-processed telemetry data directly to OpenSearch via the Bulk API"
---

The OpenSearch Bulk API provides a direct ingestion path for sending telemetry data without going through the OTel Collector and Data Prepper pipeline. Use it when you have pre-processed data or need a lightweight integration.

## When to use direct ingest

| Scenario | Recommended approach |
|----------|---------------------|
| Application traces and logs via OTel SDKs | OTel Collector + Data Prepper pipeline |
| Pre-processed or transformed data | Direct Ingest API |
| Migrating historical data | Direct Ingest API |
| Custom log formats from legacy systems | Direct Ingest API |
| Infrastructure metrics from Prometheus | OTel Collector + Data Prepper pipeline |
| One-off data imports or backfills | Direct Ingest API |

The OTel pipeline is preferred for production application telemetry because it handles batching, retries, schema transformation, and service map generation automatically. Use the Ingest API when your data is already in the correct format or when you need direct control over the indexing process.

## Prerequisites

- OpenSearch cluster accessible on port 9200
- Valid credentials with write permissions to target indices

## Index templates

The Observability Stack uses specific index types. When ingesting directly, target the correct index pattern.

| Signal | Index Pattern | Description |
|--------|--------------|-------------|
| Traces | `otel-v1-apm-span-*` | Raw span documents |
| Logs | `ss4o_logs-*` | Simple Schema for Observability log documents |
| Metrics | `ss4o_metrics-*` | Simple Schema for Observability metric documents |

## Ingesting traces

Send span documents to the trace analytics index:

```bash
curl -X POST "https://localhost:9200/otel-v1-apm-span-000001/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  -u "admin:${OPENSEARCH_PASSWORD}" \
  --insecure \
  -d '
{"index": {}}
{"traceId":"abc123","spanId":"span456","traceState":"","parentSpanId":"","name":"HTTP GET /api/users","kind":"SPAN_KIND_SERVER","startTime":"2025-01-15T10:30:00Z","endTime":"2025-01-15T10:30:00.150Z","durationInNanos":150000000,"serviceName":"user-service","status.code":0,"resource.attributes.service.name":"user-service","resource.attributes.telemetry.sdk.language":"python"}
'
```

## Ingesting logs

Send log documents to the log analytics index:

```bash
curl -X POST "https://localhost:9200/ss4o_logs-application-000001/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  -u "admin:${OPENSEARCH_PASSWORD}" \
  --insecure \
  -d '
{"index": {}}
{"@timestamp":"2025-01-15T10:30:00Z","severity_text":"ERROR","severity_number":17,"body":"Connection timeout to database host db-primary:5432","resource.attributes.service.name":"user-service","resource.attributes.host.name":"pod-abc123","attributes.error.type":"ConnectionTimeout","attributes.db.system":"postgresql"}
'
```

## Ingesting metrics

Send metric documents to the metrics index:

```bash
curl -X POST "https://localhost:9200/ss4o_metrics-application-000001/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  -u "admin:${OPENSEARCH_PASSWORD}" \
  --insecure \
  -d '
{"index": {}}
{"@timestamp":"2025-01-15T10:30:00Z","name":"http.server.request.duration","kind":"HISTOGRAM","unit":"s","value":0.152,"resource.attributes.service.name":"user-service","attributes.http.request.method":"GET","attributes.http.route":"/api/users","attributes.http.response.status_code":200}
'
```

## Bulk ingestion format

The Bulk API expects newline-delimited JSON (NDJSON). Each operation requires two lines: an action line and a document line.

```
{"index": {"_index": "target-index"}}
{"field1": "value1", "field2": "value2"}
{"index": {"_index": "target-index"}}
{"field1": "value3", "field2": "value4"}
```

Rules for the Bulk API:

- Each line must be valid JSON terminated by a newline (`\n`).
- The request body must end with a newline.
- Do not include pretty-printed JSON -- each document must be a single line.
- Set `Content-Type: application/x-ndjson`.

## Batch size recommendations

| Batch Size | Use Case |
|-----------|----------|
| 100-500 documents | Low-volume or latency-sensitive ingestion |
| 500-2,000 documents | General-purpose bulk ingestion |
| 2,000-5,000 documents | High-volume backfills and migrations |
| 5-15 MB per request | Size-based limit (stay under 15 MB) |

Monitor the response for errors. The Bulk API returns a per-document status, so partial failures are possible:

```bash
# Check for errors in bulk response
curl -s -X POST "https://localhost:9200/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  -u "admin:${OPENSEARCH_PASSWORD}" \
  --insecure \
  --data-binary @documents.ndjson | jq '.errors, .items[] | select(.index.error)'
```

## Programmatic ingestion

For production workloads, use an OpenSearch client library instead of `curl`:

```python
from opensearchpy import OpenSearch, helpers

client = OpenSearch(
    hosts=["https://localhost:9200"],
    http_auth=("admin", os.environ["OPENSEARCH_PASSWORD"]),
    use_ssl=True,
    verify_certs=False,
)

documents = [
    {
        "_index": "ss4o_logs-application-000001",
        "_source": {
            "@timestamp": "2025-01-15T10:30:00Z",
            "severity_text": "ERROR",
            "body": "Connection timeout",
            "resource.attributes.service.name": "user-service",
        },
    },
]

success, errors = helpers.bulk(client, documents)
print(f"Indexed {success} documents, {len(errors)} errors")
```

## Related links

- [Pipeline Overview](/docs/send-data/data-pipeline/) -- When to use pipelines vs. direct ingest.
- [Data Prepper](/docs/send-data/data-pipeline/data-prepper/) -- Pipeline-based ingestion with automatic transformation.
- [OpenSearch Bulk API reference](https://opensearch.org/docs/latest/api-reference/document-apis/bulk/) -- Full API specification.
