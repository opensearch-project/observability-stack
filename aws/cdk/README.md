# AWS CDK Deployment

Deploy the Observability Stack to AWS managed services using CDK. This creates the same infrastructure as the [CLI installer](../cli-installer/) — OpenSearch domain, OSIS ingestion pipeline, Amazon Managed Prometheus, OpenSearch Application with dashboards — as code.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [AWS CDK CLI](https://docs.aws.amazon.com/cdk/v2/guide/cli.html) (`npm install -g aws-cdk`)
- AWS credentials configured (`aws configure` or environment variables)
- CDK bootstrapped in your account/region: `cdk bootstrap`

## Quick Start

```bash
cd aws/cdk
npm install
cd custom-resources && npm install && cd ..
cdk deploy --all
```

This deploys two stacks:

| Stack | What it creates | Deploy time |
|-------|----------------|-------------|
| **ObsInfra** | OpenSearch domain, AMP workspace, DQS data source, pipeline IAM role | ~17 min |
| **ObservabilityStack** | FGAC mapping, OSIS pipeline, OpenSearch Application, UI init, demo workload | ~6 min |

After deployment, the stack outputs include a **Dashboard URL** you can open directly in your browser.

## Configuration

Edit `bin/app.ts` to customize:

```typescript
// OpenSearch domain sizing
osInstanceType: 'r6g.large.search',
osInstanceCount: 1,
osVolumeSize: 100,

// OSIS pipeline capacity (OpenSearch Compute Units)
minOcu: 1,
maxOcu: 4,

// Launch EC2 instance with OpenTelemetry Demo workloads
enableDemo: true,
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ ObsInfra Stack                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  OpenSearch   │  │     AMP      │  │  DQS Data Source       │ │
│  │   Domain      │  │  Workspace   │  │  (Prometheus → OS)     │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│ ObservabilityStack                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ OSIS Pipeline│  │  OpenSearch   │  │  FGAC Role Mapping     │ │
│  │ (OTLP ingest)│  │  Application │  │                        │ │
│  └──────────────┘  └──────┬───────┘  └────────────────────────┘ │
│                           │                                     │
│                    ┌──────┴───────┐  ┌────────────────────────┐ │
│                    │   UI Init    │  │  EC2 Demo (optional)   │ │
│                    │  (dashboards)│  │  OTel Demo workloads   │ │
│                    └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

The two-stack split keeps the slow-to-create OpenSearch domain separate, so iterating on pipeline config, dashboards, or application settings takes ~6 minutes instead of ~25.

## Stack Outputs

After deployment, retrieve outputs with:

```bash
aws cloudformation describe-stacks --stack-name ObservabilityStack \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table
```

| Output | Description |
|--------|-------------|
| `DashboardUrl` | Direct link to the Observability Stack workspace |
| `OsisIngestEndpoint` | OTLP endpoint — point your OTel Collector here |
| `OpenSearchAppEndpoint` | OpenSearch Application root URL |
| `OpenSearchEndpoint` | OpenSearch domain endpoint |
| `PrometheusWorkspaceId` | Amazon Managed Prometheus workspace ID |
| `DemoInstanceId` | EC2 instance ID (when `enableDemo: true`) |

## Sending Telemetry

Configure your OpenTelemetry Collector to export to the OSIS endpoint using SigV4 authentication:

```yaml
extensions:
  sigv4auth:
    region: us-west-2
    service: osis

exporters:
  otlphttp/logs:
    logs_endpoint: ${OSIS_ENDPOINT}/obs-stack-observabilitystack/v1/logs
    auth: { authenticator: sigv4auth }
    compression: none
  otlphttp/traces:
    traces_endpoint: ${OSIS_ENDPOINT}/obs-stack-observabilitystack/v1/traces
    auth: { authenticator: sigv4auth }
    compression: none
  otlphttp/metrics:
    metrics_endpoint: ${OSIS_ENDPOINT}/obs-stack-observabilitystack/v1/metrics
    auth: { authenticator: sigv4auth }
    compression: none
```

The IAM principal sending data needs `osis:Ingest` permission on the pipeline ARN.

## Demo Workload

When `enableDemo: true`, an EC2 instance launches running the [OpenTelemetry Demo](https://opentelemetry.io/docs/demo/) — a full e-commerce microservices app (~20 services) that generates realistic traces, logs, and metrics. Data flows through the OTel Collector → OSIS pipeline → OpenSearch + AMP.

## Useful Commands

```bash
# Deploy both stacks
cdk deploy --all

# Deploy only the fast-iteration stack (after infra is up)
cdk deploy ObservabilityStack --exclusively

# View diff before deploying
cdk diff

# Destroy everything
cdk destroy --all

# Destroy only the app stack (keeps domain intact)
cdk destroy ObservabilityStack
```

## Project Structure

```
aws/cdk/
├── bin/app.ts                          # Entry point — stack instantiation and config
├── lib/
│   ├── infra-stack.ts                  # OpenSearch domain, AMP, DQS data source
│   ├── observability-stack.ts          # FGAC, OSIS pipeline, Application, UI init
│   ├── opensearch.ts                   # Domain + secret + pipeline role construct
│   ├── prometheus.ts                   # AMP workspace + DQS data source construct
│   ├── ingestion-pipeline.ts           # OSIS pipeline construct
│   ├── opensearch-app.ts              # OpenSearch Application + UI init construct
│   └── demo-workload.ts               # EC2 instance with OTel Demo
├── custom-resources/
│   ├── fgac-mapping/index.ts           # FGAC Security API role mapping
│   ├── dqs-datasource/index.ts         # DQS Prometheus data source
│   ├── opensearch-app/index.ts         # OpenSearch Application lifecycle
│   └── ui-init/                        # Workspace, index patterns, dashboards
│       ├── index.ts
│       └── arch-image.mjs              # Architecture diagram (base64 PNG)
├── package.json
├── tsconfig.json
└── cdk.json
```

## Tagging

All resources are tagged with `observability-stack: <stack-name>`, matching the CLI installer's tagging scheme. This allows the CLI's `list` and `destroy` commands to discover CDK-deployed stacks.
