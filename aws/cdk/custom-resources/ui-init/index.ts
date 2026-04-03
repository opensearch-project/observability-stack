/**
 * OpenSearch UI initialization custom resource handler.
 * Creates workspace, index patterns, correlations, saved queries, and dashboards.
 * Ported from cli-installer/src/opensearch-ui-init.mjs
 */
import { createHash } from 'node:crypto';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { ARCH_IMAGE_B64 } from './arch-image.mjs';

interface Event {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: {
    AppEndpoint: string;
    Region: string;
  };
}

// ── SigV4 HTTP helper ─────────────────────────────────────────────────────────

async function osuiRequest(method: string, url: string, body: any, region: string) {
  const isGet = method === 'GET' || method === 'DELETE';
  const bodyBytes = (!isGet && body) ? JSON.stringify(body) : '';
  const bodyHash = createHash('sha256').update(bodyBytes).digest('hex');
  const parsed = new URL(url);

  const query: Record<string, string> = {};
  parsed.searchParams.forEach((v, k) => { query[k] = v; });

  const request = new HttpRequest({
    method,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : undefined,
    path: parsed.pathname,
    query,
    headers: {
      host: parsed.hostname,
      'Content-Type': 'application/json',
      'osd-xsrf': 'osd-fetch',
      'x-amz-content-sha256': bodyHash,
    },
    body: bodyBytes || undefined,
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
    headers: signed.headers as Record<string, string>,
    body: isGet ? undefined : bodyBytes,
  });

  const text = await resp.text();
  try { return { status: resp.status, data: JSON.parse(text) }; }
  catch { return { status: resp.status, data: text }; }
}

async function osuiGet(base: string, path: string, region: string) {
  return osuiRequest('GET', `${base}${path}`, null, region);
}

