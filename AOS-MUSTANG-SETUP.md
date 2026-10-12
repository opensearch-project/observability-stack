# Observability stack → Mustang (local node or AWS managed domain)

Run this observability stack (OTel demo + collector + Data Prepper) with **Data Prepper writing
logs, spans and the service map to Mustang**: composite indices, parquet primary + lucene
secondary. Indices use the standard Data Prepper names with ISM rollover and aliases
(`otel-v1-apm-span`, `logs-otel-v1`, `otel-v2-apm-service-map`).

Pick one target:

| | **A. Local Mustang node** | **B. AWS managed domain** |
|---|---|---|
| Data goes to | a dev-tree node on `127.0.0.1:9200` | an Amazon OpenSearch Service domain on the Mustang engine |
| RED metrics go to | the bundled Cortex | **Amazon Managed Prometheus (AMP)**, endpoint required |
| UI | bundled OpenSearch Dashboards (`http://localhost:5601`) | OpenSearch UI application |
| You provide | the running node | domain endpoint, FGAC user/password, **AMP remote-write endpoint**, region, AWS credentials |
| Follow | [Common setup](#common-setup-both-targets) → [Option A](#option-a--local-mustang-node) | [Common setup](#common-setup-both-targets) → [Option B](#option-b--aws-managed-domain) |

```
A:  OTel demo ─► otel-collector ─► Data Prepper ─┬─► local Mustang node (via mustang-bridge-fwd.py)
                                                 └─► Cortex (bundled)
    OpenSearch Dashboards (bundled) ── data source ──► local Mustang node (PPL)

B:  OTel demo ─► otel-collector ─► Data Prepper ─┬─► AOS domain on Mustang (FGAC basic auth)
                                                 └─► AMP (remote write, SigV4)
    OpenSearch UI app ── data source ──► AOS domain (PPL);  APM metrics ◄── AMP
```

---

## Common setup (both targets)

**1. Docker + Compose v2.24+** (the fixes file uses `!override`), and the base stack installed
so `.env` and the images exist:

```bash
./install.sh --simulate     # checks only
./install.sh                # writes .env, pulls images, starts the stock stack (aos-mustang-up.sh re-applies it)
```

**2. A Data Prepper opensearch sink with `component_templates`.**
- **Where it is:** opensearch-project/data-prepper#7161, merged to `main` as `3637e8228`. It isn't
  in a release yet.
- **Why you need to build it:** the stack's image (`sgguruda62324/opensearch-data-prepper:2.16.0-SNAPSHOT-rc1`)
  predates it.
- **What to do:** build the sink jar from `main`. The compose override mounts it over the image's sink.

```bash
cd ../data-prepper && git checkout 20b00a76c      # main as of 2026-10-08, smoke-tested in the 2.16 rc1 image
JAVA_HOME=<jdk 17/21> ./gradlew :data-prepper-plugins:opensearch:jar -x test
ls data-prepper-plugins/opensearch/build/libs/data-prepper-opensearch-2.17.0-SNAPSHOT.jar
cd -
```

`aos-mustang-up.sh` finds the jar in `../data-prepper` automatically. Set
`DP_OPENSEARCH_SINK_JAR=<path>` if it lives elsewhere.

<details><summary>Alternative: a full Data Prepper image from <code>main</code> (no jar swap)</summary>

1. In `../data-prepper`, run `./gradlew :release:docker:docker`. It builds `opensearch-data-prepper:2.17.0-SNAPSHOT`.
2. `docker tag opensearch-data-prepper:2.17.0-SNAPSHOT local/opensearch-data-prepper:2.17.0-SNAPSHOT`
3. Set `DATA_PREPPER_DOCKER_REPO=local` and `DATA_PREPPER_VERSION=2.17.0-SNAPSHOT` in `.env`.
4. In `docker-compose.aos-mustang.yml`, remove the jar volume and add `pull_policy: missing`
   under `data-prepper`, because the base file uses `pull_policy: always`.

Why bother: the default jar runs on the image's 2.16 core. Its client libraries match the
image's (opensearch-java 2.20.0, the REST clients, Jackson 2.21.0). Only the AWS SDK differs
(2.53 vs 2.39), and it's only used for SigV4. If you build a newer `main`, re-check this, or
use the full image.
</details>

---

## Option A — local Mustang node

### A1. Start the Mustang node

Use a dev-tree node on `127.0.0.1:9200` with the sandbox (pluggable data format) plugins and
the SQL plugin (PPL). See `reference/opensearch-dev/server-run.md` in the dev hub for details.

```bash
cd <OpenSearch dev tree>
JAVA_HOME=/usr/lib/jvm/java-25-amazon-corretto ./gradlew run -Dsandbox.enabled=true --preserve-data \
  -PinstalledPlugins="['arrow-base', 'arrow-flight-rpc', 'analytics-engine', 'composite-engine', 'parquet-data-format', 'analytics-backend-datafusion', 'analytics-backend-lucene', 'opensearch-job-scheduler', 'opensearch-sql-plugin']" \
  -Dtests.jvm.argline="-Djava.library.path=$(pwd)/sandbox/libs/dataformat-native/rust/target/debug -Dopensearch.experimental.feature.pluggable.dataformat.enabled=true -Dopensearch.experimental.feature.transport.stream.enabled=true" \
  -x javadoc -x test -x missingJavadoc
```

- **`--preserve-data`:** without it, every start wipes the node's data dir.
- **ISM:** rollover needs the index-management plugin. Without it, Data Prepper skips ISM, so
  there's no rollover. That's fine for dev.

### A2. Make the node reachable from the containers

The node binds `127.0.0.1` only. Start the forwarder and keep it running (tmux or nohup):

```bash
python3 mustang-bridge-fwd.py "$(ip -4 -o addr show docker0 | awk '{print $4}' | cut -d/ -f1)"
```

Alternative: start the node with `-Dtests.opensearch.http.host=127.0.0.1,<docker0-gateway>`.

### A3. Start the stack

No settings file is needed; the defaults point at the local node.

```bash
./aos-mustang-up.sh
```

The script:
1. checks the node and the forwarder
2. creates the `composite-index` component template on the node
3. starts the stack with the OTel demo

On first start, Data Prepper creates on the node:
- the 3 index templates (`composed_of: ["composite-index"]`)
- ISM policies, if the plugin is installed
- the aliases, each with its `-000001` index

<details><summary>Optional overrides (<code>~/.aos-mustang.env</code>)</summary>

```bash
MUSTANG_URL=http://127.0.0.1:9200                  # node as seen from this host
MUSTANG_ENDPOINT=http://host.docker.internal:9200  # node as seen from the containers
MUSTANG_USER=admin                                 # only if the node runs the security plugin
MUSTANG_PASSWORD=...
DP_OPENSEARCH_SINK_JAR=/path/to/data-prepper-opensearch-<ver>-SNAPSHOT.jar
```
</details>

### A4. Verify

```bash
curl -s 'localhost:9200/_cat/indices/otel-*,logs-*?v&s=index'      # docs.count climbing
curl -s 'localhost:9200/_cat/aliases/otel-*,logs-*?v'
curl -s 'localhost:9200/otel-v1-apm-span-*/_settings/index.pluggable*,index.composite*?flat_settings=true'   # composite
curl -s localhost:9200/_plugins/_ppl -H 'content-type: application/json' \
  -d '{"query":"source=otel-v1-apm-span | stats count() by serviceName"}'
docker logs data-prepper --since 5m 2>&1 | grep -cE 'ERROR|Document failed'   # expect ~0
```

Demo shop and load generator: `http://localhost:8080`.

### A5. Dashboards: add the node as a data source + datasets

The OSD init only creates `local_cluster` (the bundled Lucene node). Run this once per fresh stack:

```bash
PW=$(grep -E '^OPENSEARCH_PASSWORD=' .env | cut -d= -f2- | tr -d "'\"")
OSD(){ docker exec -i opensearch-dashboards curl -s -u "admin:$PW" -H 'osd-xsrf:true' -H 'content-type:application/json' "$@"; }
WS=$(OSD -XPOST localhost:5601/api/workspaces/_list -d '{}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["workspaces"][0]["id"])')
OSD -XPOST localhost:5601/api/saved_objects/data-source/mustang-local -d \
  '{"attributes":{"title":"mustang-local","endpoint":"http://host.docker.internal:9200","auth":{"type":"no_auth"},"dataSourceEngineType":"OpenSearch","dataSourceVersion":"3.9.0"}}'
OSD -XPOST localhost:5601/api/workspaces/_associate -d "{\"workspaceId\":\"$WS\",\"savedObjects\":[{\"type\":\"data-source\",\"id\":\"mustang-local\"}]}"

for row in "mustang-spans otel-v1-apm-span* endTime traces" "mustang-logs logs-otel-v1* time logs" "mustang-svcmap otel-v2-apm-service-map* timestamp -"; do
  set -- $row; SIG=$([ "$4" = - ] || echo ",\"signalType\":\"$4\"")
  OSD -XPOST "localhost:5601/w/$WS/api/saved_objects/index-pattern/$1?overwrite=true" -d \
    "{\"attributes\":{\"title\":\"$2\",\"timeFieldName\":\"$3\"$SIG},\"references\":[{\"id\":\"mustang-local\",\"type\":\"data-source\",\"name\":\"dataSource\"}]}" >/dev/null
  OSD -XPOST localhost:5601/api/workspaces/_associate -d "{\"workspaceId\":\"$WS\",\"savedObjects\":[{\"type\":\"index-pattern\",\"id\":\"$1\"}]}" >/dev/null
  echo "$1 -> $2"
done
```

Open `http://localhost:5601` (`admin` / `OPENSEARCH_PASSWORD` from `.env`) and pick the
`mustang-*` datasets in Explore.
- **Make fields searchable:** if the Traces UI doesn't show the trace-detail link or the ms
  duration, run the `searchable: true` fix from `MUSTANG-SETUP.md` Step 4b (branch
  `mustang-local-datasource`).
- **APM (Services, Application map):** configure it from those pages using `mustang-spans`,
  `mustang-svcmap` and a Prometheus connection to the bundled Cortex.

---

## Option B — AWS managed domain

### B1. What you need

| Input | Setting | Example | Where to find it |
|---|---|---|---|
| Domain endpoint | `MUSTANG_URL`, `MUSTANG_ENDPOINT` | `https://search-mydomain-abc123.us-east-1.es.amazonaws.com:443` | OpenSearch Service console → domain → **Domain endpoint** (add `:443`) |
| FGAC user | `MUSTANG_USER` | `admin` | the domain's fine-grained access control master user, or an internal user with write access |
| FGAC password | `MUSTANG_PASSWORD` | | must not contain a single quote (`'`) |
| **Prometheus endpoint (AMP remote write)** | `AMP_REMOTE_WRITE_URL` | `https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-xxxxxxxx-…/api/v1/remote_write` | Amazon Managed Service for Prometheus console → workspace → **Endpoint – remote write URL** |
| Region | `AWS_REGION` | `us-east-1` | the AMP workspace's region |
| AWS credentials | `AWS_PROFILE` (or exported `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`) | | an identity with `aps:RemoteWrite` on the workspace |

The domain must also:
- run the **Mustang engine** (new indices composite by default, or via the component template the script creates)
- allow **basic auth from this host** through its access policy, with FGAC as the gate. SigV4-only (IAM) access isn't supported by these sinks.

### B2. Write the settings file

```bash
cat > ~/.aos-mustang.env <<'EOF'
MUSTANG_URL=https://search-<domain>-<id>.<region>.es.amazonaws.com:443
MUSTANG_ENDPOINT=https://search-<domain>-<id>.<region>.es.amazonaws.com:443
MUSTANG_USER=<fgac user>
MUSTANG_PASSWORD=<fgac password>
AMP_REMOTE_WRITE_URL=https://aps-workspaces.<region>.amazonaws.com/workspaces/ws-<id>/api/v1/remote_write
AWS_REGION=<region>
AWS_PROFILE=<profile with aps:RemoteWrite>
EOF
chmod 600 ~/.aos-mustang.env
```

- **Set `AWS_REGION` here:** an `AWS_REGION` in your shell would otherwise win.
- **Isengard instead of a profile:** leave out `AWS_PROFILE` and export the credentials before
  running, for example from
  `ada credentials print --account <acct> --role <role> --provider isengard`.

### B3. Start the stack

```bash
./aos-mustang-up.sh
```

The script:
1. checks the domain with your FGAC credentials
2. requires `AMP_REMOTE_WRITE_URL` and AWS credentials
3. creates the `composite-index` component template on the domain (harmless if the domain already defaults to composite)
4. starts the stack with the OTel demo

It skips the forwarder check (that's for local nodes only).

**Refresh credentials:** AWS session credentials expire after a few hours. When
`docker logs data-prepper` shows `PrometheusHttpSender … 403`, re-export them (or refresh the
profile), then run:

```bash
./aos-mustang-up.sh up -d --force-recreate --no-deps data-prepper
```

### B4. Verify

```bash
. ~/.aos-mustang.env; A=(-s -u "$MUSTANG_USER:$MUSTANG_PASSWORD")
curl "${A[@]}" "$MUSTANG_URL/_cat/indices/otel-*,logs-*?v&s=index"        # docs.count climbing
curl "${A[@]}" "$MUSTANG_URL/_cat/aliases/otel-*,logs-*?v"
curl "${A[@]}" "$MUSTANG_URL/_plugins/_ppl" -H 'content-type: application/json' \
  -d '{"query":"source=otel-v1-apm-span | stats count() by serviceName"}'
docker logs data-prepper --since 5m 2>&1 | grep -cE 'ERROR|Document failed|PrometheusHttpSender.*403'   # expect ~0
```

### B5. OpenSearch UI application

In an OpenSearch UI app with a workspace for the observability use case:

1. **Data source:** add the domain, engine type **AnalyticEngine**.
2. **Datasets** on that data source:

   | Dataset | Time field | Signal type |
   |---|---|---|
   | `logs-otel-v1*` | `time` | logs |
   | `otel-v1-apm-span*` | `endTime` | traces |
   | `otel-v2-apm-service-map*` | `timestamp` | |

3. **Prometheus connection:** add the **same AMP workspace** you used for `AMP_REMOTE_WRITE_URL`.
4. **Correlations:** a trace-to-logs correlation (spans → logs), and the APM config:
   - traces dataset
   - service-map dataset
   - the AMP connection
   - window 60s

   The Services and Application map pages prompt for the APM config if it's missing.

---

## Recommended (both targets): pin the field types that conflict across rollovers

The demo sends some fields with different JSON types depending on the service. Envoy sends
`http.status_code` as `"200"`, other services send `200`. Python sends a feature-flag value as
`"false"`, .NET sends `false`. Each rolled-over index takes its type from the first document it
sees, so after a rollover the indices can disagree.

PPL over `otel-v1-apm-span*` then fails with `Internal error`, which breaks the Traces histogram,
trace details, the Agent Traces KPIs and Services → View spans. The failing
`stats … by span(…)` histogram also **leaks native memory** (~200 MB–1 GB per run). Eventually
every PPL query returns 429 until the node restarts.

To prevent this, add explicit mappings to the span `template_content` in
`docker-compose/data-prepper/pipelines.aos-mustang.template.yaml`, and bump `"version":2` to `3`.
Data Prepper only updates the template when the version is higher.

```json
"properties": {
  "attributes": {"properties": {"http": {"properties": {
    "status_code": {"type": "long"},
    "request":  {"properties": {"body": {"properties": {"size": {"type": "long"}}}}},
    "response": {"properties": {"body": {"properties": {"size": {"type": "long"}}}}}}}}},
  "events": {"type": "object", "properties": {
    "attributes": {"type": "object", "properties": {"feature_flag": {"properties": {"result": {"properties": {
      "value": {"type": "keyword", "ignore_above": 256, "multi_value": true}}}}}}},
    "…keep the existing events.name / time / droppedAttributesCount entries": {}}}
}
```

Then run `./aos-mustang-up.sh up -d --force-recreate --no-deps data-prepper`. It applies from the next rollover.

## Tear down (both targets)

```bash
./aos-mustang-up.sh down --remove-orphans          # add -v to drop local volumes
```

The data in Mustang stays: on the node unless you restart it without `--preserve-data`, and in
the domain. To remove it, review and then delete:
- the indices `otel-v1-apm-span-*`, `logs-otel-v1-*`, `otel-v2-apm-service-map-*`
- the 3 index templates, then `_component_template/composite-index`
- the ISM policies

AMP has no delete; samples age out with retention.

## Gotchas

**Both targets**
- **Composite indices don't support everything:** no `_count`, no `_search`, and no automatic
  refresh. Use `_cat/indices` for counts and PPL for reads.
- **Append-only:** the span sink needs `action: create`. Data Prepper writes spans with
  `_id = spanId`, and `index` with a custom id is rejected.
- **Data Prepper heap:** the default (256 MB with a 1G limit) GC-thrashes on the collector
  backlog. The override sets `-Xmx2g` and a 3G limit.
- **No retention:** Data Prepper's ISM policies only roll over. The stack's init script, which
  adds the delete state (`ISM_RETENTION_DAYS`), only targets the bundled OpenSearch, so Mustang
  indices accumulate.
- **Tables may show partial rows.** The UI sends `fetch_size`, and with it some multi-index span
  queries return only part of the matching rows instead of failing (a Mustang bug under
  investigation).
- **Keep these files in the repo, not `/tmp`.** A host reboot wipes `/tmp`. Docker then
  re-creates missing bind-mount sources as empty directories, and `data-prepper` and
  `frontend-proxy` exit (127) on restart.
- **Cloud Desktop host fixes** (`docker-compose.local-env-fixes.yml`): bundled OpenSearch on
  9201, alertmanager gossip off, envoy getaddrinfo resolver, flagd-ui/llm memory. See the
  comments at the top of the file.

**Option A (local node)**
- **Keep the forwarder alive** (A2), or Data Prepper loses the node.
- **After restarting the node,** run `./aos-mustang-up.sh up -d --force-recreate --no-deps data-prepper`.
  - It re-creates the component template if the data dir was wiped.
  - Data Prepper only installs its templates at startup, so without the recreate it would
    write non-composite indices.

**Option B (managed domain)**
- **No Prometheus endpoint, no APM metrics:** without `AMP_REMOTE_WRITE_URL`, the OpenSearch UI's
  APM latency and error charts stay empty. The script refuses to start a managed target without it.
- **Expired AWS credentials** show up as `PrometheusHttpSender … 403`. Refresh them (B3).

---

## Reference

**Files this setup adds**

```
aos-mustang-up.sh                                                   # preflight + component template + compose
docker-compose.aos-mustang.yml                                      # data-prepper: target, creds, metrics sink, sink jar, heap
docker-compose/data-prepper/pipelines.aos-mustang.template.yaml     # the pipeline (placeholders filled at container start)
docker-compose/data-prepper/composite-index-component-template.json # composite settings for Data Prepper's indices
mustang-bridge-fwd.py                                               # Option A: docker0 gateway:9200 -> 127.0.0.1:9200
docker-compose.local-env-fixes.yml                                  # Cloud Desktop host fixes
docker-compose/frontend-proxy/envoy.tmpl.yaml                       # envoy resolver fix used by the fixes file
AOS-MUSTANG-SETUP.md                                                # this file
```

**How the pipeline differs from `pipelines.template.yaml`**

| Change | Why |
|---|---|
| Sinks → `MUSTANG_ENDPOINT` (default `http://host.docker.internal:9200`) | Local node through the forwarder, or the domain endpoint |
| `template_type: index-template` + `component_templates: ["composite-index"]` on all 3 sinks | A dev-tree node defaults to plain Lucene. The component template makes only Data Prepper's indices composite; changing the cluster default would also convert system indices. |
| Span sink `action: create` | Composite indices are append-only |
| Span sink `template_content` (events/links as `object` + `multi_value: true`) | Spans with more than one event were rejected (`Field [events.name] cannot accept multiple values`) |
| Metrics sink → AMP (SigV4) when `AMP_REMOTE_WRITE_URL` is set, else the bundled Cortex | Filled in at container start, since a pipeline can't branch on its own |

**How this differs from `MUSTANG-SETUP.md`** (branch `mustang-local-datasource`)

| | MUSTANG-SETUP.md | this setup |
|---|---|---|
| Writes | dual-write: Mustang `otel-*-plain` + bundled Lucene | Mustang only |
| Indices | custom `*-plain`, no rollover | Data Prepper standard names, aliases, ISM rollover |
| Composite settings | custom index templates | `composite-index` component template on Data Prepper's built-in templates |
| Targets | local node | local node or AWS managed domain |

**Status:** built from two setups that ran:
- **Local node, 2026-09-25:** component template, `action: create`, a Data Prepper sink built from source.
- **AOS domain `test-observability-pudyodu`, 2026-09-29 to 2026-10-08:** FGAC basic auth, AMP, and the span-template fix.

These exact files have not been run end to end yet.
