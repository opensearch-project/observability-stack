/**
 * Index retention custom resource handler (OpenSearch Serverless time series collections).
 * Sets the index.data.retention setting on each index; collections have no ISM. The pipeline creates the
 * indices when it starts, so a missing index is retried until it exists. Delete keeps the data and the setting.
 */
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { withCfnResponse } from '../shared/cfn-response';

interface Props {
  CollectionEndpoint: string;
  Region: string;
  IndexNames: string[];
  RetentionDays: string;
}

interface Event {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResourceProperties: Props;
}

export type Signer = (url: string, method: 'PUT', body: string) => Promise<Response>;

const RETRY_MS = 15_000;

export async function handler(event: Event, context?: { getRemainingTimeInMillis(): number }) {
  const physicalId = event.PhysicalResourceId || 'index-retention';
  if (event.RequestType === 'Delete') return { PhysicalResourceId: physicalId };
  const p = event.ResourceProperties;
  // Leave a minute for the response before the function times out.
  const deadline = Date.now() + (context?.getRemainingTimeInMillis() ?? 600_000) - 60_000;
  const result = await applyRetention(signerFor(p.Region), p.CollectionEndpoint, p.IndexNames, p.RetentionDays, deadline);
  return { PhysicalResourceId: physicalId, Data: result };
}

/**
 * Sets index.data.retention on every index, retrying each until it exists or `deadline` passes. The setting takes a
 * whole number of days ("30"; "30d" is rejected) and reads back as "30d".
 */
export async function applyRetention(
  sign: Signer, endpoint: string, indexNames: string[], days: string, deadline: number,
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<Record<string, string>> {
  const body = JSON.stringify({ 'index.data.retention': String(days) });
  const result: Record<string, string> = {};
  for (const index of indexNames) {
    for (let last = '';;) {
      const resp = await sign(`${endpoint}/${index}/_settings`, 'PUT', body).catch((e: Error) => e);
      if (!(resp instanceof Error) && resp.ok) {
        result[index] = `${days}d`;
        break;
      }
      last = resp instanceof Error ? resp.message : `${resp.status} ${(await resp.text()).slice(0, 200)}`;
      console.log(`retention on ${index} not set yet: ${last}`);
      // Retry a missing index (404), data access still propagating (403), server errors and network errors only.
      const retryable = resp instanceof Error || [403, 404, 429].includes(resp.status) || resp.status >= 500;
      if (!retryable || Date.now() + RETRY_MS > deadline) throw new Error(`could not set retention on ${index}: ${last}`);
      await sleep(RETRY_MS);
    }
  }
  return result;
}

function signerFor(region: string): Signer {
  const signer = new SignatureV4({ credentials: defaultProvider(), region, service: 'aoss', sha256: Sha256 });
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

/** Entry point when CloudFormation invokes the function directly. */
export const cfnHandler = withCfnResponse(handler);
