/**
 * GenAI evaluation index bootstrap for managed OpenSearch domains.
 *
 * Agent evaluation results (OTel `gen_ai.evaluation.result` log events) are written to the
 * write alias `otel-v1-genai-evaluation` over rollover indices `otel-v1-genai-evaluation-000001`,
 * ... This creates the ISM rollover policy, the composable index template and the first index
 * with the write alias. It must run before the OSIS pipeline starts: the pipeline's sink creates
 * a plain index named `otel-v1-genai-evaluation` when it finds neither an index nor an alias,
 * and that index then blocks the alias.
 *
 * Pure apart from the injected fetch, so it is unit-tested with a fake.
 */
import { readFileSync } from 'node:fs';

export const EVALUATION_ALIAS = 'otel-v1-genai-evaluation';
export const EVALUATION_TEMPLATE_NAME = 'otel-v1-genai-evaluation-index-template';
export const EVALUATION_POLICY_ID = 'otel-v1-genai-evaluation-policy';
export const EVALUATION_BOOTSTRAP_INDEX = `${EVALUATION_ALIAS}-000001`;

export const EVALUATION_TEMPLATE = JSON.parse(readFileSync(
  new URL('./genai-evaluation/otel-v1-genai-evaluation-index-template.json', import.meta.url), 'utf8'));
export const EVALUATION_POLICY = JSON.parse(readFileSync(
  new URL('./genai-evaluation/otel-v1-genai-evaluation-policy.json', import.meta.url), 'utf8'));

const TRANSIENT = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network|fetch failed|terminated|timeout| returned (401|403|429|5\d\d)/i;

async function withRetry(fn, { attempts, delayMs, onRetry }) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts - 1 || !TRANSIENT.test(err?.message || '')) throw err;
      onRetry?.(err, i);
      if (delayMs) await new Promise((r) => setTimeout(r, Math.min(30_000, delayMs * 1.6 ** i)));
    }
  }
}

async function request(fetchFn, url, method, body) {
  const resp = await fetchFn(url, method, body === undefined ? undefined : JSON.stringify(body));
  const text = await resp.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: resp.status, ok: resp.ok, data, text };
}

function fail(what, r) {
  return new Error(`${what} returned ${r.status}: ${String(r.text).slice(0, 200)}`);
}

/**
 * Creates the evaluation ISM policy, index template and write alias when missing.
 * An existing policy is left as is; the template is replaced only when the installed
 * `version` is lower (the same rule Data Prepper applies).
 *
 * @param {(url: string, method: string, body?: string) => Promise<Response>} fetchFn
 * @param {string} endpoint domain endpoint with scheme, no trailing slash
 * @returns {Promise<{ policy: string, template: string, alias: string }>} what happened to each
 */
export async function ensureEvaluationIndex(fetchFn, endpoint, { log = () => {}, attempts = 6, delayMs = 5000 } = {}) {
  const base = endpoint.replace(/\/+$/, '');
  const retry = (fn) => withRetry(fn, {
    attempts, delayMs,
    onRetry: (err, i) => log(`Evaluation index setup not ready yet (attempt ${i + 1}): ${err.message}; retrying`),
  });
  const result = {};

  // 1. ISM policy (before the index so its ism_template attaches the policy to -000001)
  result.policy = await retry(async () => {
    const url = `${base}/_plugins/_ism/policies/${EVALUATION_POLICY_ID}`;
    const cur = await request(fetchFn, url, 'GET');
    if (cur.ok) return 'exists';
    if (cur.status !== 404) throw fail(`GET ISM policy ${EVALUATION_POLICY_ID}`, cur);
    const put = await request(fetchFn, url, 'PUT', EVALUATION_POLICY);
    if (put.ok) return 'created';
    if (/version_conflict_engine_exception|resource_already_exists_exception/.test(put.text)) return 'exists';
    throw fail(`PUT ISM policy ${EVALUATION_POLICY_ID}`, put);
  });

  // 2. Composable index template, replaced only by a higher version
  result.template = await retry(async () => {
    const url = `${base}/_index_template/${EVALUATION_TEMPLATE_NAME}`;
    const cur = await request(fetchFn, url, 'GET');
    let action = 'created';
    if (cur.ok) {
      const installed = cur.data?.index_templates?.[0]?.index_template?.version;
      if (typeof installed === 'number' && installed >= EVALUATION_TEMPLATE.version) return 'exists';
      action = 'updated';
    } else if (cur.status !== 404) {
      throw fail(`GET index template ${EVALUATION_TEMPLATE_NAME}`, cur);
    }
    const put = await request(fetchFn, url, 'PUT', EVALUATION_TEMPLATE);
    if (!put.ok) throw fail(`PUT index template ${EVALUATION_TEMPLATE_NAME}`, put);
    return action;
  });

  // 3. First rollover index with the write alias
  result.alias = await retry(async () => {
    const alias = await request(fetchFn, `${base}/_alias/${EVALUATION_ALIAS}`, 'GET');
    if (alias.ok) return 'exists';
    if (alias.status !== 404) throw fail(`GET alias ${EVALUATION_ALIAS}`, alias);
    // A concrete index with the alias name (created by an earlier pipeline) blocks the alias.
    const index = await request(fetchFn, `${base}/${EVALUATION_ALIAS}`, 'GET');
    if (index.ok) return 'concrete-index';
    const put = await request(fetchFn, `${base}/${EVALUATION_BOOTSTRAP_INDEX}`, 'PUT',
      { aliases: { [EVALUATION_ALIAS]: { is_write_index: true } } });
    if (put.ok) return 'created';
    if (/resource_already_exists_exception/.test(put.text)) return 'exists';
    throw fail(`PUT index ${EVALUATION_BOOTSTRAP_INDEX}`, put);
  });

  return result;
}

/**
 * Index template for a pipeline sink's `template_content`, as one line of JSON.
 * Managed domains: the frozen template without index_patterns (the sink sets them).
 * Serverless collections (no ISM or aliases): the same mappings for the single index named like
 * the alias, with `settings` replacing the ISM rollover setting.
 * @param {object} [settings] serverless only, e.g. `{ 'index.timestamp_field': 'time' }`
 */
export function evaluationTemplateContent(settings) {
  const { index_patterns: _ignored, ...rest } = EVALUATION_TEMPLATE;
  if (!settings) return JSON.stringify(rest);
  return JSON.stringify({
    version: rest.version,
    index_patterns: [EVALUATION_ALIAS],
    priority: rest.priority,
    template: { ...rest.template, settings },
  });
}
