/**
 * GenAI evaluation index custom resource handler (managed domains).
 * Creates the ISM rollover policy, the composable index template and the first index with the
 * write alias otel-v1-genai-evaluation. Runs before the OSIS pipeline: the pipeline's sink
 * creates a plain index with the alias name when it finds neither, and that blocks the alias.
 * Runs as the domain's IAM master user and signs requests with SigV4. Delete keeps the data.
 */
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

interface Props {
  OpenSearchEndpoint: string;
  Region: string;
  Alias: string;
  TemplateName: string;
  PolicyId: string;
  Template: string; // index template JSON
  Policy: string; // ISM policy JSON
}

interface Event {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResourceProperties: Props;
}

type Signer = (url: string, method: 'GET' | 'PUT', body?: string) => Promise<Response>;

export async function handler(event: Event) {
  const physicalId = event.PhysicalResourceId || 'eval-index';
  // Never delete evaluation results with the stack.
  if (event.RequestType === 'Delete') return { PhysicalResourceId: physicalId };

  const p = event.ResourceProperties;
  const result = await ensureEvaluationIndex(signerFor(p.Region), `https://${p.OpenSearchEndpoint}`, p);
  console.log(`Evaluation index: ${JSON.stringify(result)}`);
  return { PhysicalResourceId: physicalId, Data: result };
}

export async function ensureEvaluationIndex(sign: Signer, base: string, p: Props) {
  const template = JSON.parse(p.Template);
  const result: Record<string, string> = {};

  // 1. ISM policy first, so its ism_template attaches it to the first index. An existing policy is kept.
  const policyUrl = `${base}/_plugins/_ism/policies/${p.PolicyId}`;
  const policy = await retry(() => sign(policyUrl, 'GET'));
  if (policy.ok) {
    result.policy = 'exists';
  } else if (policy.status === 404) {
    const put = await retry(() => sign(policyUrl, 'PUT', p.Policy));
    const text = await put.text();
    if (!put.ok && !/version_conflict_engine_exception|resource_already_exists_exception/.test(text)) {
      throw new Error(`PUT ISM policy ${p.PolicyId} returned ${put.status}: ${text}`);
    }
    result.policy = put.ok ? 'created' : 'exists';
  } else {
    throw new Error(`GET ISM policy ${p.PolicyId} returned ${policy.status}: ${await policy.text()}`);
  }

  // 2. Index template, replaced only by a higher version (the rule Data Prepper applies)
  const templateUrl = `${base}/_index_template/${p.TemplateName}`;
  const cur = await retry(() => sign(templateUrl, 'GET'));
  let installed: number | undefined;
  if (cur.ok) {
    installed = ((await cur.json()) as any)?.index_templates?.[0]?.index_template?.version;
  } else if (cur.status !== 404) {
    throw new Error(`GET index template ${p.TemplateName} returned ${cur.status}: ${await cur.text()}`);
  }
  if (typeof installed === 'number' && installed >= template.version) {
    result.template = 'exists';
  } else {
    const put = await retry(() => sign(templateUrl, 'PUT', p.Template));
    if (!put.ok) throw new Error(`PUT index template ${p.TemplateName} returned ${put.status}: ${await put.text()}`);
    result.template = cur.ok ? 'updated' : 'created';
  }

  // 3. First rollover index with the write alias
  const alias = await retry(() => sign(`${base}/_alias/${p.Alias}`, 'GET'));
  if (alias.ok) {
    result.alias = 'exists';
  } else if (alias.status !== 404) {
    throw new Error(`GET alias ${p.Alias} returned ${alias.status}: ${await alias.text()}`);
  } else if ((await retry(() => sign(`${base}/${p.Alias}`, 'GET'))).ok) {
    // A concrete index with the alias name (from an earlier pipeline) blocks the alias; keep writing to it.
    result.alias = 'concrete-index';
  } else {
    const body = JSON.stringify({ aliases: { [p.Alias]: { is_write_index: true } } });
    const put = await retry(() => sign(`${base}/${p.Alias}-000001`, 'PUT', body));
    const text = await put.text();
    if (!put.ok && !/resource_already_exists_exception/.test(text)) {
      throw new Error(`PUT index ${p.Alias}-000001 returned ${put.status}: ${text}`);
    }
    result.alias = put.ok ? 'created' : 'exists';
  }
  return result;
}

/** Retries 5xx/429 and auth not yet propagated (401/403) right after the domain is created. */
async function retry(fn: () => Promise<Response>, attempts = 8): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const resp = await fn();
      if (i < attempts - 1 && (resp.status >= 500 || [401, 403, 429].includes(resp.status))) {
        await sleep(Math.min(30_000, 5000 * 1.6 ** i));
        continue;
      }
      return resp;
    } catch (err) {
      if (i >= attempts - 1) throw err;
      await sleep(Math.min(30_000, 5000 * 1.6 ** i));
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function signerFor(region: string): Signer {
  const signer = new SignatureV4({ credentials: defaultProvider(), region, service: 'es', sha256: Sha256 });
  return async (url, method, body) => {
    const parsed = new URL(url);
    const request = new HttpRequest({
      method,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      path: parsed.pathname,
      headers: { host: parsed.hostname, 'Content-Type': 'application/json' },
      body,
    });
    const signed = await signer.sign(request);
    return fetch(url, { method, headers: signed.headers as Record<string, string>, body });
  };
}