async function osuiPost(base: string, path: string, body: any, region: string) {
  return osuiRequest('POST', `${base}${path}`, body, region);
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handler(event: Event) {
  const { AppEndpoint, Region } = event.ResourceProperties;

  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: 'ui-init' };
  }

  const base = AppEndpoint;

  // Wait for ready
  const maxWait = 120_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const r = await osuiGet(base, '/api/status', Region);
      console.log('Status check:', r.status);
      if (r.status === 200) break;
    } catch (e: any) { console.log('Status check error:', e.message); }
    await sleep(5000);
  }

  // Find auto-created data-source
  let dsId: string | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    const dsResp = await osuiGet(base, '/api/saved_objects/_find?type=data-source&per_page=10', Region);
    dsId = (dsResp.data as any)?.saved_objects?.[0]?.id;
    if (dsId) break;
    console.log('Data source not found yet, attempt', attempt + 1);
    if (attempt < 5) await sleep(10000);
  }

  // Find auto-created data-connection (Prometheus)
  let dcId: string | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    const dcResp = await osuiGet(base, '/api/saved_objects/_find?type=data-connection&per_page=10', Region);
    dcId = (dcResp.data as any)?.saved_objects?.[0]?.id;
    if (dcId) break;
    console.log('Data connection not found yet, attempt', attempt + 1);
    if (attempt < 5) await sleep(10000);
  }

  // Create workspace
  let wsId: string | undefined;
  const wsListResp = await osuiPost(base, '/api/workspaces/_list', {}, Region);
  const existing = ((wsListResp.data as any)?.result?.workspaces || []).find((w: any) => w.name === 'Observability Stack');
  if (existing) {
    wsId = existing.id;
  } else {
    const wsResp = await osuiPost(base, '/api/workspaces', {
      attributes: {
        name: 'Observability Stack',
        description: 'AI Agent observability workspace with logs, traces, and metrics',
        features: ['use-case-observability'],
      },
    }, Region);
    wsId = (wsResp.data as any)?.result?.id;
    console.log('Workspace create response:', JSON.stringify(wsResp.data));
    if (!wsId) {
      console.log('WARNING: Workspace creation failed, returning without WorkspaceId');
      return { PhysicalResourceId: 'ui-init', Data: { WorkspaceId: 'NONE' } };
    }
  }

  // Associate data-source + data-connection with workspace
  if (dsId) {
    await osuiPost(base, '/api/workspaces/_associate', {
      workspaceId: wsId,
      savedObjects: [{ type: 'data-source', id: dsId }],
    }, Region);
  }
  if (dcId) {
    await osuiPost(base, '/api/workspaces/_associate', {
      workspaceId: wsId,
      savedObjects: [{ type: 'data-connection', id: dcId }],
    }, Region);
  }

  // Create index patterns
  const logsSchema = '{"otelLogs":{"timestamp":"time","traceId":"traceId","spanId":"spanId","serviceName":"resource.attributes.service.name"}}';
  const patterns = [
    { title: 'logs-otel-v1*', timeFieldName: 'time', signalType: 'logs', schemaMappings: logsSchema },
    { title: 'otel-v1-apm-span*', timeFieldName: 'endTime', signalType: 'traces' },
    { title: 'otel-v2-apm-service-map*', timeFieldName: 'timestamp' },
  ];

  const patternIds: Record<string, string> = {};
  for (const p of patterns) {
    const findResp = await osuiGet(base,
      `/w/${wsId}/api/saved_objects/_find?type=index-pattern&search_fields=title&search=${encodeURIComponent(p.title)}`, Region);
    const existingPat = ((findResp.data as any)?.saved_objects || []).find((o: any) => o.attributes?.title === p.title);
    if (existingPat) {
      patternIds[p.title] = existingPat.id;
      continue;
    }
    const resp = await osuiPost(base, `/w/${wsId}/api/saved_objects/index-pattern`, {
      attributes: p,
      references: dsId ? [{ id: dsId, name: 'dataSource', type: 'data-source' }] : [],
    }, Region);
    patternIds[p.title] = (resp.data as any)?.id;
  }

  const logsId = patternIds['logs-otel-v1*'];
  const tracesId = patternIds['otel-v1-apm-span*'];
  const svcMapId = patternIds['otel-v2-apm-service-map*'];

  // Set default index pattern
  await osuiPost(base, `/w/${wsId}/api/opensearch-dashboards/settings`, {
    changes: { defaultIndex: logsId },
  }, Region);

  // Trace-to-logs correlation
  if (tracesId && logsId) {
    const corrFind = await osuiGet(base, `/w/${wsId}/api/saved_objects/_find?type=correlations&per_page=50`, Region);
    const hasTraceToLogs = ((corrFind.data as any)?.saved_objects || []).some((c: any) =>
      c.attributes?.correlationType?.startsWith('trace-to-logs'));
    if (!hasTraceToLogs) {
      await osuiPost(base, `/w/${wsId}/api/saved_objects/correlations`, {
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
      }, Region);
    }
  }

  // APM config correlation
  if (tracesId && svcMapId && dcId) {
    const corrFind2 = await osuiGet(base, `/w/${wsId}/api/saved_objects/_find?type=correlations&per_page=50`, Region);
    const hasApmConfig = ((corrFind2.data as any)?.saved_objects || []).some((c: any) =>
      c.attributes?.correlationType?.startsWith('APM-Config'));
    if (!hasApmConfig) {
      await osuiPost(base, `/w/${wsId}/api/saved_objects/correlations`, {
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
      }, Region);
    }
  }

  // Saved queries
  const queries = [
    { id: 'error-logs', title: 'Error Logs', query: 'source = logs-otel-v1* | where severityNumber >= 17 | sort - time | head 100' },
    { id: 'agent-invocations', title: 'Agent Invocations', query: 'source = otel-v1-apm-span* | where attributes.gen_ai.operation.name = "invoke_agent" | sort - endTime | head 50' },
    { id: 'tool-executions', title: 'Tool Executions', query: 'source = otel-v1-apm-span* | where attributes.gen_ai.operation.name = "execute_tool" | sort - endTime | head 50' },
    { id: 'slow-spans', title: 'Slow Spans (>5s)', query: 'source = otel-v1-apm-span* | where durationInNanos > 5000000000 | sort - durationInNanos | head 50' },
    { id: 'token-usage', title: 'Token Usage by Model', query: 'source = otel-v1-apm-span* | where isnotnull(attributes.gen_ai.usage.input_tokens) | stats sum(attributes.gen_ai.usage.input_tokens) as input_tokens, sum(attributes.gen_ai.usage.output_tokens) as output_tokens by attributes.gen_ai.request.model' },
  ];
  for (const q of queries) {
    await osuiPost(base, `/w/${wsId}/api/saved_objects/query/${q.id}`, {
      attributes: { title: q.title, description: q.title, query: { query: q.query, language: 'PPL' } },
    }, Region);
  }

  // Agent Observability dashboard
  if (tracesId && wsId) {
    await createAgentDashboard(base, wsId, tracesId, Region);
  }

  // Overview dashboard
  if (wsId) {
    await createOverviewDashboard(base, wsId, Region);
  }

  // Set default dashboard and workspace
  await osuiPost(base, `/w/${wsId}/api/opensearch-dashboards/settings`, {
    changes: { 'observability:defaultDashboard': 'observability-overview-dashboard' },
  }, Region);
  await osuiPost(base, '/api/opensearch-dashboards/settings', {
    changes: { defaultWorkspace: wsId },
  }, Region);

  return { PhysicalResourceId: 'ui-init', Data: { WorkspaceId: wsId } };
}

