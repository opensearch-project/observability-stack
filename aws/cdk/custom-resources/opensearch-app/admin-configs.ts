/** An OpenSearch UI application config entry (the SDK's AppConfig shape). */
export interface AppConfig {
  key?: string;
  value?: string;
}

export const ADMIN_USERS = 'opensearchDashboards.dashboardAdmin.users';
export const ADMIN_GROUPS = 'opensearchDashboards.dashboardAdmin.groups';

function readList(configs: AppConfig[] | undefined, key: string): string[] {
  const c = configs?.find((x) => x.key === key);
  try { return c?.value ? JSON.parse(c.value) : []; } catch { return []; }
}

/**
 * Admin appConfigs: existing explicit admins minus `revoked`, plus adminRoleArns as `groups`.
 * IAM role ARNs go under `groups`; `users` only takes IAM user ARNs, so it keeps the existing
 * explicit users and never gets a role.
 */
export function adminConfigs(adminRoleArns: string[], existing: AppConfig[] = [], revoked: string[] = []): AppConfig[] {
  const kept = readList(existing, ADMIN_GROUPS).filter((g) => g !== '*' && !revoked.includes(g));
  const groups = [...new Set([...kept, ...adminRoleArns])];
  const users = readList(existing, ADMIN_USERS).filter((u) => u !== '*');
  const configs: AppConfig[] = [{ key: ADMIN_GROUPS, value: JSON.stringify(groups) }];
  if (users.length) configs.push({ key: ADMIN_USERS, value: JSON.stringify(users) });
  return configs;
}
