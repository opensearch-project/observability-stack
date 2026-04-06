---
title: AWS Managed Services
---

Deploy the Observability Stack to AWS using managed services. This creates the same observability platform as the local Docker Compose stack, backed by:

- **Amazon OpenSearch Service** — logs, traces, and service map storage
- **Amazon Managed Service for Prometheus** — time-series metrics
- **Amazon OpenSearch Ingestion (OSIS)** — OTLP ingestion pipeline (replaces OTel Collector + Data Prepper)
- **OpenSearch Dashboards** — visualization and exploration

## Choose a deployment method

### CLI installer

Interactive single-command deploy. Creates all resources, configures dashboards, and optionally launches an EC2 instance running the [OpenTelemetry Demo](https://opentelemetry.io/docs/demo/) for sample telemetry.

```bash
cd aws/cli-installer && npm install
node bin/cli-installer.mjs --managed \
  --pipeline-name obs-stack \
  --region us-west-2
```

Takes ~15 minutes. See [aws/cli-installer/README.md](https://github.com/opensearch-project/observability-stack/tree/main/aws/cli-installer) for full options.

### CDK

Infrastructure as code using AWS CDK. Deploys two stacks — one for the OpenSearch domain and Prometheus workspace (~17 min), one for the OSIS pipeline, dashboards, and optional demo workload (~6 min).

```bash
cd aws/cdk
npm install
cdk deploy --all
```

See [aws/cdk/README.md](https://github.com/opensearch-project/observability-stack/tree/main/aws/cdk) for configuration, architecture details, and SigV4 telemetry setup.

## Sending telemetry

Both methods create an OSIS ingestion endpoint that accepts OTLP data. Configure your OpenTelemetry Collector to export using SigV4 authentication:

```yaml
extensions:
  sigv4auth:
    region: us-west-2
    service: osis

exporters:
  otlphttp/logs:
    logs_endpoint: ${OSIS_ENDPOINT}/v1/logs
    auth: { authenticator: sigv4auth }
    compression: none
  otlphttp/traces:
    traces_endpoint: ${OSIS_ENDPOINT}/v1/traces
    auth: { authenticator: sigv4auth }
    compression: none
  otlphttp/metrics:
    metrics_endpoint: ${OSIS_ENDPOINT}/v1/metrics
    auth: { authenticator: sigv4auth }
    compression: none
```

The IAM principal sending data needs `osis:Ingest` permission on the pipeline ARN.

## Cleanup

**CLI installer:**
```bash
node bin/cli-installer.mjs --destroy --pipeline-name obs-stack --region us-west-2
```

**CDK:**
```bash
cd aws/cdk
cdk destroy --all
```
