/**
 * Destroy all AWS resources created by the CLI for a given pipeline name.
 * Deletes in reverse dependency order: EC2 → Application → DQS → OSIS → IAM → (preserves AOS/AMP).
 */
import { OSISClient, DeletePipelineCommand, GetPipelineCommand } from '@aws-sdk/client-osis';
import { OpenSearchClient, ListApplicationsCommand, DeleteApplicationCommand, DeleteDirectQueryDataSourceCommand, GetApplicationCommand, DescribeDomainCommand, DeleteDomainCommand } from '@aws-sdk/client-opensearch';
import { IAMClient, DeleteRolePolicyCommand, DeleteRoleCommand, ListRolePoliciesCommand, ListAttachedRolePoliciesCommand, DetachRolePolicyCommand } from '@aws-sdk/client-iam';
import { printStep, printSuccess, printWarning, printInfo, createSpinner } from './ui.mjs';
import { teardownDemoInstance } from './ec2-demo.mjs';

async function cleanupFgacRoles(region, pipelineName, opensearchPassword, os) {
  try {
    const { ApplicationSummaries } = await os.send(new ListApplicationsCommand({}));
    const app = (ApplicationSummaries || []).find(a => a.name === pipelineName);
    if (!app) return;

    const { dataSources } = await os.send(new GetApplicationCommand({ id: app.id }));
    const domainArn = (dataSources || []).find(d => d.dataSourceArn?.includes(':domain/'))?.dataSourceArn;
    if (!domainArn) return;

    const domainName = domainArn.split('/').pop();
    const { DomainStatus } = await os.send(new DescribeDomainCommand({ DomainName: domainName }));
    if (!DomainStatus?.Endpoint) return;

    // Get password from Secrets Manager or flag
    let masterPass = opensearchPassword || '';
    if (!masterPass) {
      try {
        const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
        const sm = new SecretsManagerClient({ region });
        const { SecretString } = await sm.send(new GetSecretValueCommand({
          SecretId: `observability-stack/${pipelineName}/master-password`,
        }));
        masterPass = SecretString;
      } catch { /* no secret found */ }
    }
    if (!masterPass) {
      printWarning('No master password available. FGAC cleanup skipped. Pass --opensearch-password to clean up role mappings.');
      return;
    }

    const endpoint = `https://${DomainStatus.Endpoint}`;
    const url = `${endpoint}/_plugins/_security/api/rolesmapping/all_access`;
    const auth = Buffer.from(`admin:${masterPass}`).toString('base64');
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` };

    const getResp = await fetch(url, { headers });
    if (!getResp.ok) return;

    const data = await getResp.json();
    const existing = data?.all_access?.backend_roles || [];
    const filtered = existing.filter(r => !r.includes(pipelineName));

    if (filtered.length !== existing.length) {
      await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify([{ op: 'add', path: '/backend_roles', value: filtered }]),
      });
      printSuccess('FGAC backend role mappings cleaned up');
    }
  } catch (e) {
    printWarning(`FGAC cleanup: ${e.message}`);
  }
}

export async function destroy(cfg) {
  const { pipelineName, region } = cfg;
  if (!pipelineName) throw new Error('--pipeline-name is required');
  if (!region) throw new Error('--region is required');

  printStep(`Destroying resources for: ${pipelineName}`);

  // 1. EC2 demo instance + SG + instance profile
  await teardownDemoInstance(cfg);

  // 2. Clean up FGAC backend role mappings (before deleting Application)
  const os = new OpenSearchClient({ region });
  await cleanupFgacRoles(region, pipelineName, cfg.opensearchPassword, os);

  // 3. OpenSearch Application
  try {
    const { ApplicationSummaries } = await os.send(new ListApplicationsCommand({}));
    const app = (ApplicationSummaries || []).find(a => a.name === pipelineName);
    if (app) {
      const spinner = createSpinner('Deleting OpenSearch Application...');
      await os.send(new DeleteApplicationCommand({ id: app.id }));
      spinner.stop(`Application ${app.id} deleted`);
    } else {
      printInfo('No OpenSearch Application found');
    }
  } catch (e) { printWarning(`Application: ${e.message}`); }

  // 3. DQS Prometheus datasource
  const dqsName = pipelineName.replace(/-/g, '_') + '_prometheus';
  try {
    await os.send(new DeleteDirectQueryDataSourceCommand({ DataSourceName: dqsName }));
    printSuccess(`DQS datasource ${dqsName} deleted`);
  } catch (e) {
    if (!e.message?.includes('not found')) printWarning(`DQS: ${e.message}`);
    else printInfo('No DQS datasource found');
  }

  // 4. OSIS pipeline
  const osis = new OSISClient({ region });
  try {
    await osis.send(new GetPipelineCommand({ PipelineName: pipelineName }));
    const spinner = createSpinner('Deleting OSIS pipeline (takes ~5 min)...');
    await osis.send(new DeletePipelineCommand({ PipelineName: pipelineName }));
    // Poll until deleted
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 15000));
      try { await osis.send(new GetPipelineCommand({ PipelineName: pipelineName })); }
      catch { spinner.stop('OSIS pipeline deleted'); break; }
    }
  } catch (e) {
    if (e.name === 'ResourceNotFoundException') printInfo('No OSIS pipeline found');
    else printWarning(`OSIS: ${e.message}`);
  }

  // 5. IAM roles
  const iam = new IAMClient({ region });
  for (const roleName of [`${pipelineName}-osi-role`, `${pipelineName}-dqs-prometheus-role`]) {
    try {
      const { PolicyNames } = await iam.send(new ListRolePoliciesCommand({ RoleName: roleName }));
      for (const p of PolicyNames || []) {
        await iam.send(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: p }));
      }
      const { AttachedPolicies } = await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }));
      for (const p of AttachedPolicies || []) {
        await iam.send(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: p.PolicyArn }));
      }
      await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
      printSuccess(`IAM role ${roleName} deleted`);
    } catch (e) {
      if (e.name !== 'NoSuchEntityException') printWarning(`IAM ${roleName}: ${e.message}`);
    }
  }

  // 6. Secrets Manager (master password)
  try {
    const { SecretsManagerClient, DeleteSecretCommand } = await import('@aws-sdk/client-secrets-manager');
    const sm = new SecretsManagerClient({ region });
    await sm.send(new DeleteSecretCommand({
      SecretId: `observability-stack/${pipelineName}/master-password`,
      ForceDeleteWithoutRecovery: true,
    }));
    printSuccess('Master password secret deleted');
  } catch (e) {
    if (e.name !== 'ResourceNotFoundException') printWarning(`Secret cleanup: ${e.message}`);
  }

  // 7. OpenSearch domain (if tagged with this stack)
  try {
    const { ResourceGroupsTaggingAPIClient, GetResourcesCommand } = await import('@aws-sdk/client-resource-groups-tagging-api');
    const tagging = new ResourceGroupsTaggingAPIClient({ region });
    const { ResourceTagMappingList } = await tagging.send(new GetResourcesCommand({
      TagFilters: [{ Key: 'observability-stack', Values: [pipelineName] }],
      ResourceTypeFilters: ['es:domain'],
    }));
    for (const r of ResourceTagMappingList || []) {
      const domainName = r.ResourceARN.split('/').pop();
      await os.send(new DeleteDomainCommand({ DomainName: domainName }));
      printSuccess(`OpenSearch domain '${domainName}' deletion initiated`);
    }
  } catch (e) { printWarning(`Domain cleanup: ${e.message}`); }

  // 8. AMP workspace (if tagged with this stack)
  try {
    const { AmpClient, ListWorkspacesCommand, DeleteWorkspaceCommand } = await import('@aws-sdk/client-amp');
    const amp = new AmpClient({ region });
    const { workspaces } = await amp.send(new ListWorkspacesCommand({ alias: pipelineName }));
    for (const w of workspaces || []) {
      if (w.alias === pipelineName) {
        await amp.send(new DeleteWorkspaceCommand({ workspaceId: w.workspaceId }));
        printSuccess(`AMP workspace '${w.alias}' deleted`);
      }
    }
  } catch (e) { printWarning(`AMP cleanup: ${e.message}`); }

  console.error();
  printSuccess('Destroy complete');
}
