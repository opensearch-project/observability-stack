/**
 * FGAC role mapping custom resource handler.
 * Maps IAM roles to OpenSearch security roles via the Security API: all_access and
 * security_manager by default, or the roles in FgacRoles (for example ["readall"] for a
 * read-only caller).
 * Runs as the domain's IAM master user and signs requests with SigV4.
 */
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { invocationSignal, withCfnResponse } from '../shared/cfn-response';

interface Props {
  OpenSearchEndpoint: string;
  RoleArns: string; // JSON array of ARNs to map
  Region: string;
  FgacRoles?: string; // JSON array of security role names; default all_access + security_manager
}

interface Event {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResourceProperties: Props;
  OldResourceProperties?: Props;
}

const IAM_ROLE_ARN = /^arn:aws[a-z-]*:iam::\d{12}:role\/[\w+=,.@\/-]+$/;

/**
 * Returns the concrete IAM role ARNs in a RoleArns JSON array. backend_roles entries are
 * matched as patterns, so other entries are skipped. Never throws: CloudFormation sends
 * pre-upgrade properties on Delete and on rollback Updates.
 */
export function parseRoleArns(raw: string | undefined): string[] {
  let arns: unknown;
  try { arns = JSON.parse(raw ?? '[]'); } catch { arns = []; }
  if (!Array.isArray(arns)) return [];
  const valid = arns.filter((a): a is string => typeof a === 'string' && IAM_ROLE_ARN.test(a));
  const skipped = arns.filter((a) => !valid.includes(a as string));
  if (skipped.length) console.log(`Skipping RoleArns entries that are not IAM role ARNs: ${JSON.stringify(skipped)}`);
  return valid;
}

const DEFAULT_FGAC_ROLES = ['all_access', 'security_manager'];
const SECURITY_ROLE_NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * The security roles to map: all_access and security_manager when FgacRoles is absent, else the
 * role names it lists. A set but unusable FgacRoles throws, so a typo never grants admin.
 */
export function parseFgacRoles(raw: string | undefined): string[] {
  if (raw === undefined || raw === '') return DEFAULT_FGAC_ROLES;
  let names: unknown;
  try { names = JSON.parse(raw); } catch { names = undefined; }
  const valid = Array.isArray(names) && names.length > 0
    && names.every((n) => typeof n === 'string' && SECURITY_ROLE_NAME.test(n));
  if (!valid) throw new Error(`FgacRoles must be a JSON array of security role names: ${raw}`);
  return [...new Set(names as string[])];
}

function oldFgacRoles(raw: string | undefined): string[] {
  try { return parseFgacRoles(raw); } catch { return []; }
}

/** Backend roles after an update: existing entries minus revoked ones and '*', plus the new set. */
export function mergeBackendRoles(existing: string[], add: string[], revoke: string[]): string[] {
  const kept = existing.filter((r) => r !== '*' && !revoke.includes(r));
  return [...new Set([...kept, ...add])];
}

export async function handler(event: Event, context?: { getRemainingTimeInMillis(): number }) {
  const { OpenSearchEndpoint, RoleArns, Region, FgacRoles } = event.ResourceProperties;
  const roleArns = parseRoleArns(RoleArns);
  const fgacRoles = parseFgacRoles(FgacRoles);
  const base = `https://${OpenSearchEndpoint}`;
  // Leave 30 seconds for the response before the function times out.
  const deadline = Date.now() + (context?.getRemainingTimeInMillis() ?? 300_000) - 30_000;
  const sign = withRetry(signerFor(Region), deadline);

  if (event.RequestType === 'Delete') {
    // Best-effort: remove role mappings
    try {
      // No retries: the domain may already be unreachable, and this must not hold up the stack delete.
      const once = signerFor(Region);
      for (const role of fgacRoles) {
        await removeMappings(once, base, role, roleArns);
      }
    } catch { /* best effort */ }
    return { PhysicalResourceId: event.PhysicalResourceId || 'fgac-mapping' };
  }

  // On Update, roles this resource mapped before but no longer lists are removed.
  const revoked = event.RequestType === 'Update'
    ? parseRoleArns(event.OldResourceProperties?.RoleArns).filter((r) => !roleArns.includes(r))
    : [];
  // Security roles this resource mapped before but no longer lists lose all of its ARNs.
  const droppedRoles = event.RequestType === 'Update'
    ? oldFgacRoles(event.OldResourceProperties?.FgacRoles).filter((r) => !fgacRoles.includes(r))
    : [];
  for (const role of droppedRoles) {
    await removeMappings(sign, base, role, [...roleArns, ...revoked]);
  }
  for (const role of fgacRoles) {
    const existing = await getBackendRoles(sign, base, role);
    await putBackendRoles(sign, base, role, mergeBackendRoles(existing, roleArns, revoked));
  }

  return { PhysicalResourceId: event.PhysicalResourceId || 'fgac-mapping' };
}

type Signer = (url: string, method: 'GET' | 'PATCH' | 'PUT', body?: string) => Promise<Response>;

const RETRY_MS = 10_000;

/**
 * Retries a request that fails with 401, 403, 429, a 5xx or a network error until `deadline`: a new domain reports
 * ACTIVE before its security API accepts the master user.
 */
export function withRetry(sign: Signer, deadline: number, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Signer {
  return async (url, method, body) => {
    for (;;) {
      const resp = await sign(url, method, body).catch((e: Error) => e);
      const retryable = resp instanceof Error || [401, 403, 429].includes(resp.status) || resp.status >= 500;
      if (!retryable || Date.now() + RETRY_MS > deadline) {
        if (resp instanceof Error) throw resp;
        return resp;
      }
      console.log(`${method} ${new URL(url).pathname}: ${resp instanceof Error ? resp.message : resp.status}, retrying`);
      await sleep(RETRY_MS);
    }
  };
}

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
    return fetch(url, { method, headers: signed.headers as Record<string, string>, body, signal: invocationSignal() });
  };
}

async function getBackendRoles(sign: Signer, base: string, role: string): Promise<string[]> {
  const resp = await sign(`${base}/_plugins/_security/api/rolesmapping/${role}`, 'GET');
  if (resp.status === 404) return [];
  if (!resp.ok) throw new Error(`GET rolesmapping/${role} returned ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data as any)?.[role]?.backend_roles || [];
}

export async function putBackendRoles(sign: Signer, base: string, role: string, roles: string[]) {
  const url = `${base}/_plugins/_security/api/rolesmapping/${role}`;
  let resp = await sign(url, 'PATCH', JSON.stringify([{ op: 'add', path: '/backend_roles', value: roles }]));
  // A role with no mapping yet (readall on a new domain) cannot be patched: create the mapping.
  if (resp.status === 404) resp = await sign(url, 'PUT', JSON.stringify({ backend_roles: roles }));
  if (!resp.ok) throw new Error(`PATCH rolesmapping/${role} returned ${resp.status}: ${await resp.text()}`);
}

async function removeMappings(sign: Signer, base: string, role: string, arns: string[]) {
  const existing = await getBackendRoles(sign, base, role);
  const filtered = existing.filter((r) => !arns.includes(r));
  if (filtered.length !== existing.length) await putBackendRoles(sign, base, role, filtered);
}

/** Entry point when CloudFormation invokes the function directly. */
export const cfnHandler = withCfnResponse(handler);
