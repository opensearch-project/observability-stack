/** fetch with a SigV4 signature, using the default credential chain. */
import { createHash } from 'crypto';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';

export async function signedFetch(opts: { method: 'GET' | 'POST'; url: string; body?: string; service: string; region: string }) {
  const url = new URL(opts.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });
  const request = new HttpRequest({
    method: opts.method,
    protocol: url.protocol,
    hostname: url.hostname,
    path: url.pathname,
    query,
    // OpenSearch Serverless requires the payload hash header.
    headers: { host: url.hostname, 'Content-Type': 'application/json', 'x-amz-content-sha256': createHash('sha256').update(opts.body ?? '').digest('hex') },
    body: opts.body,
  });
  const signer = new SignatureV4({ credentials: defaultProvider(), region: opts.region, service: opts.service, sha256: Sha256 });
  const signed = await signer.sign(request);
  // Send the query encoded the way SigV4 signed it (RFC 3986); URL encoding leaves ( ) ! * ' as they are.
  const rfc3986 = (v: string) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const qs = Object.entries(query).map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join('&');
  const resp = await fetch(`${url.origin}${url.pathname}${qs ? `?${qs}` : ''}`, { method: opts.method, headers: signed.headers as Record<string, string>, body: opts.body });
  return { status: resp.status, text: await resp.text() };
}
