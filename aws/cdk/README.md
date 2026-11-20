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
cdk deploy -c stackName=mystack
```

This deploys one CloudFormation stack, `ObsStack-mystack`, with the OpenSearch domain, AMP workspace, DQS data source, FGAC mapping, OSIS pipeline, OpenSearch Application, UI init and demo workload. A deploy takes about 25 minutes, most of it the domain.

`stackName` is required: 3 to 17 characters, lowercase letters, digits and hyphens, starting with a letter. It also names the resources derived from it (pipeline, collection, application, Prometheus workspace alias), so stacks with different names can share an account and Region.

The stack is listed on the Observability stack page of the Amazon OpenSearch Service console, with its provisioning steps, components and endpoints. Deleting it there opens the CloudFormation console for the same stack.

After deployment, the `WorkspaceUrl` output is a link you can open directly in your browser.

## Configuration

Every choice is a CloudFormation parameter of the stack, with the same name as in the console's template. A `-c` value sets the parameter's default:

| Context (`-c`) | Parameter | Default | Backend |
|---|---|---|---|
| `stackName` (required) | `StackDisplayName` | | both |
| `adminRoleArns` | `AdminRoleArns` | empty | both |
| `enableDemo` | `DeployDemoWorkload` | `true` | both |
| `osInstanceType` | `DomainInstanceType` | `r7g.large.search` | managed |
| `osInstanceCount` | `DomainInstanceCount` | `1` | managed |
| `osVolumeSize` | `DomainVolumeGB` | `100` | managed |
| `aossMinOcu` | `CollectionMinOCU` | `0` | serverless |
| `aossMaxOcu` | `CollectionMaxOCU` | `16` | serverless |
| `minOcu` | `MinOCU` | `1` | both |
| `maxOcu` | `MaxOCU` | `4` | both |
| `metricsRetentionDays` | `MetricsRetentionDays` | `150` | both |
| | `LatestAl2023Ami` | SSM path of the latest Amazon Linux 2023 AMI | both |

`cdk deploy --parameters <Name>=<value>` overrides a parameter for one deploy.

The [demo workload](#demo-workload) is deployed by default. To skip it:

```bash
cdk deploy -c stackName=mystack -c enableDemo=false
```

### Dashboards access

The stack maps the OSIS pipeline role and the UI init role to the FGAC `all_access` and `security_manager` roles, and makes the UI init role an OpenSearch UI application admin. To open Dashboards with your own IAM role, pass its ARN (comma-separate multiple roles). Each role is mapped in FGAC (managed domains) and added as an application admin:

```bash
cdk deploy -c stackName=mystack -c adminRoleArns=arn:aws:iam::123456789012:role/Admin
```

`cdk synth` warns when `adminRoleArns` is empty.

On a managed domain, evaluation result indices (`otel-v1-genai-evaluation-*`) are deleted after 7 days. Change it with `-c evaluationRetentionDays=<days>`; `0` keeps them.

Each role in `adminRoleArns` also needs data-plane permissions in its own IAM policy: `es:ESHttp*` on the domain (managed) or `aoss:APIAccessAll` on the collection (serverless). The domain access policy and the serverless data access policy admit the role, but don't grant those IAM actions.

On serverless, the collection's data access policy lists the OSIS pipeline role, the UI init role and `adminRoleArns`. Removing a role from `adminRoleArns` and redeploying removes its FGAC mappings, application admin entry and data access.

On managed domains, the FGAC master user is an IAM role the stack creates (`FgacAdminRole`), and the domain access policy admits signed requests from the deploying account. Sign requests with SigV4; HTTP basic authentication isn't accepted.

The FGAC role mappings, application admins and serverless data access policy are set to the roles above on every deploy. Explicit FGAC mappings you added yourself are kept; application admins are replaced by the list.

### OpenSearch Serverless

To store data in an OpenSearch Serverless time series collection instead of a managed domain:

```bash
cdk deploy -c stackName=mystack -c opensearchType=serverless
```

This creates a NextGen collection group (`<collection>-cg`, standby replicas enabled) and a `TIMESERIES` collection in it. The pipeline's index templates set `index.timestamp_field` to each signal's own time field (`time` for logs, `endTime` for spans, `timestamp` for the service map), which time series collections require on every document.

The group's indexing and search capacity defaults to 0 to 16 OCU. The demo workloads settle at about 2 and 2. With a minimum of 0 the group scales to zero when idle, and the first queries after an idle period take longer while search capacity comes back. To change the limits:

```bash
cdk deploy -c stackName=mystack -c opensearchType=serverless -c aossMinOcu=1 -c aossMaxOcu=8
```

### Upgrading from the two-stack layout

Earlier versions deployed two stacks, `ObsInfra` and `ObservabilityStack`. They can't be updated in place to `ObsStack-<name>`. Destroy them with the version that created them (`cdk destroy --all`), then deploy with `-c stackName=<name>`.

### Console templates

```bash
npm run export-templates -- --version <git tag>
```

writes `dist/templates/observability-stack-domain.json` and `observability-stack-serverless.json`, the templates the Amazon OpenSearch Service console deploys. Each is this stack with the Lambda bundles inlined, so it needs no CDK bootstrap or asset bucket. `--version` is the tag the demo instance clones and the template's `TemplateVersion`; it defaults to the current commit, which only works for a deploy if it's also a branch or tag name.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ ObsStack-<name>                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  OpenSearch  │  │     AMP      │  │  DQS Data Source       │ │
│  │   Domain     │  │  Workspace   │  │  (Prometheus → OS)     │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ OSIS Pipeline│  │  OpenSearch  │  │  FGAC Role Mapping     │ │
│  │ (OTLP ingest)│  │  Application │  │                        │ │
│  └──────────────┘  └──────┬───────┘  └────────────────────────┘ │
│                           │                                     │
│                    ┌──────┴───────┐  ┌────────────────────────┐ │
│                    │   UI Init    │  │  EC2 Demo (optional)   │ │
│                    │  (dashboards)│  │  OTel Demo workloads   │ │
│                    └──────────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Stack Outputs

After deployment, retrieve outputs with:

```bash
aws cloudformation describe-stacks --stack-name ObsStack-mystack \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table
```

| Output | Description |
|--------|-------------|
| `WorkspaceUrl` | Direct link to the Observability Stack workspace |
| `WorkspaceId` | OpenSearch UI workspace ID |
| `OSISEndpoint` | OTLP endpoint; point your OTel Collector here |
| `OSISPipelineArn` | Pipeline ARN, for `osis:Ingest` permissions |
| `AppEndpoint` | OpenSearch Application root URL |
| `AppId` | OpenSearch Application ID |
| `DomainEndpoint` / `AOSSEndpoint` | OpenSearch domain or collection endpoint |
| `DomainArn` / `CollectionArn` | OpenSearch domain or collection ARN |
| `AMPEndpoint` | Amazon Managed Prometheus workspace endpoint |
| `AmpWorkspaceArn` | Amazon Managed Prometheus workspace ARN |
| `DirectQueryRoleArn` | Role the DQS data source uses to query AMP |
| `PrometheusDataSourceArn` | DQS Prometheus data source ARN |
| `DemoInstanceId` | EC2 instance ID (when the demo workload is enabled) |
| `ObsStackGeneration` | Template generation (`V2`), read by the console |

The stack also keeps the output names from the two-stack layout: `DashboardUrl`, `OsisIngestEndpoint`, `OpenSearchAppEndpoint`, `OpenSearchEndpoint` and `PrometheusWorkspaceId`.

## Sending Telemetry

Configure your OpenTelemetry Collector to export to the OSIS endpoint using SigV4 authentication:

```yaml
extensions:
  sigv4auth:
    region: us-west-2
    service: osis

