# Optimized engine index templates

`otel-v2-apm-span-index-template.json` is the traces index template for domains on the OpenSearch Optimized engine. It's Data Prepper's v2 span mappings, built from Data Prepper [`9c2fdc2`](https://github.com/opensearch-project/data-prepper/tree/9c2fdc2f29e3a98e1cc20c177114d5521851fbf4/data-prepper-plugins/opensearch/src/main/resources/index-template):

- `otel-v1-apm-span-index-standard-template.json` (the `otel-v2-apm-span-plain` component),
- plus the dynamic templates of `otel-v2-apm-span-nested-keyword-component-template.json`,
- with `events` and `links` mapped as `text` instead of `nested`. The engine rejects nested fields, and arrays of objects in an `object` field, so the pipeline writes each span's events and links as a JSON string (`write_json`). They can be searched as text but not queried field by field.

The pipeline writes it as a custom index, so Data Prepper doesn't set document IDs, which the engine also rejects.
