/**
 * FGAC role mapping custom resource handler.
 * Maps IAM roles to OpenSearch all_access and security_manager via the Security API.
 * Ported from cli-installer/src/aws.mjs → mapOsiRoleInDomain()
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

interface Event {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResourceProperties: {
    OpenSearchEndpoint: string;
    MasterUserSecretArn: string;
    MasterUserName: string;
    RoleArns: string; // JSON array of ARNs to map
    Region: string;
  };
}

export async function handler(event: Event) {
  const { OpenSearchEndpoint, MasterUserSecretArn, MasterUserName, RoleArns, Region } = event.ResourceProperties;
  const roleArns: string[] = JSON.parse(RoleArns);

  if (event.RequestType === 'Delete') {
    // Best-effort: remove role mappings
    try {
      const password = await getMasterPassword(MasterUserSecretArn, Region);
      for (const role of ['all_access', 'security_manager']) {
        await removeMappings(`https://${OpenSearchEndpoint}`, MasterUserName, password, role, roleArns);
      }
    } catch { /* best effort */ }
    return { PhysicalResourceId: event.PhysicalResourceId || 'fgac-mapping' };
  }

  // Create or Update
  const password = await getMasterPassword(MasterUserSecretArn, Region);
  for (const role of ['all_access', 'security_manager']) {
    await addMappings(`https://${OpenSearchEndpoint}`, MasterUserName, password, role, roleArns);
  }

  return { PhysicalResourceId: event.PhysicalResourceId || 'fgac-mapping' };
}

async function getMasterPassword(secretArn: string, region: string): Promise<string> {
  const sm = new SecretsManagerClient({ region });
  const { SecretString } = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const parsed = JSON.parse(SecretString!);
  return parsed.password;
}

async function addMappings(endpoint: string, username: string, password: string, role: string, arns: string[]) {
  const url = `${endpoint}/_plugins/_security/api/rolesmapping/${role}`;
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const headers = { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` };

  // Get existing mappings
  const getResp = await fetch(url, { headers });
  let existing: string[] = [];
  if (getResp.ok) {
    const data = await getResp.json();
    existing = (data as any)?.[role]?.backend_roles || [];
  }

  const merged = [...new Set([...existing, ...arns])];
  await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify([{ op: 'add', path: '/backend_roles', value: merged }]),
  });
}

async function removeMappings(endpoint: string, username: string, password: string, role: string, arns: string[]) {
  const url = `${endpoint}/_plugins/_security/api/rolesmapping/${role}`;
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const headers = { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` };

  const getResp = await fetch(url, { headers });
  if (!getResp.ok) return;

  const data = await getResp.json();
  const existing: string[] = (data as any)?.[role]?.backend_roles || [];
  const filtered = existing.filter((r) => !arns.some((a) => r.includes(a)));

  if (filtered.length !== existing.length) {
    await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify([{ op: 'add', path: '/backend_roles', value: filtered }]),
    });
  }
}