exporters:
  otlphttp/logs:
    logs_endpoint: ${OSIS_ENDPOINT}/obs-stack-obsstack-mystack/v1/logs
    auth: { authenticator: sigv4auth }
    compression: none
  otlphttp/traces:
    traces_endpoint: ${OSIS_ENDPOINT}/obs-stack-obsstack-mystack/v1/traces
    auth: { authenticator: sigv4auth }
    compression: none
  otlphttp/metrics:
    metrics_endpoint: ${OSIS_ENDPOINT}/obs-stack-obsstack-mystack/v1/metrics
    auth: { authenticator: sigv4auth }
    compression: none
```

The IAM principal sending data needs `osis:Ingest` permission on the pipeline ARN.

## Demo Workload

Unless you deploy with `-c enableDemo=false`, an EC2 instance launches running the [OpenTelemetry Demo](https://opentelemetry.io/docs/demo/) — a full e-commerce microservices app (~20 services) that generates realistic traces, logs, and metrics. Data flows through the OTel Collector → OSIS pipeline → OpenSearch + AMP.

The instance also runs the example agents and the [agent eval canary](../../docker-compose/agent-eval-canary/README.md), which reads agent spans from the domain or collection with the instance role and sends evaluation results through the pipeline, so Agent Traces shows evaluations. The stack grants the instance role read access: read-only, and only on the span and evaluation indices (`otel-v1-apm-span*`, `otel-v1-genai-evaluation*`): `aoss:APIAccessAll` plus a data access policy with `aoss:DescribeIndex` and `aoss:ReadDocument` on serverless, or `es:ESHttpGet`/`es:ESHttpPost` on those index paths plus the `readall` FGAC role on a managed domain.

## Useful Commands

```bash
# Deploy or update
cdk deploy -c stackName=mystack

