/**
 * Scheduled handler that keeps OpenSearch UI index pattern field lists in step with the live
 * mappings. UI init stores the fields once, before telemetry has created the dynamic ones, so
 * without this the lists stay short until someone refreshes them by hand.
 *
 * Each run, for every index pattern in the workspace, it reads the live fields and appends any the
 * stored list lacks (see merge-fields.ts). When nothing is missing it writes nothing, so a quiet
 * stack costs a handful of reads every few minutes.
 */
import { createHash } from 'node:crypto';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { mergeFields, parseStoredFields } from './merge-fields';

// Same meta fields the index pattern service sends; the route rejects a partial set.
const FIELD_META_PARAMS = ['_source', '_id', '_type', '_index', '_score'].map((f) => `meta_fields=${f}`).join('&');

async function osuiRequest(method: 'GET' | 'PUT', url: string, body: unknown, region: string) {
  const bodyBytes = method === 'PUT' && body ? JSON.stringify(body) : '';
  const parsed = new URL(url);

  // Repeated params (meta_fields) are kept as arrays; collapsing them signs a different query
  // than is sent and the request is rejected.
  const query: Record<string, string | string[]> = {};
  parsed.searchParams.forEach((v, k) => {
    const prev = query[k];
    query[k] = prev === undefined ? v : ([] as string[]).concat(prev, v);
  });

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
      'x-amz-content-sha256': createHash('sha256').update(bodyBytes).digest('hex'),
    },
    body: bodyBytes || undefined,
  });
  const signed = await new SignatureV4({
    credentials: defaultProvider(), region, service: 'opensearch', sha256: Sha256,
  }).sign(request);

  const resp = await fetch(url, {
    method,
    headers: signed.headers as Record<string, string>,
    body: method === 'PUT' ? bodyBytes : undefined,
  });
  const text = await resp.text();
  try { return { status: resp.status, data: JSON.parse(text) }; } catch { return { status: resp.status, data: text }; }
}

export async function handler(): Promise<{ checked: number; updated: string[] }> {
  const { APP_ENDPOINT: base, REGION: region, WORKSPACE_ID: wsId } = process.env;
  if (!base || !region || !wsId || wsId === 'NONE') {
    console.log('No workspace to re-sync yet; skipping');
    return { checked: 0, updated: [] };
  }

  const found = await osuiRequest('GET', `${base}/w/${wsId}/api/saved_objects/_find?type=index-pattern&per_page=100`, null, region);
  if (found.status !== 200) {
    console.warn(`Listing index patterns failed: HTTP ${found.status}`);
    return { checked: 0, updated: [] };
  }

  const updated: string[] = [];
  const patterns: any[] = found.data?.saved_objects ?? [];
  for (const obj of patterns) {
    const title: string = obj.attributes?.title;
    if (!title) continue;
    const dsId = (obj.references ?? []).find((r: any) => r.type === 'data-source')?.id;
    const query = `pattern=${encodeURIComponent(title)}&${FIELD_META_PARAMS}${dsId ? `&data_source=${dsId}` : ''}`;
    const live = await osuiRequest('GET', `${base}/w/${wsId}/api/index_patterns/_fields_for_wildcard?${query}`, null, region);
    if (live.status !== 200) continue;

    const merged = mergeFields(parseStoredFields(obj.attributes?.fields), live.data?.fields ?? []);
    if (!merged) continue;

    const put = await osuiRequest('PUT', `${base}/w/${wsId}/api/saved_objects/index-pattern/${obj.id}`, {
      attributes: { fields: JSON.stringify(merged) },
    }, region);
    if (put.status === 200) updated.push(title);
    else console.warn(`Storing fields for ${title} failed: HTTP ${put.status}`);
  }

  console.log(`Checked ${patterns.length} index pattern(s); updated: ${updated.join(', ') || 'none'}`);
  return { checked: patterns.length, updated };
}
