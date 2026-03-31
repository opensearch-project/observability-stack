/**
 * Neo (OpenSearch Application) initialization module.
 * Creates workspace, index patterns, correlations, saved queries, and dashboards
 * using SigV4-signed requests to the Neo saved objects API.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { printStep, printSuccess, printWarning, printInfo, createSpinner } from './ui.mjs';

// ── SigV4 HTTP helper ─────────────────────────────────────────────────────────

async function neoRequest(method, url, body, region) {
  const bodyBytes = body ? JSON.stringify(body) : '{}';
  const bodyHash = createHash('sha256').update(bodyBytes).digest('hex');
  const parsed = new URL(url);

  const request = new HttpRequest({
    method,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : undefined,
    path: parsed.pathname + parsed.search,
    headers: {
      host: parsed.hostname,
      'Content-Type': 'application/json',
      'osd-xsrf': 'osd-fetch',
      'x-amz-content-sha256': bodyHash,
    },
    body: bodyBytes,
  });

  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region,
    service: 'opensearch',
    sha256: Sha256,
  });

  const signed = await signer.sign(request);
  const resp = await fetch(url, {
    method,
    headers: signed.headers,
    body: method !== 'GET' ? bodyBytes : undefined,
  });

  const text = await resp.text();
  try { return { status: resp.status, data: JSON.parse(text) }; }
  catch { return { status: resp.status, data: text }; }
}

async function neoGet(base, path, region) {
  return neoRequest('GET', `${base}${path}`, null, region);
}

async function neoPost(base, path, body, region) {
  return neoRequest('POST', `${base}${path}`, body, region);
}

async function neoDelete(base, path, region) {
  return neoRequest('DELETE', `${base}${path}`, null, region);
}

// ── Init sequence ─────────────────────────────────────────────────────────────

export async function initNeo(cfg) {
  const base = cfg.appEndpoint || cfg.dashboardsUrl;
  if (!base) {
    printWarning('No OpenSearch Application endpoint — skipping Neo init');
    return;
  }
  const region = cfg.region;

  printStep('Initializing OpenSearch UI...');
  console.error();

  // a. Wait for ready
  const spinner = createSpinner('Waiting for OpenSearch UI...');
  spinner.start();
  const maxWait = 120_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const r = await neoGet(base, '/api/status', region);
      if (r.status === 200) { spinner.succeed('OpenSearch UI is ready'); break; }
    } catch { /* keep polling */ }
    await new Promise((res) => setTimeout(res, 5000));
  }

  // b. Find auto-created data-source
  const dsResp = await neoGet(base, '/api/saved_objects/_find?type=data-source&per_page=10', region);
  const dsId = dsResp.data?.saved_objects?.[0]?.id;
  if (dsId) printSuccess(`Data source: ${dsResp.data.saved_objects[0].attributes?.title} (${dsId})`);
  else printWarning('No data source found');

  // c. Find auto-created data-connection (Prometheus)
  const dcResp = await neoGet(base, '/api/saved_objects/_find?type=data-connection&per_page=10', region);
  const dcId = dcResp.data?.saved_objects?.[0]?.id;
  if (dcId) printSuccess(`Data connection: ${dcResp.data.saved_objects[0].attributes?.connectionId} (${dcId})`);

  // d. Create workspace
  let wsId;
  const wsListResp = await neoPost(base, '/api/workspaces/_list', {}, region);
  const existing = (wsListResp.data?.result?.workspaces || []).find((w) => w.name === 'Observability Stack');
  if (existing) {
    wsId = existing.id;
    printSuccess(`Workspace already exists: ${wsId}`);
  } else {
    const wsResp = await neoPost(base, '/api/workspaces', {
      attributes: {
        name: 'Observability Stack',
        description: 'AI Agent observability workspace with logs, traces, and metrics',
        features: ['use-case-observability'],
      },
    }, region);
    wsId = wsResp.data?.result?.id;
    if (wsId) printSuccess(`Workspace created: ${wsId}`);
    else { printWarning(`Workspace creation failed: ${JSON.stringify(wsResp.data)}`); return; }
  }

  // e. Associate data-source + data-connection with workspace
  if (dsId) {
    await neoPost(base, '/api/workspaces/_associate', {
      workspaceId: wsId,
      savedObjects: [{ type: 'data-source', id: dsId }],
    }, region);
  }
  if (dcId) {
    await neoPost(base, '/api/workspaces/_associate', {
      workspaceId: wsId,
      savedObjects: [{ type: 'data-connection', id: dcId }],
    }, region);
  }
  printSuccess('Data sources associated with workspace');

  // f. Create index patterns with dataSource reference
  const svcMapPattern = cfg.serverless ? 'otel-v2-apm-service-map*' : 'otel-v1-apm-service-map*';
  const logsSchema = '{"otelLogs":{"timestamp":"time","traceId":"traceId","spanId":"spanId","serviceName":"resource.attributes.service.name"}}';

  const patterns = [
    { title: 'logs-otel-v1*', timeFieldName: 'time', signalType: 'logs', schemaMappings: logsSchema },
    { title: 'otel-v1-apm-span*', timeFieldName: 'endTime', signalType: 'traces' },
    { title: svcMapPattern, timeFieldName: 'timestamp' },
  ];

  const patternIds = {};
  for (const p of patterns) {
    // Check if exists
    const findResp = await neoGet(base,
      `/w/${wsId}/api/saved_objects/_find?type=index-pattern&search_fields=title&search=${encodeURIComponent(p.title)}`, region);
    const existingPat = (findResp.data?.saved_objects || []).find((o) => o.attributes?.title === p.title);
    if (existingPat) {
      patternIds[p.title] = existingPat.id;
      printSuccess(`Index pattern exists: ${p.title}`);
      continue;
    }
    const resp = await neoPost(base, `/w/${wsId}/api/saved_objects/index-pattern`, {
      attributes: p,
      references: dsId ? [{ id: dsId, name: 'dataSource', type: 'data-source' }] : [],
    }, region);
    patternIds[p.title] = resp.data?.id;
    printSuccess(`Index pattern created: ${p.title}`);
  }

  const logsId = patternIds['logs-otel-v1*'];
  const tracesId = patternIds['otel-v1-apm-span*'];
  const svcMapId = patternIds[svcMapPattern];

  // g. Set default index pattern
  await neoPost(base, `/w/${wsId}/api/opensearch-dashboards/settings`, {
    changes: { defaultIndex: logsId },
  }, region);
  printSuccess('Default index pattern set to logs');

  // h. Trace-to-logs correlation
  if (tracesId && logsId) {
    await neoPost(base, `/w/${wsId}/api/saved_objects/correlations`, {
      attributes: {
        correlationType: 'trace-to-logs-otel-v1-apm-span*',
        title: 'trace-to-logs_otel-v1-apm-span*',
        version: '1.0.0',
        entities: [
          { tracesDataset: { id: 'references[0].id' } },
          { logsDataset: { id: 'references[1].id' } },
        ],
      },
      references: [
        { name: 'entities[0].index', type: 'index-pattern', id: tracesId },
        { name: 'entities[1].index', type: 'index-pattern', id: logsId },
      ],
    }, region);
    printSuccess('Trace-to-logs correlation created');
  }

  // i. APM config correlation
  if (tracesId && svcMapId && dcId) {
    await neoPost(base, `/w/${wsId}/api/saved_objects/correlations`, {
      attributes: {
        correlationType: `APM-Config-${wsId}`,
        title: 'apm-config',
        version: '1.0.0',
        entities: [
          { tracesDataset: { id: 'references[0].id' } },
          { serviceMapDataset: { id: 'references[1].id' } },
          { prometheusDataSource: { id: 'references[2].id' } },
        ],
      },
      references: [
        { name: 'entities[0].index', type: 'index-pattern', id: tracesId },
        { name: 'entities[1].index', type: 'index-pattern', id: svcMapId },
        { name: 'entities[2].dataConnection', type: 'data-connection', id: dcId },
      ],
    }, region);
    printSuccess('APM config correlation created');
  }

  // j. Saved queries
  const queries = [
    { id: 'error-logs', title: 'Error Logs', query: 'source = logs-otel-v1* | where severityNumber >= 17 | sort - time | head 100' },
    { id: 'agent-invocations', title: 'Agent Invocations', query: 'source = otel-v1-apm-span* | where attributes.gen_ai.operation.name = "invoke_agent" | sort - endTime | head 50' },
    { id: 'tool-executions', title: 'Tool Executions', query: 'source = otel-v1-apm-span* | where attributes.gen_ai.operation.name = "execute_tool" | sort - endTime | head 50' },
    { id: 'slow-spans', title: 'Slow Spans (>5s)', query: 'source = otel-v1-apm-span* | where durationInNanos > 5000000000 | sort - durationInNanos | head 50' },
    { id: 'token-usage', title: 'Token Usage by Model', query: 'source = otel-v1-apm-span* | where isnotnull(attributes.gen_ai.usage.input_tokens) | stats sum(attributes.gen_ai.usage.input_tokens) as input_tokens, sum(attributes.gen_ai.usage.output_tokens) as output_tokens by attributes.gen_ai.request.model' },
  ];
  for (const q of queries) {
    await neoPost(base, `/w/${wsId}/api/saved_objects/query/${q.id}`, {
      attributes: { title: q.title, description: q.title, query: { query: q.query, language: 'PPL' } },
    }, region);
  }
  printSuccess(`${queries.length} saved queries created`);

  // k. Agent Observability dashboard
  if (tracesId) {
    await createAgentDashboard(base, wsId, tracesId, region);
  }

  // l. Overview dashboard
  await createOverviewDashboard(base, wsId, region);

  // m. Set default dashboard
  await neoPost(base, `/w/${wsId}/api/opensearch-dashboards/settings`, {
    changes: { 'observability:defaultDashboard': 'observability-overview-dashboard' },
  }, region);

  console.error();
  printSuccess(`OpenSearch UI initialized`);
  printInfo(`URL: ${base}/w/${wsId}/app/dashboards#/view/observability-overview-dashboard`);
  cfg.dashboardsUrl = `${base}/w/${wsId}/app/home`;
}

