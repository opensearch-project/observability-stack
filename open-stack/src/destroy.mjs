/**
 * Destroy all AWS resources created by open-stack for a given pipeline name.
 * Deletes in reverse dependency order: EC2 → Application → DQS → OSIS → IAM → (preserves AOS/AMP).
 */
import { OSISClient, DeletePipelineCommand, GetPipelineCommand } from '@aws-sdk/client-osis';
import { OpenSearchClient, ListApplicationsCommand, DeleteApplicationCommand, DeleteDirectQueryDataSourceCommand } from '@aws-sdk/client-opensearch';
import { IAMClient, DeleteRolePolicyCommand, DeleteRoleCommand, ListRolePoliciesCommand } from '@aws-sdk/client-iam';
import { printStep, printSuccess, printWarning, printInfo, createSpinner } from './ui.mjs';
import { teardownDemoInstance } from './ec2-demo.mjs';

export async function destroy(cfg) {
  const { pipelineName, region } = cfg;
  if (!pipelineName) throw new Error('--pipeline-name is required');
  if (!region) throw new Error('--region is required');

  printStep(`Destroying resources for: ${pipelineName}`);

  // 1. EC2 demo instance + SG + instance profile
  await teardownDemoInstance(cfg);

  // 2. OpenSearch Application
  const os = new OpenSearchClient({ region });
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
      await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
      printSuccess(`IAM role ${roleName} deleted`);
    } catch (e) {
      if (e.name !== 'NoSuchEntityException') printWarning(`IAM ${roleName}: ${e.message}`);
    }
  }

  console.error();
  printSuccess('Destroy complete');
  printInfo('Note: OpenSearch domain and AMP workspace were preserved (shared resources)');
}