# View diff before deploying
cdk diff -c stackName=mystack

# Destroy everything
cdk destroy -c stackName=mystack

# Unit tests (pipeline names, console contract, Agent Evaluations UI setup)
npm test
```

## Project Structure

```
aws/cdk/
├── bin/app.ts                          # Entry point — stack instantiation and config
├── lib/
│   ├── observability-stack.ts          # The ObsStack-<name> stack: FGAC, OSIS pipeline, Application, UI init, outputs
│   ├── infra-stack.ts                  # OpenSearch domain or collection, AMP, DQS data source
│   ├── opensearch.ts                   # Domain + secret + pipeline role construct
│   ├── prometheus.ts                   # AMP workspace + DQS data source construct
│   ├── ingestion-pipeline.ts           # OSIS pipeline construct
│   ├── opensearch-app.ts              # OpenSearch Application + UI init construct
│   └── demo-workload.ts               # EC2 instance with OTel Demo
├── custom-resources/
│   ├── fgac-mapping/index.ts           # FGAC Security API role mapping
│   ├── dqs-datasource/index.ts         # DQS Prometheus data source
│   └── ui-init/                        # Workspace, index patterns, Agent Evaluations config, dashboards
│       ├── index.ts
│       └── arch-image.mjs              # Architecture diagram (base64 PNG)
├── package.json
├── tsconfig.json
└── cdk.json
```

## Tagging

The stack and all resources that support tags are tagged with:

| Tag | Value |
|-----|-------|
| `observability-stack` | The CloudFormation stack name, matching the CLI installer's scheme so its `list` and `destroy` commands find CDK stacks |
| `opensearch:observability-stack` | `stackName` |
| `opensearch:observability-stack-source` | `cdk` |
| `opensearch:observability-stack-version` | The `observabilityStackVersion` context value, when set |
| `opensearch:obs-stack-generation` | `v2` |
| `opensearch:obs-backend` | `aos-domain` or `aossv2` |

The console doesn't depend on the tags: it finds the stack by its `ObsStack-` name and reads the generation and backend from the end of the stack Description.
