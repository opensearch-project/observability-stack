/**
 * FGAC role mapping custom resource handler.
 * Maps IAM roles to OpenSearch all_access and security_manager via the Security API.
 * Runs as the domain's IAM master user and signs requests with SigV4.
 */
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

interface Props {
  OpenSearchEndpoint: string;
  RoleArns: string; // JSON array of ARNs to map
  Region: string;
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

/** Backend roles after an update: existing entries minus revoked ones and '*', plus the new set. */
export function mergeBackendRoles(existing: string[], add: string[], revoke: string[]): string[] {
  const kept = existing.filter((r) => r !== '*' && !revoke.includes(r));
  return [...new Set([...kept, ...add])];
}

export async function handler(event: Event) {
  const { OpenSearchEndpoint, RoleArns, Region } = event.ResourceProperties;
  const roleArns = parseRoleArns(RoleArns);
  const base = `https://${OpenSearchEndpoint}`;
  const sign = signerFor(Region);

  if (event.RequestType === 'Delete') {
    // Best-effort: remove role mappings
    try {
      for (const role of FGAC_ROLES) {
        await removeMappings(sign, base, role, roleArns);
      }
    } catch { /* best effort */ }
    return { PhysicalResourceId: event.PhysicalResourceId || 'fgac-mapping' };
  }

  // On Update, roles this resource mapped before but no longer lists are removed.
  const revoked = event.RequestType === 'Update'
    ? parseRoleArns(event.OldResourceProperties?.RoleArns).filter((r) => !roleArns.includes(r))
    : [];
  for (const role of FGAC_ROLES) {
    const existing = await getBackendRoles(sign, base, role);
    await putBackendRoles(sign, base, role, mergeBackendRoles(existing, roleArns, revoked));
  }

  return { PhysicalResourceId: event.PhysicalResourceId || 'fgac-mapping' };
}

const FGAC_ROLES = ['all_access', 'security_manager'];
type Signer = (url: string, method: 'GET' | 'PATCH', body?: string) => Promise<Response>;

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

async function getBackendRoles(sign: Signer, base: string, role: string): Promise<string[]> {
  const resp = await sign(`${base}/_plugins/_security/api/rolesmapping/${role}`, 'GET');
  if (resp.status === 404) return [];
  if (!resp.ok) throw new Error(`GET rolesmapping/${role} returned ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return (data as any)?.[role]?.backend_roles || [];
}

async function putBackendRoles(sign: Signer, base: string, role: string, roles: string[]) {
  const resp = await sign(`${base}/_plugins/_security/api/rolesmapping/${role}`, 'PATCH',
    JSON.stringify([{ op: 'add', path: '/backend_roles', value: roles }]));
  if (!resp.ok) throw new Error(`PATCH rolesmapping/${role} returned ${resp.status}: ${await resp.text()}`);
}

async function removeMappings(sign: Signer, base: string, role: string, arns: string[]) {
  const existing = await getBackendRoles(sign, base, role);
  const filtered = existing.filter((r) => !arns.includes(r));
  if (filtered.length !== existing.length) await putBackendRoles(sign, base, role, filtered);
}
