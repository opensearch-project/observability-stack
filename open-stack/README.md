# open-stack CLI

Deploy the [Observability Stack](https://github.com/opensearch-project/observability-stack) on AWS managed services with a single command. Creates an OpenSearch domain, OSIS ingestion pipeline, Amazon Managed Prometheus workspace, and a fully configured OpenSearch UI with dashboards — plus an EC2 instance running demo workloads that generate telemetry out of the box.

## Quick Start

```bash
git clone git@github.com:kylehounslow/observability-stack.git
cd observability-stack && git checkout feat/aws-cli-installer
cd open-stack && npm install

node bin/open-stack.mjs --managed \
  --pipeline-name obs-stack-<your-alias> \
  --region us-east-1
```

Takes ~15 minutes. When complete, the CLI prints a dashboard URL — open it and you're in.

## What Gets Created

| Resource | Description |
|---|---|
| OpenSearch domain | Stores logs, traces, and service map data |
| OSIS pipeline | Ingests OTLP data (logs, traces, metrics) via SigV4 |
| Amazon Managed Prometheus | Stores time-series metrics |
| DQS Prometheus datasource | Connects AMP to OpenSearch for metric queries |
| OpenSearch Application | UI with workspace, index patterns, correlations, dashboards |
| IAM roles | Pipeline role (OSIS → OpenSearch + AMP) and DQS role |
| EC2 instance (t3.xlarge) | Runs OTel Demo + example agents (29 containers generating telemetry) |

All resources are tagged with `open-stack:pipeline-name` for identification and cleanup.

## Usage

**Create everything from scratch:**
```bash
node bin/open-stack.mjs --managed \
  --pipeline-name obs-stack-<your-alias> \
  --region us-east-1
```

**Reuse existing OpenSearch domain / AMP workspace:**
```bash
node bin/open-stack.mjs --managed \
  --pipeline-name obs-stack-<your-alias> \
  --region us-east-1 \
  --opensearch-endpoint https://search-your-domain-xxx.us-east-1.es.amazonaws.com \
  --prometheus-url https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-xxx/api/v1/remote_write
```

**Skip EC2 demo** (just pipeline + UI, no demo workloads):
```bash
node bin/open-stack.mjs --managed \
  --pipeline-name obs-stack-<your-alias> \
  --region us-east-1 \
  --skip-demo
```

**Interactive mode** (TUI wizard):
```bash
node bin/open-stack.mjs
```

## Destroy

```bash
node bin/open-stack.mjs destroy \
  --pipeline-name obs-stack-<your-alias> \
  --region us-east-1
```

Deletes: EC2 instance, OpenSearch Application, DQS datasource, OSIS pipeline, IAM roles. OpenSearch domain and AMP workspace are preserved (shared resources).

## Prerequisites

- Node.js 18+
- AWS credentials configured (`aws sts get-caller-identity` should succeed)
- IAM permissions: OSIS, OpenSearch, AMP, IAM role creation, EC2, SSM

## Known Limitations

- **AOS (managed domains) only** — AOSS (serverless) has blocking bugs and is not supported yet.
- **Index pattern fields need manual refresh** — After data starts flowing, go to Management → Index Patterns → select pattern → click 🔄 to pick up new fields.
- **Demo data takes 10-15 minutes** — The EC2 instance needs time to bootstrap Docker, pull images, and start sending telemetry.
- **Idempotent but not updateable** — Running twice safely no-ops, but won't update existing resources with new config.

## Development

### Repository Layout

```
open-stack/
├── bin/open-stack.mjs          # Entry point
├── src/
│   ├── main.mjs                # CLI orchestration + executePipeline flow
│   ├── cli.mjs                 # Argument parsing + config
│   ├── aws.mjs                 # AWS resource creation (IAM, OSIS, DQS, Application)
│   ├── render.mjs              # OSIS pipeline YAML generation
│   ├── opensearch-ui-init.mjs  # OpenSearch UI setup (SigV4, workspace, dashboards)
│   ├── ec2-demo.mjs            # EC2 demo workload launcher
│   ├── destroy.mjs             # Resource teardown
│   ├── interactive.mjs         # TUI wizard
│   ├── config.mjs              # Defaults
│   ├── ui.mjs                  # Terminal UI helpers (spinners, boxes, theme)
│   ├── arch-image.mjs          # Base64 architecture image for dashboard
│   └── commands/               # REPL commands (create, list, describe)
└── test/
    └── unit.test.mjs           # Unit tests (16 tests, 6 suites)
```

### Running Tests

```bash
cd open-stack
node --test test/unit.test.mjs
```

### Key Patterns

- **SigV4 signing** — `opensearch-ui-init.mjs` uses `@aws-sdk/signature-v4` with service `opensearch`. Query params must be in the `query` property of `HttpRequest`, not embedded in the path.
- **Idempotency** — Every resource creation checks for existence first. Correlations use find-before-create; saved objects with fixed IDs are upserted.
- **EC2 demo** — User data script installs Docker + Compose, clones the repo, writes a managed-mode collector config, and starts workload services via `docker-compose.managed.yml`.
