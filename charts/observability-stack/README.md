# OpenSearch Observability Stack Helm Chart

Umbrella Helm chart that deploys the full OpenSearch observability stack to Kubernetes. Wraps community subcharts (OpenSearch, Prometheus, OTel Collector, Data Prepper) with opinionated defaults and adds self-monitoring dashboards. Enables key observability features like APM and Agent-Tracing by default. 

## Components

| Subchart | Source | Purpose |
|----------|--------|---------|
| `opensearch` | opensearch-project/helm-charts | Log and trace storage |
| `opensearch-dashboards` | opensearch-project/helm-charts | Web UI |
| `data-prepper` | opensearch-project/helm-charts | OTLP → OpenSearch pipeline |
| `opentelemetry-collector` | open-telemetry/helm-charts | Telemetry receiver and router |
| `prometheus` | prometheus-community/helm-charts | Metrics storage (OTLP + scrape) |

Additional templates (not subcharts):
- `opensearch-exporter` — Bridges OpenSearch cluster metrics to Prometheus (OpenSearch has no native Prometheus endpoint)
- `init-dashboards-job` — Post-install hook that creates index patterns, dashboards, saved queries
- `opensearch-credentials-secret` — Shared credentials secret for all components
- `data-prepper-pipeline-secret` — Pipeline config with credentials injected at template time
- `otel-collector-configmap` — Collector config with dynamic service names

## Install

```bash
helm install obs charts/observability-stack
```

For local development (kind) with reduced resources:
```bash
helm install obs charts/observability-stack \
  --set opensearch.singleNode=true \
  --set opensearch.replicas=1 \
  --set opensearch.resources.requests.memory=1Gi \
  --set opensearch.resources.limits.memory=1Gi \
  --set opensearch.opensearchJavaOpts="-Xms512m -Xmx512m" \
  --set opensearch.persistence.size=2Gi
```

## Credential Management

All components read credentials from a single `opensearch-credentials` Kubernetes Secret, sourced from `opensearchUsername` and `opensearchPassword` in `values.yaml`:

| Component | How it reads credentials |
|---|---|
| OpenSearch | `secretKeyRef` → `OPENSEARCH_INITIAL_ADMIN_PASSWORD` |
| OpenSearch Dashboards | `opensearchAccount.secret` (native sub-chart feature) |
| Data Prepper | Pipeline config rendered as Secret template |
| Init Job | `secretKeyRef` → `OPENSEARCH_USER` / `OPENSEARCH_PASSWORD` |

Set a custom password at install time:
```bash
helm install obs charts/observability-stack --set opensearchPassword="YourSecurePassword!"
```

