/**
 * Agent Observability dashboard panels, built as Explore (query-based) saved objects.
 *
 * The panels used to be aggregation visualizations. Those look each field up in the index
 * pattern's stored field list and throw "Could not locate that index-pattern-field" when it is
 * missing. UI init stores that list from the index templates, before telemetry has created the
 * dynamic attributes.gen_ai.* fields, so a fresh deployment is left with a non-empty but
 * incomplete list. A PPL query names its fields as text, so these panels do not depend on it.
 */

export interface AgentPanel {
  id: string;
  title: string;
  type: 'pie' | 'horizontal_bar';
  field: string;
  /** Sum this field instead of counting documents. */
  metric?: string;
  /** Group each category by this field as well. */
  split?: string;
}

export const AGENT_PANELS: AgentPanel[] = [
  { id: 'llm-requests-by-model', title: 'LLM Requests by Model', type: 'pie', field: 'attributes.gen_ai.request.model' },
  { id: 'tool-usage-stats', title: 'Tool Usage Statistics', type: 'pie', field: 'attributes.gen_ai.tool.name' },
  { id: 'token-usage-by-agent', title: 'Token Usage by Agent', type: 'horizontal_bar', field: 'attributes.gen_ai.agent.name', metric: 'attributes.gen_ai.usage.input_tokens' },
  { id: 'token-usage-by-model', title: 'Token Usage by Model', type: 'horizontal_bar', field: 'attributes.gen_ai.request.model', metric: 'attributes.gen_ai.usage.input_tokens' },
  { id: 'agent-ops-by-service', title: 'Agent Operations by Service', type: 'horizontal_bar', field: 'serviceName', split: 'attributes.gen_ai.operation.name' },
];

export const AGENT_TRACES_TITLE = 'otel-v1-apm-span*';
export const AGENT_TRACES_TIME_FIELD = 'endTime';

/**
 * The PPL query, chart type and axes mapping for one panel. Documents missing a field are dropped
 * and results are ranked by value, capped at 10 categories, as the old terms aggregations were.
 * Putting the category on y (and the value on x) makes the bar chart horizontal. The split panel
 * keeps the top 50 (category, split) pairs overall, not the old top 10 categories by top 5 splits,
 * so one category with many split values can take more of the chart than before.
 */
export function agentPanelQuery(p: AgentPanel, source: string = AGENT_TRACES_TITLE) {
  if (p.metric) {
    return {
      query: `source = ${source} | where isnotnull(\`${p.field}\`) | stats sum(\`${p.metric}\`) as value by \`${p.field}\` | sort - value | head 10`,
      chartType: 'bar' as const,
      axesMapping: { x: 'value', y: p.field } as Record<string, string>,
    };
  }
  if (p.split) {
    return {
      query: `source = ${source} | where isnotnull(\`${p.field}\`) and isnotnull(\`${p.split}\`) | stats count() as value by \`${p.field}\`, \`${p.split}\` | sort - value | head 50`,
      chartType: 'bar' as const,
      axesMapping: { x: 'value', y: p.field, color: p.split } as Record<string, string>,
    };
  }
  // size/color are pie roles; any other chart type gets a horizontal bar.
  const isPie = p.type === 'pie';
  return {
    query: `source = ${source} | where isnotnull(\`${p.field}\`) | stats count() as value by \`${p.field}\` | sort - value | head 10`,
    chartType: (isPie ? 'pie' : 'bar') as 'pie' | 'bar',
    axesMapping: (isPie ? { size: 'value', color: p.field } : { x: 'value', y: p.field }) as Record<string, string>,
  };
}

export interface DatasetDataSource {
  id: string;
  title: string;
  type: string;
  version: string;
}

/**
 * The dataset's `dataSource`, in the shape OSD builds for an index pattern on an external data
 * source (see DataViewsService.resolveDataSourceForDataset). Without it the query goes to the
 * application's default connection, which has none, and every panel fails with "No Living
 * connections". Takes the data-source saved object; undefined when there is none.
 */
export function datasetDataSource(ds?: { id?: string; attributes?: Record<string, any> }): DatasetDataSource | undefined {
  if (!ds?.id) return undefined;
  return {
    id: ds.id,
    title: ds.attributes?.title || ds.id,
    type: ds.attributes?.dataSourceEngineType || 'OpenSearch',
    version: ds.attributes?.dataSourceVersion || '',
  };
}

