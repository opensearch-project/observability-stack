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
 * Putting the category on y (and the value on x) makes the bar chart horizontal.
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
  return {
    query: `source = ${source} | where isnotnull(\`${p.field}\`) | stats count() as value by \`${p.field}\` | sort - value | head 10`,
    chartType: p.type === 'pie' ? 'pie' : 'bar',
    axesMapping: { size: 'value', color: p.field },
  };
}

/** The explore saved object (attributes and references) for one panel over the traces pattern. */
export function agentPanelObject(p, tracesId) {
  const { query, chartType, axesMapping } = agentPanelQuery(p);
  const dataset = {
    id: tracesId, title: AGENT_TRACES_TITLE, type: 'INDEX_PATTERN',
    language: 'PPL', timeFieldName: AGENT_TRACES_TIME_FIELD, signalType: 'traces',
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
