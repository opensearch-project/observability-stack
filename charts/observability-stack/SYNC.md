# Helm Chart ↔ Docker Compose Sync

This Helm chart mirrors the Docker Compose configuration for feature parity across deployment modes. This file tracks the sync state and provides an SOP for detecting and fixing drift.

## Sync Checkpoint

| Field | Value |
|-------|-------|
| **Last synced commit** | `9dd153d` |
| **Commit message** | `Upgrade data prepper to data-prepper-2.16.0-rc1 (#245)` |
| **Date** | 2026-05-19 |
| **Synced by** | @ashisagr |

## What Stays in Sync

These must be updated in the Helm chart whenever they change in Docker Compose:

- **Image versions and repos** — `opensearch`, `opensearch-dashboards`, `data-prepper`, `otel-collector` in `.env` must match `values.yaml`
- **OTel Collector config** — receivers, processors (especially transform statements), exporters, pipelines, telemetry settings
- **Data Prepper pipelines** — routing logic, processor names/params, sink config, buffer/worker/delay values
- **Prometheus** — scrape targets, intervals, labels, OTLP config, command flags
- **OpenSearch Dashboards** — all feature flags and settings in `opensearch_dashboards.template.yml`

## What Is Intentionally Different (Do NOT Sync)

| Difference | Docker Compose | Helm | Reason |
|---|---|---|---|
| Service names | Hardcoded (`data-prepper:21890`) | Templated (`{{ .Release.Name }}-data-prepper:21890`) | Helm supports multiple releases |
| Credentials | sed template placeholders | Kubernetes Secrets + Helm templates | Different secret injection models |
| Resource limits | Dev-sized (500M–2G) | Production-sized (2Gi–4Gi) | Different deployment targets |
| Prometheus cluster label | `observability-stack-dev` | `observability-stack` | Distinguishes environments |
| Health check extension | Absent | Present (`health_check` on 13133) | K8s liveness probes need it |
| node-exporter / kube-state-metrics | Absent | Present via kubernetes_sd | K8s-only metrics |
| Replicas | 1 (single container) | 3 | Production HA |
| Gateway API / Ingress / RBAC | Absent | Optional templates | K8s-only infrastructure |
| Data Prepper `peer_forwarder` | Absent | `ssl: false` | K8s multi-pod clustering |
| Prometheus port in exporter | `prometheus:9090` | `prometheus-server:80` | K8s service routing convention |

## SOP: Detecting and Fixing Drift

### For AI Agents

When asked to check or fix drift between Docker Compose and Helm:

#### Step 1: Identify what changed since last sync

```bash
# Get commits that touched Docker Compose configs since last sync
git log <SYNC_COMMIT>..HEAD --oneline -- \
  .env \
  docker-compose.yml \
  docker-compose.*.yml \
  docker-compose/otel-collector/ \
  docker-compose/data-prepper/ \
  docker-compose/prometheus/ \
  docker-compose/opensearch-dashboards/

# Discover any NEW services not yet covered by the path list above —
# every new `docker-compose/<service>/` directory and every new top-level
# service in any `docker-compose*.yml` should either be reflected in Helm
# or explicitly listed in "What Is Intentionally Different" below.
ls docker-compose/ | sort > /tmp/compose-services
yq -r '.services | keys[]' docker-compose.yml docker-compose.*.yml 2>/dev/null | sort -u > /tmp/compose-svc-keys
diff /tmp/compose-services <(grep -oE '^[a-z][a-z0-9-]+' charts/observability-stack/templates/*.yaml | sort -u) || true

# When you find a new service, add it to BOTH:
#   - the "What Stays in Sync" list (above) if it should be deployed in K8s
#   - the path list in this Step 1 command for future drift checks
```

#### Step 2: For each commit, check if the change needs Helm propagation

Read the diff for each commit. Ask:
1. Did an image version or repo change in `.env`? → Update `values.yaml` image tags/repos + `Chart.yaml` appVersion
2. Did a setting change in `docker-compose/otel-collector/config.yaml`? → Update `templates/otel-collector-configmap.yaml`
3. Did a pipeline change in `docker-compose/data-prepper/pipelines.template.yaml`? → Update `templates/data-prepper-pipeline-secret.yaml`
4. Did a Prometheus config change in `docker-compose/prometheus/prometheus.yml`? → Update the `prometheus:` section in `values.yaml`
5. Did a Dashboards setting change in `docker-compose/opensearch-dashboards/opensearch_dashboards.template.yml`? → Update the `opensearch-dashboards.config` block in `values.yaml`
6. Did a new service get added to `docker-compose.yml`? → May need a new template in `templates/`

Skip changes to: examples, docs, tests, load-testing, compat, aws, terraform — these don't affect core Helm chart.

#### Step 3: Make the corresponding Helm changes

Map Docker Compose patterns to Helm equivalents:

| Docker Compose | Helm Equivalent |
|---|---|
| `.env` variable `FOO_VERSION=x.y.z` | `values.yaml` image tag field |
| `docker-compose/otel-collector/config.yaml` | `templates/otel-collector-configmap.yaml` (inline config) |
| `docker-compose/data-prepper/pipelines.template.yaml` | `templates/data-prepper-pipeline-secret.yaml` |
| `docker-compose/prometheus/prometheus.yml` | `values.yaml` → `prometheus.serverFiles` + `prometheus.extraScrapeConfigs` |
| `docker-compose/opensearch-dashboards/opensearch_dashboards.template.yml` | `values.yaml` → `opensearch-dashboards.config.opensearch_dashboards.yml` |
| Docker Compose command flags | `values.yaml` → relevant `extraFlags` or `command` fields |
| New service in `docker-compose.yml` | New template in `templates/` or new subchart dependency |

When translating configs:
- Replace hardcoded service names with `{{ .Release.Name }}-<service-name>`
- Replace credential placeholders with Helm template expressions (`{{ .Values.opensearchUsername | quote }}`)
- Keep the "intentionally different" items as-is (see table above)

#### Step 4: Validate

```bash
# YAML syntax check
python3 -c "import yaml; yaml.safe_load(open('charts/observability-stack/values.yaml'))"

# Helm lint (if helm is available)
helm lint charts/observability-stack

# Template render check
helm template obs charts/observability-stack
```

#### Step 5: Update this file

Update the **Sync Checkpoint** table at the top of this file with:
- The new commit hash (HEAD of main after the Docker Compose changes)
- The commit message
- Today's date
- Your identifier

#### Step 6: Create PR

Title format: `fix(helm): sync Helm chart with Docker Compose (<short summary>)`

PR body should include:
- Which Docker Compose commits triggered the sync (with PR numbers)
- Summary of what changed in the Helm chart
- Verification steps performed

### Quick Drift Check Commands

```bash
# Compare image versions
grep -E 'VERSION|tag:' .env charts/observability-stack/values.yaml

# List Docker Compose changes since last sync
git log 367d855..HEAD --oneline -- .env docker-compose.yml 'docker-compose.*.yml' 'docker-compose/'

# Diff OTel Collector configs (requires helm + yq)
diff <(sed '/^#/d' docker-compose/otel-collector/config.yaml) \
     <(helm template obs charts/observability-stack | yq 'select(.kind=="ConfigMap" and .metadata.name=="otel-collector-config") | .data.relay')

# Diff Dashboards settings (requires yq)
diff docker-compose/opensearch-dashboards/opensearch_dashboards.template.yml \
     <(yq '.opensearch-dashboards.config.opensearch_dashboards\.yml' charts/observability-stack/values.yaml)
```