/** The explore saved object (attributes and references) for one panel over the traces pattern. */
export function agentPanelObject(p: AgentPanel, tracesId: string, dataSource?: DatasetDataSource, tracesTitle = AGENT_TRACES_TITLE) {
  const { query, chartType, axesMapping } = agentPanelQuery(p, tracesTitle);
  const dataset = {
    id: tracesId, title: tracesTitle, type: 'INDEX_PATTERN',
    language: 'PPL', timeFieldName: AGENT_TRACES_TIME_FIELD, signalType: 'traces',
    ...(dataSource && { dataSource }),
  };
  return {
    attributes: {
      title: p.title, description: '', hits: 0, columns: ['_source'], sort: [], version: 1, type: 'traces',
      visualization: JSON.stringify({ title: '', chartType, params: { addLegend: true, addTooltip: true }, axesMapping }),
      uiState: JSON.stringify({ activeTab: 'explore_visualization_tab' }),
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({
          query: { query, language: 'PPL', dataset },
          filter: [], indexRefName: 'kibanaSavedObjectMeta.searchSourceJSON.index',
        }),
      },
    },
    references: [{ name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern', id: tracesId }],
  };
}

export interface AgentApi {
  post(path: string, body: unknown): Promise<{ status: number }>;
  put(path: string, body: unknown): Promise<{ status: number }>;
  del(path: string): Promise<{ status: number }>;
}

export interface AgentSyncResult {
  /** Ids of the panels on the dashboard. */
  panelIds: string[];
  /** 'created' or 'updated' when the dashboard was saved; 'failed' or 'skipped' otherwise. */
  dashboard: 'created' | 'updated' | 'failed' | 'skipped';
  /** Legacy aggregation visualizations that were deleted. */
  removedLegacy: string[];
  warnings: string[];
}

/** The dashboard saved object over the given explore panels. */
export function agentDashboardObject(panelIds: string[]) {
  const panels = panelIds.map((_, i) => ({
    version: '3.6.0',
    gridData: { x: (i % 2) * 24, y: Math.floor(i / 2) * 15, w: 24, h: 15, i: String(i) },
    panelIndex: String(i), embeddableConfig: {}, panelRefName: `panel_${i}`,
  }));
  return {
    attributes: {
      title: 'Agent Observability',
      description: 'Overview of AI agent performance, token usage, and tool execution',
      panelsJSON: JSON.stringify(panels),
      optionsJSON: JSON.stringify({ useMargins: true, hidePanelTitles: false }),
      timeRestore: false,
      kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }) },
    },
    references: panelIds.map((id, i) => ({ name: `panel_${i}`, type: 'explore', id })),
  };
}

/**
 * Saves the explore panels and the dashboard that holds them, create or update, so it also works
 * on an existing workspace (a stack update or a re-run). The legacy aggregation visualizations an
 * earlier version saved under the same ids are deleted only after the dashboard save succeeds: an
 * existing dashboard still references them until then. A failed request skips that step and is
 * reported in `warnings`; it never throws.
 */
export async function syncAgentDashboard(
  api: AgentApi, wsId: string, tracesId: string, dataSource?: DatasetDataSource, tracesTitle = AGENT_TRACES_TITLE,
): Promise<AgentSyncResult> {
  const result: AgentSyncResult = { panelIds: [], dashboard: 'skipped', removedLegacy: [], warnings: [] };

  for (const p of AGENT_PANELS) {
    try {
      const obj = agentPanelObject(p, tracesId, dataSource, tracesTitle);
      const path = `/w/${wsId}/api/saved_objects/explore/${p.id}`;
      const created = await api.post(path, obj);
      if (created.status === 200) {
        result.panelIds.push(p.id);
      } else if (created.status === 409) {
        // Already there. If the update fails it is still there, so keep it on the dashboard.
        const updated = await api.put(path, { attributes: obj.attributes, references: obj.references });
        if (updated.status !== 200) result.warnings.push(`Agent panel ${p.title} exists but was not updated: HTTP ${updated.status}`);
        result.panelIds.push(p.id);
      } else {
        result.warnings.push(`Agent panel ${p.title} not saved: HTTP ${created.status}`);
      }
    } catch (e: any) {
      result.warnings.push(`Agent panel ${p.title} failed: ${e.message}`);
    }
  }
  if (!result.panelIds.length) return result;

  const dashPath = `/w/${wsId}/api/saved_objects/dashboard/agent-observability-dashboard`;
  const dash = agentDashboardObject(result.panelIds);
  try {
    let resp = await api.post(dashPath, dash);
    let outcome: 'created' | 'updated' = 'created';
    if (resp.status === 409) {
      resp = await api.put(dashPath, { attributes: dash.attributes, references: dash.references });
      outcome = 'updated';
    }
    if (resp.status === 200) result.dashboard = outcome;
    else {
      result.dashboard = 'failed';
      result.warnings.push(`Agent Observability dashboard not saved: HTTP ${resp.status}`);
    }
  } catch (e: any) {
    result.dashboard = 'failed';
    result.warnings.push(`Agent Observability dashboard failed: ${e.message}`);
  }
  if (result.dashboard === 'failed') return result;

  for (const id of result.panelIds) {
    try {
      await api.del(`/w/${wsId}/api/saved_objects/visualization/${id}`);
      result.removedLegacy.push(id);
    } catch { /* best effort: a leftover legacy panel is cosmetic */ }
  }
  return result;
}