// ── Agent Observability Dashboard ─────────────────────────────────────────────

async function createAgentDashboard(base, wsId, tracesId, region) {
  const vizs = [
    { id: 'llm-requests-by-model', title: 'LLM Requests by Model', type: 'pie', field: 'attributes.gen_ai.request.model' },
    { id: 'tool-usage-stats', title: 'Tool Usage Statistics', type: 'pie', field: 'attributes.gen_ai.tool.name' },
    { id: 'token-usage-by-agent', title: 'Token Usage by Agent', type: 'horizontal_bar', field: 'attributes.gen_ai.agent.name', metric: 'attributes.gen_ai.usage.input_tokens' },
    { id: 'token-usage-by-model', title: 'Token Usage by Model', type: 'horizontal_bar', field: 'attributes.gen_ai.request.model', metric: 'attributes.gen_ai.usage.input_tokens' },
    { id: 'agent-ops-by-service', title: 'Agent Operations by Service', type: 'horizontal_bar', field: 'serviceName', split: 'attributes.gen_ai.operation.name' },
  ];

  const vizIds = [];
  for (const v of vizs) {
    const aggs = [
      v.metric
        ? { id: '1', type: 'sum', schema: 'metric', params: { field: v.metric } }
        : { id: '1', type: 'count', schema: 'metric' },
      { id: '2', type: 'terms', schema: 'segment', params: { field: v.field, size: 10 } },
    ];
    if (v.split) aggs.push({ id: '3', type: 'terms', schema: 'group', params: { field: v.split, size: 5 } });

    await neoPost(base, `/w/${wsId}/api/saved_objects/visualization/${v.id}`, {
      attributes: {
        title: v.title,
        visState: JSON.stringify({ title: v.title, type: v.type, params: { type: v.type, addTooltip: true, addLegend: true }, aggs }),
        uiStateJSON: '{}',
        kibanaSavedObjectMeta: {
          searchSourceJSON: JSON.stringify({ indexRefName: 'kibanaSavedObjectMeta.searchSourceJSON.index', query: { query: '', language: 'kuery' }, filter: [] }),
        },
      },
      references: [{ name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern', id: tracesId }],
    }, region);
    vizIds.push(v.id);
  }

  const panels = vizIds.map((id, i) => ({
    version: '3.6.0',
    gridData: { x: (i % 2) * 24, y: Math.floor(i / 2) * 15, w: 24, h: 15, i: String(i) },
    panelIndex: String(i), embeddableConfig: {}, panelRefName: `panel_${i}`,
  }));
  const refs = vizIds.map((id, i) => ({ name: `panel_${i}`, type: 'visualization', id }));

  await neoPost(base, `/w/${wsId}/api/saved_objects/dashboard/agent-observability-dashboard`, {
    attributes: {
      title: 'Agent Observability',
      description: 'Overview of AI agent performance, token usage, and tool execution',
      panelsJSON: JSON.stringify(panels),
      optionsJSON: JSON.stringify({ useMargins: true, hidePanelTitles: false }),
      timeRestore: false,
      kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }) },
    },
    references: refs,
  }, region);
  printSuccess('Agent Observability dashboard created');
}