> **Note:** The password is set at first boot. `OPENSEARCH_INITIAL_ADMIN_PASSWORD` only takes effect when OpenSearch initializes its security index. To change the password after install, use the [Security REST API](https://docs.opensearch.org/latest/security/access-control/api/#create-user) or `security-admin.sh`, then update the Secret.

## Kubernetes RBAC Access (kubectl / helm)

By default, `aws eks update-kubeconfig` gives operators full cluster-admin access. The chart provides optional scoped ServiceAccounts so operators can choose between **readonly** access for safe monitoring and **admin** access for explicit write operations. This prevents accidental modifications when you only intend to observe.

> **Note:** This controls Kubernetes API access (kubectl, helm). It is unrelated to OpenSearch user authentication — see [Credential Management](#credential-management) for OpenSearch credentials.

**Enable:**
```yaml
rbac:
  enabled: true
```

This creates two Kubernetes ServiceAccounts with long-lived tokens:

| Account | ClusterRole | Purpose |
|---|---|---|
| `<release>-admin` | `cluster-admin` | Full K8s cluster access — deployments, scaling, deletes |
| `<release>-readonly` | `view` | Read-only — get, list, watch across all namespaces |

**Generate a scoped kubeconfig:**
```bash
NS=observability-stack
RELEASE=obs-stack

# Extract the token (admin or readonly)
TOKEN=$(kubectl get secret ${RELEASE}-observability-stack-readonly-token -n $NS \
  -o jsonpath='{.data.token}' | base64 -d)

# Get cluster info from current kubeconfig
SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
CA=$(kubectl config view --minify --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')

# Write a standalone kubeconfig
kubectl config set-cluster obs --server="$SERVER" \
  --certificate-authority=<(echo "$CA" | base64 -d) --embed-certs \
  --kubeconfig=~/.kube/obs-stack-readonly.yaml
kubectl config set-credentials readonly --token="$TOKEN" \
  --kubeconfig=~/.kube/obs-stack-readonly.yaml
kubectl config set-context obs-readonly --cluster=obs --user=readonly \
  --kubeconfig=~/.kube/obs-stack-readonly.yaml
kubectl config use-context obs-readonly --kubeconfig=~/.kube/obs-stack-readonly.yaml
```

**Use the scoped kubeconfig:**
```bash
# Safe monitoring — cannot modify any resources
KUBECONFIG=~/.kube/obs-stack-readonly.yaml kubectl get pods -n observability-stack

# Explicit admin operations — use the admin kubeconfig only when needed
KUBECONFIG=~/.kube/obs-stack-admin.yaml kubectl rollout restart deployment ...
```

The readonly account is recommended as the default for day-to-day monitoring. Switch to the admin kubeconfig only when you need to make changes.

## Dynamic Service Names

The OTel Collector config and Data Prepper pipeline config are rendered as parent-chart templates using `{{ .Release.Name }}`. This means the chart works with any release name — service hostnames are resolved automatically.

## Exposing Dashboards (Gateway API)

The chart includes optional [Gateway API](https://gateway-api.sigs.k8s.io/) resources for exposing OpenSearch Dashboards with TLS. Disabled by default.

Supported providers:
- **Envoy Gateway** — for local dev or self-managed clusters
- **AWS Gateway API Controller** — for EKS with VPC Lattice

```bash
helm install obs . \
  --set gateway.enabled=true \
  --set gateway.host=dashboards.example.com \
  --set gateway.tls.secretName=dashboards-tls
```

See [docs/local-tls.md](docs/local-tls.md) for a full local development walkthrough with mkcert and Envoy Gateway. See `values.yaml` for all gateway options including AWS provider configuration.

## Upgrading

The init job (dashboard/index pattern setup) runs as a post-install/post-upgrade hook. It installs pip packages and takes 3-5 minutes, which often exceeds helm's default timeout.

**Recommended upgrade workflow:**
```bash
# 1. Deploy chart changes (skip hooks to avoid timeout)
helm upgrade obs-stack . -n observability-stack --no-hooks

# 2. If dashboard or init script changed, trigger the job manually:
kubectl delete job obs-stack-observability-stack-init-dashboards -n observability-stack 2>/dev/null
helm get hooks obs-stack -n observability-stack | kubectl apply -n observability-stack -f -
kubectl wait --for=condition=complete job/obs-stack-observability-stack-init-dashboards -n observability-stack --timeout=10m
kubectl logs -n observability-stack job/obs-stack-observability-stack-init-dashboards --tail=30
```

If only `values.yaml` scrape configs changed (no dashboard changes), step 2 is not needed — but you may need to restart Prometheus to pick up the new configmap:
```bash
kubectl rollout restart deployment obs-stack-prometheus-server -n observability-stack
```

## Self-Monitoring Dashboards

Three dashboards are auto-created by the init job from YAML config files in `files/`:

| Dashboard | Panels | File |
|-----------|--------|------|
| Kubernetes Cluster Health | 8 | `files/dashboard-k8s-cluster-health.yaml` |
| Observability Pipeline Health | 24 | `files/dashboard-pipeline-health.yaml` |
| OpenSearch Cluster Health | 10 | `files/dashboard-opensearch-health.yaml` |

**Adding a new dashboard:**
1. Create `files/dashboard-my-thing.yaml` (see existing files for format)
2. Add it to `templates/init-dashboards-configmap.yaml`
3. Add one line to `main()` in `files/init-opensearch-dashboards.py`:
   ```python
   create_promql_dashboard_from_yaml(workspace_id, "/config/dashboard-my-thing.yaml")
   ```

**Dashboard YAML format:**
```yaml
dashboard:
  id: my-dashboard-id
  title: My Dashboard
  description: What this monitors

panels:
  - id: panel-unique-id
    title: "Panel Title"
    query: "rate(some_metric_total[5m])"
    chartType: line
```

**Syncing with docker-compose:** The docker-compose init script and dashboard YAMLs (`docker-compose/opensearch-dashboards/`) are the source of truth. The helm versions in `files/` should be kept in sync. The only helm-specific addition is the K8s Cluster Health dashboard (not applicable to docker-compose) and the `BASE_URL` env var override in the init script (line 11).

## Prometheus Scrape Targets

Configured via `extraScrapeConfigs` in `values.yaml`, which is passed through `tpl` so `{{ .Release.Name }}` resolves dynamically. Default K8s scrape jobs are disabled (saves ~60k series). Active targets:

| Job | Target | Interval |
|-----|--------|----------|
| `prometheus` | localhost:9090 | 60s |
| `otel-collector` | `<release>`-opentelemetry-collector:8888 | 10s |
| `opensearch` | `<release>`-observability-stack-opensearch-exporter:9114 | 30s |
| `data-prepper` | `<release>`-data-prepper:4900 | 30s |
| `node-exporter` | auto-discovered via kubernetes_sd | 60s |
| `kube-state-metrics` | auto-discovered via kubernetes_sd | 60s |

## Sizing Guide

The default values deploy a 3-node OpenSearch cluster suitable for small production workloads. For local development, override to single-node (see [Install](#install)). For enterprise-scale deployments, adjust the following knobs.

### OpenSearch Cluster

| Knob | Default | Production Guidance |
|------|---------|---------------------|
| `opensearch.replicas` | `3` | 3+ data nodes minimum for HA |
| `opensearch.singleNode` | `false` | Set `true` only for local dev (kind) |
| `opensearch.resources.requests.memory` | `2Gi` | 8–64Gi per node (JVM gets 50%) |
| `opensearch.persistence.size` | `8Gi` | Size per formula below |
| `opensearch.extraEnvs[OPENSEARCH_JAVA_OPTS]` | `-Xms1g -Xmx1g` | 50% of node RAM, max 31g |

**Storage formula:**
```
storage_per_node = (daily_ingest_GB × 1.45 × (replicas + 1) × retention_days) / node_count
```
The 1.45x multiplier accounts for indexing overhead (10%), OS reserved space for merges (20%), filesystem overhead (5%), and node failure buffer (10%).

**Shard sizing:**
- Logs/traces (write-heavy): 30–50 GB per primary shard
- Search (latency-sensitive): 10–30 GB per primary shard
- Total shards should be a multiple of data node count
- Max 25 shards per GB of JVM heap

Shard count is configurable per Data Prepper pipeline sink via `number_of_shards` and `number_of_replicas` (commented out in `values.yaml`).

### Data Prepper Pipeline Tuning

| Knob | Default | Description |
|------|---------|-------------|
| `data-prepper.pipelineConfig.config.otel-logs-pipeline.workers` | `5` | Parallel log processing threads |
| `...opensearch.number_of_shards` | (OS default: 1) | Primary shards per index |
| `...opensearch.number_of_replicas` | (OS default: 1) | Replica shards per primary |
| `...opensearch.bulk_size` | `5` (MiB) | Bulk request size to OpenSearch |

### OTel Collector

| Knob | Default | Description |
|------|---------|-------------|
| `opentelemetry-collector.resources.requests.cpu` | `256m` | CPU request |
| `opentelemetry-collector.resources.requests.memory` | `512Mi` | Memory request |
| `opentelemetry-collector.resources.limits.cpu` | `1` | CPU limit |
| `opentelemetry-collector.resources.limits.memory` | `2Gi` | Memory limit |

The collector's `memory_limiter` processor (80% limit, 25% spike) provides backpressure before the OOM kill threshold.

### Prometheus

| Knob | Default | Description |
|------|---------|-------------|
| `prometheus.server.retention` | `15d` | How long metrics are kept |
| `prometheus.server.persistentVolume.enabled` | `false` | Enable for production |
| `prometheus.server.persistentVolume.size` | `8Gi` | Disk for metrics TSDB |

### Quick Reference: Sizing Profiles

| Profile | OS Nodes | OS Memory | OS Disk | OTel Collector Memory | Prometheus Retention |
|---------|----------|-----------|---------|----------------------|---------------------|
| **Dev/Demo** (default) | 3 | 2Gi | 8Gi | 2Gi | 15d |
| **Small team** (~10 GB/day) | 3 | 8Gi | 100Gi | 2Gi | 30d |
| **Enterprise** (~100 GB/day) | 6+ | 32Gi | 500Gi+ | 4Gi+ | 90d |

Sources: [OpenSearch shard sizing](https://opensearch.org/blog/optimize-opensearch-index-shard-size/), [AWS sizing guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/opensearch-service-migration/sizing.html), [AWS shard best practices](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/bp-sharding.html)

### Further reading

For advanced cluster topologies (dedicated cluster manager nodes, coordinating nodes, hot-warm-cold architecture):

- [Tuning your cluster](https://opensearch.org/docs/latest/tuning-your-cluster/) — official guide covering node roles, dedicated nodes, shard allocation, and production recommendations
- [Setup multi-node cluster on Kubernetes using Helm](https://opensearch.org/blog/setup-multinode-cluster-kubernetes/) — walkthrough for dedicated cluster manager, data, and coordinating nodes with the official Helm chart
- [Sizing domains](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/sizing-domains.html) — AWS sizing calculator and methodology (applicable to self-managed clusters)

## Key Values

See `values.yaml` for all options. Notable settings:

```yaml
# Credentials (update opensearchPassword before any real deployment)
opensearchUsername: "admin"
opensearchPassword: "My_password_123!@#"

# Data Prepper metrics port (must be in ports list for Prometheus to scrape)
data-prepper:
  ports:
    - name: metrics
      port: 4900

# Disable noisy K8s scrape defaults
prometheus:
  extraScrapeConfigs: |
    # Dynamic targets using {{ .Release.Name }} — see values.yaml
```

## OpenTelemetry Demo (Optional)

The [OpenTelemetry Demo](https://opentelemetry.io/docs/demo/) is available as an optional subchart. It deploys a full microservices e-commerce app (20+ services) that generates realistic telemetry — useful for load testing and showcasing the stack.

Disabled by default (~2GB additional memory required).

**Enable:**
```bash
helm upgrade obs-stack . -n observability-stack \
  --set opentelemetry-demo.enabled=true --no-hooks
```

**Disable:**
```bash
helm upgrade obs-stack . -n observability-stack --no-hooks
```

All bundled backends (Jaeger, Grafana, Prometheus, OpenSearch) in the demo chart are disabled — demo services send telemetry to our OTel Collector. No duplicate infrastructure.