// ── Agent Observability Dashboard ─────────────────────────────────────────────

async function createAgentDashboard(base: string, wsId: string, tracesId: string, region: string) {
  const vizs = [
    { id: 'llm-requests-by-model', title: 'LLM Requests by Model', type: 'pie', field: 'attributes.gen_ai.request.model' },
    { id: 'tool-usage-stats', title: 'Tool Usage Statistics', type: 'pie', field: 'attributes.gen_ai.tool.name' },
    { id: 'token-usage-by-agent', title: 'Token Usage by Agent', type: 'horizontal_bar', field: 'attributes.gen_ai.agent.name', metric: 'attributes.gen_ai.usage.input_tokens' },
    { id: 'token-usage-by-model', title: 'Token Usage by Model', type: 'horizontal_bar', field: 'attributes.gen_ai.request.model', metric: 'attributes.gen_ai.usage.input_tokens' },
    { id: 'agent-ops-by-service', title: 'Agent Operations by Service', type: 'horizontal_bar', field: 'serviceName', split: 'attributes.gen_ai.operation.name' },
  ];

  const vizIds: string[] = [];
  for (const v of vizs) {
    const aggs: any[] = [
      (v as any).metric
        ? { id: '1', type: 'sum', schema: 'metric', params: { field: (v as any).metric } }
        : { id: '1', type: 'count', schema: 'metric' },
      { id: '2', type: 'terms', schema: 'segment', params: { field: v.field, size: 10 } },
    ];
    if ((v as any).split) aggs.push({ id: '3', type: 'terms', schema: 'group', params: { field: (v as any).split, size: 5 } });

    await osuiPost(base, `/w/${wsId}/api/saved_objects/visualization/${v.id}`, {
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

  await osuiPost(base, `/w/${wsId}/api/saved_objects/dashboard/agent-observability-dashboard`, {
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
}

// ── Overview Dashboard ────────────────────────────────────────────────────────

async function createOverviewDashboard(base: string, wsId: string, region: string) {
  const w = `/w/${wsId}`;
  const archImg = `![Architecture](data:image/png;base64,${ARCH_IMAGE_B64})`;
  const md = `## Welcome to OpenSearch Observability Stack!

Your entire stack, fully visible. APM traces, logs, Prometheus metrics, service maps, and AI agent tracing — unified in one open-source platform.

[Observability Stack Website](https://observability.opensearch.org) | [GitHub](https://github.com/opensearch-project/observability-stack)

### Architecture

${archImg}

---

### Explore telemetry

**Logs** — [Explore logs](${w}/app/explore/logs)
**Traces** — [Explore traces](${w}/app/explore/traces)
**Metrics** — [Explore metrics](${w}/app/explore/metrics)

### APM & services

**APM services** — [Service list](${w}/app/observability-apm-services#/services)
**Service map** — [View service map](${w}/app/observability-apm-application-map)

### Agent observability

**Agent traces** — [Explore agent traces](${w}/app/agentTraces)
**Agent dashboard** — [Agent observability dashboard](${w}/app/dashboards#/view/agent-observability-dashboard)
`;

  await osuiPost(base, `/w/${wsId}/api/saved_objects/visualization/overview-markdown`, {
    attributes: {
      title: '',
      visState: JSON.stringify({ title: '', type: 'markdown', params: { fontSize: 12, openLinksInNewTab: false, markdown: md }, aggs: [] }),
      uiStateJSON: '{}',
      kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({}) },
    },
  }, region);

  await osuiPost(base, `/w/${wsId}/api/saved_objects/dashboard/observability-overview-dashboard`, {
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
}
