# Observability stack against Mustang: local node or managed domain (AOS-style indices)

Run this observability stack (OTel demo + collector + Data Prepper) with **Data Prepper
writing logs, spans and the service map to Mustang** (composite indices: parquet primary +
lucene secondary). The target is either:

- **a locally running Mustang node** (the default, Steps 1–5), or
- **a managed Amazon OpenSearch Service domain on the Mustang engine** (see
  [Managed domain instead of a local node](#managed-domain-instead-of-a-local-node)).

The index layout is the one an AOS Mustang domain gets: the standard DP index names, ISM
rollover and aliases. **RED metrics** go to the bundled Cortex, or to Amazon Managed Prometheus
when `AMP_REMOTE_WRITE_URL` is set. For a local node, the UI is the bundled OpenSearch
Dashboards with the node as a data source (PPL). For a domain, it's an OpenSearch UI app.

```
local:    OTel demo ─► otel-collector ─► Data Prepper ─┬─► Mustang node (127.0.0.1:9200, via mustang-bridge-fwd.py)
                                                       └─► Cortex (bundled)
          OpenSearch Dashboards (bundled) ── data source ──► Mustang node (PPL)

managed:  OTel demo ─► otel-collector ─► Data Prepper ─┬─► AOS domain on Mustang (FGAC basic auth)
                                                       └─► AMP (SigV4) or Cortex (bundled)
          OpenSearch UI app ── data source ──► AOS domain (PPL)
```

How it differs from `MUSTANG-SETUP.md` (branch `mustang-local-datasource`):

| | MUSTANG-SETUP.md | this setup |
|---|---|---|
| Writes | dual-write: Mustang `otel-*-plain` + bundled Lucene | Mustang only |
| Index names / lifecycle | custom `*-plain` indices, no rollover | DP standard: `otel-v1-apm-span`, `logs-otel-v1`, `otel-v2-apm-service-map` aliases, `-00000N` indices, ISM rollover |
| Composite settings from | custom index templates DP installs | `composite-index` component template layered onto DP's built-in templates |
| UI reads | Lucene by default | Mustang (PPL) |

> Status: built from two setups that ran. Against a local node on 2026-09-25: the component
> template, `action: create`, a DP opensearch sink built from source. Against the AOS domain
> `test-observability-pudyodu` from 2026-09-29 to 2026-10-08: FGAC basic auth, AMP, and the
> span-template fix. These exact files have not been run end to end yet.

## What this setup adds

```
docker-compose.aos-mustang.yml                              # data-prepper -> Mustang node; DP sink jar; heap; OSD host alias
docker-compose/data-prepper/pipelines.aos-mustang.template.yaml   # the DP pipeline (placeholders filled at start)
docker-compose/data-prepper/composite-index-component-template.json  # composite settings for DP's indices
aos-mustang-up.sh                                           # preflight + component template + compose
mustang-bridge-fwd.py                                       # docker0 gateway:9200 -> 127.0.0.1:9200 (from mustang-local-datasource)
docker-compose.local-env-fixes.yml                          # Cloud Desktop host fixes (from mustang-local-datasource)
docker-compose/frontend-proxy/envoy.tmpl.yaml               # envoy resolver fix used by the fixes file
AOS-MUSTANG-SETUP.md                                        # this file
```

How the pipeline differs from `docker-compose/data-prepper/pipelines.template.yaml`:

| Change | Why |
|---|---|
| Sinks → `MUSTANG_ENDPOINT` (default `http://host.docker.internal:9200`) | The node on the host, through the forwarder; or a domain endpoint |
| `template_type: index-template` + `component_templates: ["composite-index"]` on all 3 sinks | A dev-tree node creates plain Lucene indices by default (`cluster.pluggable.dataformat.enabled=false`). The component template makes only DP's indices composite. Changing the cluster default instead would also make system indices (ISM, job scheduler, …) composite. |
| Span sink `action: create` | Composite indices are append-only. DP writes spans with `_id = spanId`, and `index` with a custom id is rejected (`index.append_only.enabled`). |
| Span sink `template_content` (events/links as `object` + `multi_value: true`) | Spans with more than one event were rejected (`Field [events.name] cannot accept multiple values`), about 30% of spans |
| Metrics sink → bundled Cortex, or AMP (`aws.region`, SigV4) when `AMP_REMOTE_WRITE_URL` is set | Filled in at container start, since a pipeline can't branch on its own |

## Prerequisites

**1. A Mustang dev-tree node on `127.0.0.1:9200`**, with the sandbox (pluggable data
format) plugins and the SQL plugin (PPL). See `reference/opensearch-dev/server-run.md` in the
dev hub for the full command:

```bash
JAVA_HOME=/usr/lib/jvm/java-25-amazon-corretto ./gradlew run -Dsandbox.enabled=true --preserve-data \
  -PinstalledPlugins="['arrow-base', 'arrow-flight-rpc', 'analytics-engine', 'composite-engine', 'parquet-data-format', 'analytics-backend-datafusion', 'analytics-backend-lucene', 'opensearch-job-scheduler', 'opensearch-sql-plugin']" \
  -Dtests.jvm.argline="-Djava.library.path=$(pwd)/sandbox/libs/dataformat-native/rust/target/debug -Dopensearch.experimental.feature.pluggable.dataformat.enabled=true -Dopensearch.experimental.feature.transport.stream.enabled=true" \
  -x javadoc -x test -x missingJavadoc
```

- `--preserve-data`: without it, `./gradlew run` wipes the data dir on every start.
- ISM rollover needs the index-management plugin on the node. Without it, DP skips the ISM
  policy (no rollover). That's fine for dev, and it also avoids the rollover type mismatch (Step 5).

**2. Data Prepper with `component_templates` in the opensearch sink**
(opensearch-project/data-prepper#7161, merged to `main` on 2026-09-28 as `3637e8228`; not in a
release yet, `main` is `2.17.0-SNAPSHOT`). The stack's image
(`sgguruda62324/opensearch-data-prepper:2.16.0-SNAPSHOT-rc1`, built 2026-05-12) predates it.

Default: build the sink jar from `main`. The compose override mounts it over the image's sink.

```bash
cd ../data-prepper && git checkout 20b00a76c      # main as of 2026-10-08, smoke-tested in the 2.16 rc1 image
JAVA_HOME=<jdk 17/21> ./gradlew :data-prepper-plugins:opensearch:jar -x test
ls data-prepper-plugins/opensearch/build/libs/data-prepper-opensearch-2.17.0-SNAPSHOT.jar
```

`aos-mustang-up.sh` picks it up from `../data-prepper`, or from `DP_OPENSEARCH_SINK_JAR`.

The jar runs on the image's 2.16 core. Its client libraries match the image's (opensearch-java
2.20.0, rest clients, Jackson 2.21.0); only the AWS SDK differs (2.53 vs 2.39), and that is only
used for SigV4 to AWS. If you build a newer `main`, re-check, or use the full-image alternative below.

Alternative, a full image from `main` (no jar swap):
1. Run `./gradlew :release:docker:docker`. It builds `opensearch-data-prepper:2.17.0-SNAPSHOT`.
2. Tag it as `local/opensearch-data-prepper:2.17.0-SNAPSHOT`.
3. Set `DATA_PREPPER_DOCKER_REPO=local` and `DATA_PREPPER_VERSION=2.17.0-SNAPSHOT`.
4. Drop the jar volume from `docker-compose.aos-mustang.yml`.
5. Add `pull_policy: missing`, because the base compose file uses `pull_policy: always`.

**3. Docker + Compose v2.24+** (the fixes file uses `!override`), and the base stack
installed so `.env` and the images exist:

```bash
./install.sh --simulate     # checks only
./install.sh                # writes .env, pulls images, starts the stock stack (Step 2 re-applies)
```

## Step 1 — make the node reachable from the containers

The dev-tree node binds `127.0.0.1` only. The compose override maps `host.docker.internal`
to the docker0 gateway, and the forwarder listens there:

```bash
python3 mustang-bridge-fwd.py "$(ip -4 -o addr show docker0 | awk '{print $4}' | cut -d/ -f1)"
# forwards <docker0-gateway>:9200 -> 127.0.0.1:9200 ; keep it running (tmux / nohup)
```

Alternative, without the forwarder: start the node with
`-Dtests.opensearch.http.host=127.0.0.1,<docker0-gateway>`.

## Step 2 — bring up the stack

```bash
./aos-mustang-up.sh
```

The script:
1. checks the node (host) and the forwarder (gateway)
2. **PUTs the `composite-index` component template**, which must exist before DP starts
3. runs `docker compose -f docker-compose.yml -f docker-compose.local-env-fixes.yml -f docker-compose.aos-mustang.yml up -d` with the OTel demo

On first start DP creates on the node:
- the 3 index templates (`composed_of: ["composite-index"]`)
- ISM policies, if the plugin is installed
- the aliases with their `-000001` indices

Optional `~/.aos-mustang.env`, only when the defaults don't fit:

```bash
MUSTANG_URL=http://127.0.0.1:9200                  # node as seen from this host
MUSTANG_ENDPOINT=http://host.docker.internal:9200  # node as seen from the containers
MUSTANG_USER=admin  MUSTANG_PASSWORD=...           # only if the node runs the security plugin
DP_OPENSEARCH_SINK_JAR=/path/to/data-prepper-opensearch-<ver>-SNAPSHOT.jar
```

## Step 3 — verify

```bash
curl -s 'localhost:9200/_cat/indices/otel-*,logs-*?v&s=index'                     # docs.count climbing
curl -s 'localhost:9200/_cat/aliases/otel-*,logs-*?v'
curl -s 'localhost:9200/otel-v1-apm-span-*/_settings/index.pluggable*,index.composite*?flat_settings=true'   # composite
curl -s localhost:9200/_plugins/_ppl -H 'content-type: application/json' \
  -d '{"query":"source=otel-v1-apm-span | stats count() by serviceName"}'
docker logs data-prepper --since 5m 2>&1 | grep -cE 'ERROR|Document failed'          # expect ~0
# UI: http://localhost:5601 (admin / OPENSEARCH_PASSWORD from .env)    demo + loadgen: http://localhost:8080
```

Composite indices don't support `_count` or `_search`, and don't refresh automatically. Use
`_cat/indices` for counts, PPL for reads, and `_refresh` when you need fresh counts.

## Step 4 — OpenSearch Dashboards: Mustang data source + datasets

The OSD init only creates `local_cluster` (the bundled Lucene node). Register the Mustang node
and its datasets once per fresh stack. This is adapted from `MUSTANG-SETUP.md` Steps 4/4b,
with this setup's index names:

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

- **Make fields searchable:** if the Traces UI doesn't render the trace-detail link or the
  ms-formatted duration, run `MUSTANG-SETUP.md`'s Step 4b `searchable: true` fix on each dataset.
- **APM:** for the Services and Application map pages, configure APM from those pages using
  `mustang-spans`, `mustang-svcmap` and a Prometheus connection to the bundled Cortex.

## Step 5 (recommended) — pin the field types that conflict across rollovers

The demo sends some fields with different JSON types depending on the service. Envoy sends
`http.status_code` as `"200"`, other services send `200`. Python sends a feature-flag value
as `"false"`, .NET sends `false`. Each rolled-over index takes its type from the first
document it sees, so after a rollover the indices can disagree.

PPL over `otel-v1-apm-span*` then fails with `Internal error`, which breaks the Traces
histogram, trace details, the Agent Traces KPIs and Services → View spans. The failing
`stats … by span(…)` histogram also **leaks native memory** (~200 MB–1 GB per run).
Eventually every PPL query returns 429 until the node restarts. That memory is freed when the
node process exits.

To prevent this, add explicit mappings to the span `template_content` in
`pipelines.aos-mustang.template.yaml`, and bump `"version":2` to `3`. DP only updates the
template when the version is higher.

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

## Managed domain instead of a local node

The same files write to an Amazon OpenSearch Service domain on the Mustang engine.

**Prerequisites:**
- **Mustang engine:** a domain running Mustang.
- **Basic auth:** an FGAC internal user (basic auth), and a domain access policy that lets
  requests from this host reach FGAC. SigV4-only (IAM) access isn't supported by these sinks.
- **AMP (optional):** an AMP workspace in the region, and AWS credentials with `aps:RemoteWrite`.
- **Data Prepper:** the sink jar from Prerequisite 2. Prerequisite 1 (a local node) and Step 1
  (the forwarder) don't apply.

**Settings** (`~/.aos-mustang.env`, `chmod 600`):

```bash
MUSTANG_URL=https://search-<domain>-<id>.<region>.es.amazonaws.com:443        # host-side checks + component template
MUSTANG_ENDPOINT=https://search-<domain>-<id>.<region>.es.amazonaws.com:443   # what Data Prepper writes to
MUSTANG_USER=<fgac user>
MUSTANG_PASSWORD=<fgac password>          # no single quote (') - it's put inside '…' in the YAML
# metrics -> AMP instead of the bundled Cortex (optional)
AMP_REMOTE_WRITE_URL=https://aps-workspaces.<region>.amazonaws.com/workspaces/ws-<id>/api/v1/remote_write
AWS_REGION=<region>                        # set it here; a different AWS_REGION in your shell would win otherwise
AWS_PROFILE=<profile with aps:RemoteWrite> # or export AWS_ACCESS_KEY_ID/… before running
```

Then run `./aos-mustang-up.sh` as in Step 2. With a non-local `MUSTANG_ENDPOINT`, the script
skips the forwarder check. It still PUTs the `composite-index` component template on the
domain; that's harmless when the domain already defaults to composite.

With Isengard, export the credentials yourself, for example from
`ada credentials print --account <acct> --role <role> --provider isengard`. Session
credentials expire after a few hours. When Data Prepper logs `PrometheusHttpSender … 403`,
refresh them with `./aos-mustang-up.sh up -d --force-recreate --no-deps data-prepper`.

**Verify** as in Step 3, but use the domain endpoint with `-u "$MUSTANG_USER:$MUSTANG_PASSWORD"`.

**UI:** an OpenSearch UI app with the domain as a data source (engine type
**AnalyticEngine**), with the same three datasets as Step 4:
- `logs-otel-v1*` with time field `time`, signal type logs
- `otel-v1-apm-span*` with time field `endTime`, signal type traces
- `otel-v2-apm-service-map*` with time field `timestamp`

Add a trace-to-logs correlation. The APM config should use the AMP workspace as its Prometheus
connection.

## Tear down

```bash
./aos-mustang-up.sh down --remove-orphans          # add -v to drop local volumes
```

Node data stays unless you restart it without `--preserve-data`. To remove it by hand,
review and then delete:
- the indices `otel-v1-apm-span-*`, `logs-otel-v1-*`, `otel-v2-apm-service-map-*`
- the 3 index templates, then `_component_template/composite-index`
- the ISM policies

## Gotchas

- **Keep the forwarder alive** (Step 1), or DP loses the node.
- **After restarting the node, re-run `./aos-mustang-up.sh up -d --force-recreate --no-deps data-prepper`.**
  - If the data dir was wiped, the component template is gone. The script re-creates it.
  - DP only installs its templates at startup, so without the recreate it would write template-less (non-composite) indices.
- **Keep these files in the repo, not `/tmp`.** A host reboot wipes `/tmp`. Docker then
  re-creates missing bind-mount sources as empty directories, and `data-prepper` and
  `frontend-proxy` exit (127) on restart.
- **Append-only:** without `action: create`, every span is rejected. Logs and the service
  map don't set ids, so they're fine.
- **DP heap:** the default (256 MB with a 1G limit) GC-thrashes on the collector backlog.
  The override sets `-Xmx2g` and a 3G limit.
- **No retention:** DP's ISM policies only roll over. The stack's init script, which adds
  the delete state (`ISM_RETENTION_DAYS`), only targets the bundled OpenSearch, so Mustang
  indices accumulate.
- **Tables may show partial rows.** The UI sends `fetch_size`, and with it some multi-index
  span queries return only part of the matching rows instead of failing (a Mustang bug under
  investigation).
- **Cloud Desktop host fixes** (`docker-compose.local-env-fixes.yml`): bundled OpenSearch on
  9201 (the Mustang node owns 9200), alertmanager gossip off, envoy getaddrinfo resolver,
  flagd-ui/llm memory. See the comments at the top of the file.
