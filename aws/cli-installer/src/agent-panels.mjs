/**
 * Agent Observability dashboard panels, built as Explore (query-based) saved objects.
 * Mirrors aws/cdk/custom-resources/ui-init/agent-panels.ts; keep the two in step.
 *
 * The panels used to be aggregation visualizations. Those look each field up in the index
 * pattern's stored field list and throw "Could not locate that index-pattern-field" when it is
 * missing. UI init stores that list from the index templates, before telemetry has created the
 * dynamic attributes.gen_ai.* fields, so a fresh deployment is left with a non-empty but
 * incomplete list. A PPL query names its fields as text, so these panels do not depend on it.
 */

export const AGENT_PANELS = [
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
export function agentPanelQuery(p, source = AGENT_TRACES_TITLE) {
  if (p.metric) {
    return {
      query: `source = ${source} | where isnotnull(\`${p.field}\`) | stats sum(\`${p.metric}\`) as value by \`${p.field}\` | sort - value | head 10`,
      chartType: 'bar',
      axesMapping: { x: 'value', y: p.field },
    };
  }
  if (p.split) {
    return {
      query: `source = ${source} | where isnotnull(\`${p.field}\`) and isnotnull(\`${p.split}\`) | stats count() as value by \`${p.field}\`, \`${p.split}\` | sort - value | head 50`,
      chartType: 'bar',
      axesMapping: { x: 'value', y: p.field, color: p.split },
    };
  }
  // size/color are pie roles; any other chart type gets a horizontal bar.
  const isPie = p.type === 'pie';
  return {
    query: `source = ${source} | where isnotnull(\`${p.field}\`) | stats count() as value by \`${p.field}\` | sort - value | head 10`,
    chartType: isPie ? 'pie' : 'bar',
    axesMapping: isPie ? { size: 'value', color: p.field } : { x: 'value', y: p.field },
  };
}

/**
 * The dataset's `dataSource`, in the shape OSD builds for an index pattern on an external data
 * source (see DataViewsService.resolveDataSourceForDataset). Without it the query goes to the
 * application's default connection, which has none, and every panel fails with "No Living
 * connections". Takes the data-source saved object; undefined when there is none.
 */
export function datasetDataSource(ds) {
  if (!ds?.id) return undefined;
  return {
    id: ds.id,
    title: ds.attributes?.title || ds.id,
    type: ds.attributes?.dataSourceEngineType || 'OpenSearch',
    version: ds.attributes?.dataSourceVersion || '',
  };
}

/** The explore saved object (attributes and references) for one panel over the traces pattern. */
export function agentPanelObject(p, tracesId, dataSource) {
  const { query, chartType, axesMapping } = agentPanelQuery(p);
  const dataset = {
    id: tracesId, title: AGENT_TRACES_TITLE, type: 'INDEX_PATTERN',
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

/** The dashboard saved object over the given explore panels. */
export function agentDashboardObject(panelIds) {
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
 * on an existing workspace (a re-run of the installer). The legacy aggregation visualizations an
 * earlier version saved under the same ids are deleted only after the dashboard save succeeds: an
 * existing dashboard still references them until then. A failed request skips that step and is
 * reported in `warnings`; it never throws. `api` is `{ post(path, body), put(path, body), del(path) }`,
 * each resolving to `{ status }`.
 */
export async function syncAgentDashboard(api, wsId, tracesId, dataSource) {
  const result = { panelIds: [], dashboard: 'skipped', removedLegacy: [], warnings: [] };

  for (const p of AGENT_PANELS) {
    try {
      const obj = agentPanelObject(p, tracesId, dataSource);
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
    } catch (err) {
      result.warnings.push(`Agent panel ${p.title} failed: ${err.message}`);
    }
  }
  if (!result.panelIds.length) return result;

  const dashPath = `/w/${wsId}/api/saved_objects/dashboard/agent-observability-dashboard`;
  const dash = agentDashboardObject(result.panelIds);
  try {
    let resp = await api.post(dashPath, dash);
    let outcome = 'created';
    if (resp.status === 409) {
      resp = await api.put(dashPath, { attributes: dash.attributes, references: dash.references });
      outcome = 'updated';
    }
    if (resp.status === 200) result.dashboard = outcome;
    else {
      result.dashboard = 'failed';
      result.warnings.push(`Agent Observability dashboard not saved: HTTP ${resp.status}`);
    }
  } catch (err) {
    result.dashboard = 'failed';
    result.warnings.push(`Agent Observability dashboard failed: ${err.message}`);
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
