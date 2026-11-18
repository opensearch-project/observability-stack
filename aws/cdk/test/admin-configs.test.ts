import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { adminConfigs, ADMIN_GROUPS, ADMIN_USERS, AppConfig } from '../custom-resources/opensearch-app/admin-configs';

const asMap = (configs: AppConfig[]) => Object.fromEntries(configs.map((c) => [c.key, JSON.parse(c.value ?? '[]')]));
const UI_ROLE = 'arn:aws:iam::123456789012:role/obs-ui-init';
const ADMIN_ROLE = 'arn:aws:iam::123456789012:role/Admin';

describe('adminConfigs', () => {
  it('puts role ARNs under dashboardAdmin.groups and none under users', () => {
    const configs = asMap(adminConfigs([UI_ROLE, ADMIN_ROLE]));
    assert.deepEqual(configs, { [ADMIN_GROUPS]: [UI_ROLE, ADMIN_ROLE] });
    assert.equal(ADMIN_GROUPS, 'opensearchDashboards.dashboardAdmin.groups');
  });

  it('keeps existing explicit admins, drops "*" and the revoked roles', () => {
    const existing: AppConfig[] = [
      { key: ADMIN_GROUPS, value: JSON.stringify(['*', 'arn:aws:iam::123456789012:role/Ops', 'arn:aws:iam::123456789012:role/Old']) },
      { key: ADMIN_USERS, value: JSON.stringify(['*', 'arn:aws:iam::123456789012:user/kyle']) },
    ];
    assert.deepEqual(asMap(adminConfigs([UI_ROLE], existing, ['arn:aws:iam::123456789012:role/Old'])), {
      [ADMIN_GROUPS]: ['arn:aws:iam::123456789012:role/Ops', UI_ROLE],
      [ADMIN_USERS]: ['arn:aws:iam::123456789012:user/kyle'],
    });
  });

  it('treats a malformed existing value as empty', () => {
    assert.deepEqual(asMap(adminConfigs([UI_ROLE], [{ key: ADMIN_GROUPS, value: 'nope' }])), { [ADMIN_GROUPS]: [UI_ROLE] });
  });
});