// ── Overview Dashboard ────────────────────────────────────────────────────────

async function createOverviewDashboard(base, wsId, region) {
  const w = `/w/${wsId}`;
  const md = `## Welcome to OpenSearch Observability Stack!

Your entire stack, fully visible. APM traces, logs, Prometheus metrics, service maps, and AI agent tracing — unified in one open-source platform.

[Observability Stack Website](https://observability.opensearch.org) | [GitHub](https://github.com/opensearch-project/observability-stack)

---

### Explore telemetry

**Logs** — [Explore logs](${w}/app/explore/logs)
Search, filter, and analyze application and infrastructure log events.

**Traces** — [Explore traces](${w}/app/explore/traces)
Follow requests end-to-end across services to pinpoint latency and errors.

**Metrics** — [Explore metrics](${w}/app/explore/metrics)
Query Prometheus metrics for throughput, latency percentiles, and error rates.

### APM & services

**APM services** — [Service list](${w}/app/observability-apm-services#/services)
View latency, error rate, and throughput (RED metrics) for every instrumented service.

**Service map** — [View service map](${w}/app/observability-apm-application-map)
Visualize service-to-service dependencies and traffic flow.

### Agent observability

**Agent traces** — [Explore agent traces](${w}/app/agentTraces)
Inspect individual AI agent invocations, tool calls, and LLM interactions.

**Agent dashboard** — [Agent observability dashboard](${w}/app/dashboards#/view/agent-observability-dashboard)
Monitor agent activity, token usage, and tool execution at a glance.
`;

  await neoPost(base, `/w/${wsId}/api/saved_objects/visualization/overview-markdown`, {
    attributes: {
      title: '',
      visState: JSON.stringify({ title: '', type: 'markdown', params: { fontSize: 12, openLinksInNewTab: false, markdown: md }, aggs: [] }),
      uiStateJSON: '{}',
      kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({}) },
    },
  }, region);

  await neoPost(base, `/w/${wsId}/api/saved_objects/dashboard/observability-overview-dashboard`, {
    attributes: {
      title: 'Observability Stack Overview',
      description: 'Landing page with links to all observability features',
      panelsJSON: JSON.stringify([{
        version: '3.6.0', gridData: { x: 0, y: 0, w: 48, h: 35, i: '0' },
        panelIndex: '0', embeddableConfig: {}, panelRefName: 'panel_0',
      }]),
      optionsJSON: JSON.stringify({ useMargins: true, hidePanelTitles: true }),
      timeRestore: false,
      kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }) },
    },
    references: [{ name: 'panel_0', type: 'visualization', id: 'overview-markdown' }],
  }, region);
  printSuccess('Overview dashboard created');
}
