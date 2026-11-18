/**
 * OpenSearch UI setup for Agent Evaluations: the evaluations dataset (a logs index pattern over
 * the evaluation events) and the workspace's Agent Evaluations config, the same saved objects the
 * UI's "Create evaluations dataset" and Settings save. Both are plain saved objects, so they are
 * harmless when the Evaluations feature flag is off. Idempotent: an existing dataset or config is
 * reused, never replaced.
 *
 * The CDK UI init (aws/cdk/custom-resources/ui-init/agent-evals.ts) keeps the same shapes.
 */

export const EVALS_DATASET_TITLE = 'otel-v1-genai-evaluation*';
export const EVALS_DATASET_TIME_FIELD = '@timestamp';
export const EVALS_DATASET_DISPLAY_NAME = 'Evaluation Dataset';
export const EVALS_SCHEMA_MAPPINGS = JSON.stringify({
  otelLogs: {
    timestamp: EVALS_DATASET_TIME_FIELD,
    traceId: 'traceId',
    spanId: 'spanId',
    serviceName: 'resource.attributes.service.name',
  },
});
export const EVALS_CONFIG_PREFIX = 'AgentEvals-Config-';
export const EVALS_CONFIG_TITLE = 'AgentEvals-Config';

/** The evaluations dataset's index pattern attributes. */
export function evalsDatasetAttributes() {
  return {
    title: EVALS_DATASET_TITLE,
    timeFieldName: EVALS_DATASET_TIME_FIELD,
    signalType: 'logs',
    displayName: EVALS_DATASET_DISPLAY_NAME,
    schemaMappings: EVALS_SCHEMA_MAPPINGS,
  };
}

/** The workspace's Agent Evaluations config (a `correlations` saved object). */
export function evalsConfigBody(wsId, tracesId, evalsId) {
  return {
    attributes: {
      correlationType: `${EVALS_CONFIG_PREFIX}${wsId}`,
      title: EVALS_CONFIG_TITLE,
      version: '1.0.0',
      entities: [
        { tracesDataset: { id: 'references[0].id' } },
        { evaluationsDataset: { id: 'references[1].id' } },
      ],
    },
    references: [
      { name: 'entities[0].index', type: 'index-pattern', id: tracesId },
      { name: 'entities[1].index', type: 'index-pattern', id: evalsId },
    ],
  };
}

/**
 * The attributes an existing pattern titled like the evaluations dataset lacks (one made in
 * Dashboards Management, or by an older installer): only absent ones, nothing is overwritten.
 */
export function missingDatasetAttributes(attributes = {}) {
  const wanted = evalsDatasetAttributes();
  const missing = {};
  for (const key of ['signalType', 'displayName', 'schemaMappings']) {
    if (!attributes[key]) missing[key] = wanted[key];
  }
  return missing;
}

const refsDataSource = (o, dsId) => (o.references || []).some((r) => r.name === 'dataSource' && r.id === dsId);

/**
 * Creates (or reuses) the evaluations dataset and the workspace's config.
 *
 * `api` is `{ get(path), post(path, body), put(path, body) }` returning `{ status, data }`, with
 * paths relative to the application endpoint. `dsId` is the data source the evaluation indices
 * are on. It is referenced as type `data-source` on managed domains and collections alike, as the
 * UI's create path does: the Evaluations page only reads a `data-source` reference, and with
 * another type (`OpenSearch Serverless`) it queries no data source and reports it unreachable. Returns
 * `{ evalsId, configId, datasetCreated, configCreated }`; ids are undefined when a step failed.
 */
export async function ensureAgentEvalsSetup(api, { wsId, dsId, tracesId }) {
  const w = `/w/${wsId}`;
  const result = { evalsId: undefined, configId: undefined, datasetCreated: false, configCreated: false };

  // a. The evaluations dataset: a pattern with its title (on the same data source) is reused.
  // Listed and matched here: OpenSearch UI's _find `search` does not match titles with `*`.
  const find = await api.get(`${w}/api/saved_objects/_find?type=index-pattern&fields=title&fields=signalType&fields=displayName&fields=schemaMappings&per_page=10000`);
  const same = (find.data?.saved_objects || []).filter((o) => o.attributes?.title === EVALS_DATASET_TITLE);
  const existing = (dsId && same.find((o) => refsDataSource(o, dsId))) || same[0];
  if (existing) {
    result.evalsId = existing.id;
    const missing = missingDatasetAttributes(existing.attributes);
    if (Object.keys(missing).length) {
      await api.put(`${w}/api/saved_objects/index-pattern/${existing.id}`, { attributes: missing });
    }
  } else {
    const created = await api.post(`${w}/api/saved_objects/index-pattern`, {
      attributes: evalsDatasetAttributes(),
      references: dsId ? [{ id: dsId, name: 'dataSource', type: 'data-source' }] : [],
    });
    result.evalsId = created.data?.id;
    result.datasetCreated = !!result.evalsId;
  }

  // b. The config: one per workspace. An existing one (made in Settings or by an earlier run) is
  // left as is, so a user's choice of datasets is kept.
  const corrs = await api.get(`${w}/api/saved_objects/_find?type=correlations&per_page=100`);
  const configs = (corrs.data?.saved_objects || [])
    .filter((c) => (c.attributes?.correlationType || '').startsWith(EVALS_CONFIG_PREFIX));
  const config = configs.find((c) => c.attributes.correlationType === `${EVALS_CONFIG_PREFIX}${wsId}`) || configs[0];
  if (config) {
    result.configId = config.id;
  } else if (tracesId && result.evalsId) {
    const created = await api.post(`${w}/api/saved_objects/correlations`, evalsConfigBody(wsId, tracesId, result.evalsId));
    result.configId = created.data?.id;
    result.configCreated = !!result.configId;
  }
  return result;
}
