import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import {
  OpenSearchClient,
  CreateDomainCommand,
  DescribeDomainCommand,
  ListDomainNamesCommand,
  DescribeDomainsCommand,
  AddDirectQueryDataSourceCommand,
  GetDirectQueryDataSourceCommand,
  CreateApplicationCommand,
  GetApplicationCommand,
  UpdateApplicationCommand,
  ListApplicationsCommand,
} from '@aws-sdk/client-opensearch';
import {
  OpenSearchServerlessClient,
  ListCollectionsCommand as ListServerlessCollectionsCommand,
  CreateCollectionCommand,
  BatchGetCollectionCommand,
  CreateSecurityPolicyCommand,
  CreateAccessPolicyCommand,
} from '@aws-sdk/client-opensearchserverless';
import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  PutRolePolicyCommand,
  ListRolesCommand,
} from '@aws-sdk/client-iam';
import {
  AmpClient,
  ListWorkspacesCommand,
  CreateWorkspaceCommand,
  DescribeWorkspaceCommand,
} from '@aws-sdk/client-amp';
import {
  OSISClient,
  ListPipelinesCommand,
  CreatePipelineCommand,
  GetPipelineCommand,
} from '@aws-sdk/client-osis';
import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
  TagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import {
  printStep,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  createSpinner,
} from './ui.mjs';
import chalk from 'chalk';

// ── Tagging ─────────────────────────────────────────────────────────────────

const TAG_KEY = 'open-stack';

function stackTags(stackName) {
  return [{ Key: TAG_KEY, Value: stackName }];
}

// ── Prerequisites ───────────────────────────────────────────────────────────

export async function checkRequirements(cfg) {
  printStep('Checking prerequisites...');
  console.error();

  // 1. Credentials + account ID
  const sts = new STSClient({ region: cfg.region });
  let identity;
  try {
    identity = await sts.send(new GetCallerIdentityCommand({}));
  } catch (err) {
    printError('AWS credentials are not configured or have expired');
    console.error();
    if (/unable to locate credentials|no credentials/i.test(err.message)) {
      console.error(`  ${chalk.bold('No credentials found. Set up AWS access:')}`);
      console.error();
      console.error(`  ${chalk.dim('Option A — Configure long-term credentials:')}`);
      console.error(`     ${chalk.bold('aws configure')}`);
      console.error();
      console.error(`  ${chalk.dim('Option B — Use IAM Identity Center (SSO):')}`);
      console.error(`     ${chalk.bold('aws configure sso')}`);
      console.error(`     ${chalk.bold('aws sso login --profile <your-profile>')}`);
      console.error();
      console.error(`  ${chalk.dim('Option C — Export temporary credentials:')}`);
      console.error(`     ${chalk.bold('export AWS_ACCESS_KEY_ID=<key>')}`);
      console.error(`     ${chalk.bold('export AWS_SECRET_ACCESS_KEY=<secret>')}`);
      console.error(`     ${chalk.bold('export AWS_SESSION_TOKEN=<token>')}  ${chalk.dim('(if using temporary creds)')}`);
      console.error();
      console.error(`  ${chalk.dim('Docs:')} ${chalk.underline('https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html#getting-started-quickstart-new-command')}`);
    } else if (/expired|ExpiredToken/i.test(err.message)) {
      console.error(`  ${chalk.bold('Your session has expired. Refresh credentials:')}`);
      console.error();
      console.error(`  ${chalk.dim('If using SSO:')}         ${chalk.bold('aws sso login')}`);
      console.error(`  ${chalk.dim('If using profiles:')}    ${chalk.bold('aws sts get-session-token')}`);
      console.error(`  ${chalk.dim('If using assume-role:')} re-run your assume-role command`);
    } else {
      console.error(`  ${chalk.bold('Authentication failed:')}`);
      console.error(`  ${chalk.dim(err.message)}`);
      console.error();
      console.error(`  ${chalk.bold('Try:')}`);
      console.error(`     ${chalk.bold('aws configure')}        ${chalk.dim('— set up credentials')}`);
      console.error(`     ${chalk.bold('aws sso login')}        ${chalk.dim('— refresh SSO session')}`);
      console.error();
      console.error(`  ${chalk.dim('Docs:')} ${chalk.underline('https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html#getting-started-quickstart-new-command')}`);
    }
    console.error();
    throw new Error('AWS credentials are not configured or have expired');
  }

  cfg.accountId = identity.Account;
  // Extract the IAM role ARN from the caller identity for FGAC and OpenSearch UI access
  // identity.Arn is like arn:aws:sts::123:assumed-role/RoleName/session
  const arnMatch = identity.Arn.match(/assumed-role\/([^/]+)\//);
  if (arnMatch) {
    cfg.callerRoleArn = `arn:aws:iam::${cfg.accountId}:role/${arnMatch[1]}`;
  }
  printSuccess(`Authenticated — account ${cfg.accountId}`);
  printInfo(`Identity: ${identity.Arn}`);

  // 2. Quick OSIS access check
  const osis = new OSISClient({ region: cfg.region });
  try {
    await osis.send(new ListPipelinesCommand({ MaxResults: 1 }));
    printSuccess(`OSI service accessible in ${cfg.region}`);
  } catch {
    printWarning(`Cannot list OSI pipelines in ${cfg.region} — you may lack osis:* permissions`);
    printInfo('The script will attempt to proceed, but resource creation may fail.');
    printInfo('Required IAM actions: es:*, iam:CreateRole, iam:PutRolePolicy, aps:*, osis:*');
  }

  console.error();
}

// ── OpenSearch (managed domain OR serverless collection) ────────────────────

export async function createOpenSearch(cfg) {
  if (cfg.serverless) {
    return createServerlessCollection(cfg);
  }
  return createManagedDomain(cfg);
}

async function createServerlessCollection(cfg) {
  const collectionName = cfg.osDomainName;
  printStep(`Creating OpenSearch Serverless collection '${collectionName}'...`);
  console.error();

  const client = new OpenSearchServerlessClient({ region: cfg.region });

  // Check if collection already exists
  try {
    const resp = await client.send(new BatchGetCollectionCommand({ names: [collectionName] }));
    const existing = resp.collectionDetails?.[0];
    if (existing) {
      if (existing.collectionEndpoint) {
        cfg.opensearchEndpoint = existing.collectionEndpoint;
        printSuccess(`Collection '${collectionName}' already exists: ${cfg.opensearchEndpoint}`);
        return;
      }
      printSuccess(`Collection '${collectionName}' already exists — waiting for endpoint`);
    }
  } catch { /* not found — proceed to create */ }

  // Create required security policies before the collection
  if (!cfg.opensearchEndpoint) {
    await ensureServerlessPolicies(client, collectionName, cfg);

    try {
      await client.send(new CreateCollectionCommand({
        name: collectionName,
        type: 'TIMESERIES',
        tags: stackTags(cfg.pipelineName).map((t) => ({ key: t.Key, value: t.Value })),
      }));
      printSuccess('Collection creation initiated — waiting for endpoint');
    } catch (err) {
      if (err.name !== 'ConflictException') {
        printError('Failed to create OpenSearch Serverless collection');
        console.error();
        if (/AccessDenied|not authorized/i.test(err.message)) {
          console.error(`  ${chalk.bold('Permission denied.')} Your IAM identity needs ${chalk.bold('aoss:CreateCollection')}.`);
        } else {
          console.error(`  ${chalk.dim(err.message)}`);
        }
        console.error();
        throw new Error('Failed to create OpenSearch Serverless collection');
      }
    }
  }

  // Poll for endpoint
  const spinner = createSpinner('Provisioning Serverless collection...');
  spinner.start();
  const maxWait = 300_000; // 5 min (serverless is faster than managed)
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    try {
      const resp = await client.send(new BatchGetCollectionCommand({ names: [collectionName] }));
      const coll = resp.collectionDetails?.[0];
      if (coll?.collectionEndpoint) {
        cfg.opensearchEndpoint = coll.collectionEndpoint;
        spinner.succeed(`Collection ready: ${cfg.opensearchEndpoint}`);
        return;
      }
      if (coll?.status === 'FAILED') {
        spinner.fail('Collection creation failed');
        printInfo(`Status: ${coll.status}`);
        throw new Error('OpenSearch Serverless collection creation failed');
      }
    } catch { /* keep polling */ }
    await sleepWithTicker(10_000, spinner, start,
      (s) => `Provisioning Serverless collection... (${fmtElapsed(s)} elapsed)`);
  }

  spinner.fail('Timed out waiting for Serverless collection');
  throw new Error('Timed out waiting for Serverless collection');
}

/**
 * Create encryption, network, and data-access policies required by Serverless.
 * Each policy is idempotent — ConflictException (already exists) is ignored.
 */
async function ensureServerlessPolicies(client, collectionName, cfg) {
  const policyName = `${collectionName}-policy`;

  // 1. Encryption policy (required before collection creation)
  try {
    await client.send(new CreateSecurityPolicyCommand({
      name: `${collectionName}-enc`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [{ ResourceType: 'collection', Resource: [`collection/${collectionName}`] }],
        AWSOwnedKey: true,
      }),
    }));
    printSuccess('Encryption policy created');
  } catch (err) {
    if (err.name !== 'ConflictException') throw err;
    printSuccess('Encryption policy already exists');
  }

  // 2. Network policy (public access for simplicity — matches managed domain defaults)
  try {
    await client.send(new CreateSecurityPolicyCommand({
      name: `${collectionName}-net`,
      type: 'network',
      policy: JSON.stringify([{
        Rules: [
          { ResourceType: 'collection', Resource: [`collection/${collectionName}`] },
          { ResourceType: 'dashboard', Resource: [`collection/${collectionName}`] },
        ],
        AllowFromPublic: true,
      }]),
    }));
    printSuccess('Network policy created');
  } catch (err) {
    if (err.name !== 'ConflictException') throw err;
    printSuccess('Network policy already exists');
  }

  // 3. Data access policy — grant the OSI pipeline role + current caller access
  const principals = [`arn:aws:iam::${cfg.accountId}:root`];
  if (cfg.iamRoleArn) {
    principals.push(cfg.iamRoleArn);
  } else if (cfg.iamRoleName) {
    principals.push(`arn:aws:iam::${cfg.accountId}:role/${cfg.iamRoleName}`);
  }

  try {
    await client.send(new CreateAccessPolicyCommand({
      name: policyName,
      type: 'data',
      policy: JSON.stringify([{
        Rules: [
          {
            ResourceType: 'index',
            Resource: [`index/${collectionName}/*`],
            Permission: ['aoss:CreateIndex', 'aoss:UpdateIndex', 'aoss:DescribeIndex', 'aoss:ReadDocument', 'aoss:WriteDocument'],
          },
          {
            ResourceType: 'collection',
            Resource: [`collection/${collectionName}`],
            Permission: ['aoss:CreateCollectionItems', 'aoss:UpdateCollectionItems', 'aoss:DescribeCollectionItems'],
          },
        ],
        Principal: principals,
      }]),
    }));
    printSuccess('Data access policy created');
  } catch (err) {
    if (err.name !== 'ConflictException') throw err;
    printSuccess('Data access policy already exists');
  }
}

async function createManagedDomain(cfg) {
  printStep(`Creating OpenSearch domain '${cfg.osDomainName}'...`);
  console.error();

  const client = new OpenSearchClient({ region: cfg.region });

  // Check if domain already exists
  try {
    const desc = await client.send(new DescribeDomainCommand({ DomainName: cfg.osDomainName }));
    const endpoint = desc.DomainStatus?.Endpoint;
    if (endpoint) {
      cfg.opensearchEndpoint = `https://${endpoint}`;
      printSuccess(`Domain '${cfg.osDomainName}' already exists: ${cfg.opensearchEndpoint}`);
      return;
    }
    printSuccess(`Domain '${cfg.osDomainName}' already exists — waiting for endpoint`);
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;

    const accessPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { AWS: '*' },
        Action: 'es:*',
        Resource: `arn:aws:es:${cfg.region}:${cfg.accountId}:domain/${cfg.osDomainName}/*`,
      }],
    });

    try {
      await client.send(new CreateDomainCommand({
        DomainName: cfg.osDomainName,
        EngineVersion: cfg.osEngineVersion,
        ClusterConfig: {
          InstanceType: cfg.osInstanceType,
          InstanceCount: cfg.osInstanceCount,
        },
        EBSOptions: {
          EBSEnabled: true,
          VolumeType: 'gp3',
          VolumeSize: cfg.osVolumeSize,
        },
        NodeToNodeEncryptionOptions: { Enabled: true },
        EncryptionAtRestOptions: { Enabled: true },
        DomainEndpointOptions: { EnforceHTTPS: true },
        AdvancedSecurityOptions: {
          Enabled: true,
          InternalUserDatabaseEnabled: true,
          MasterUserOptions: {
            MasterUserName: 'admin',
            MasterUserPassword: 'Admin_password_123!@#',
          },
        },
        AccessPolicies: accessPolicy,
        TagList: stackTags(cfg.pipelineName),
      }));
      printSuccess('Domain creation initiated — waiting for endpoint');
    } catch (createErr) {
      printError('Failed to create OpenSearch domain');
      console.error();
      if (/AccessDeniedException|not authorized/i.test(createErr.message)) {
        console.error(`  ${chalk.bold('Permission denied.')} Your IAM identity needs the ${chalk.bold('es:CreateDomain')} action.`);
      } else {
        console.error(`  ${chalk.dim(createErr.message)}`);
      }
      console.error();
      throw new Error('Failed to create OpenSearch domain');
    }
  }

  // Poll for endpoint
  const spinner = createSpinner('Provisioning OpenSearch domain (15-20 min)...');
  spinner.start();
  const maxWait = 1200_000; // 20 min
  const interval = 10_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    try {
      const desc = await client.send(new DescribeDomainCommand({ DomainName: cfg.osDomainName }));
      const endpoint = desc.DomainStatus?.Endpoint;
      if (endpoint) {
        cfg.opensearchEndpoint = `https://${endpoint}`;
        spinner.succeed(`Domain ready: ${cfg.opensearchEndpoint}`);
        return;
      }
    } catch { /* keep polling */ }
    await sleepWithTicker(interval, spinner, start,
      (s) => `Provisioning OpenSearch domain... (${fmtElapsed(s)} elapsed)`);
  }

  spinner.fail('Timed out waiting for OpenSearch domain');
  throw new Error('Timed out waiting for OpenSearch domain');
}

// ── FGAC role mapping for managed domains ────────────────────────────────

const MANAGED_MASTER_USER = 'admin';
const MANAGED_MASTER_PASS = 'Admin_password_123!@#';

/**
 * Map the OSI pipeline's IAM role to the all_access backend role in OpenSearch's
 * fine-grained access control. Without this, the pipeline can connect to the
 * managed domain but has no permissions to create indices or write data.
 */
export async function mapOsiRoleInDomain(cfg) {
  if (cfg.serverless || !cfg.opensearchEndpoint || !cfg.iamRoleArn) return;

  printStep('Mapping roles in OpenSearch FGAC...');

  const url = `${cfg.opensearchEndpoint}/_plugins/_security/api/rolesmapping/all_access`;
  const auth = Buffer.from(`${MANAGED_MASTER_USER}:${MANAGED_MASTER_PASS}`).toString('base64');

  // Map both the OSI pipeline role and the caller's role (for OpenSearch UI access)
  const callerRoleArn = cfg.callerRoleArn || '';
  const backendRoles = [cfg.iamRoleArn];
  if (callerRoleArn && callerRoleArn !== cfg.iamRoleArn) {
    backendRoles.push(callerRoleArn);
  }

  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify([
        { op: 'add', path: '/backend_roles', value: backendRoles },
      ]),
    });

    if (resp.ok) {
      printSuccess(`OSI role mapped to all_access in OpenSearch`);
    } else {
      const body = await resp.text();
      printWarning(`FGAC mapping returned ${resp.status}: ${body}`);
      printInfo('You may need to manually map the IAM role in OpenSearch UI → Security → Roles');
    }
  } catch (err) {
    printWarning(`Could not map OSI role in FGAC: ${err.message}`);
    printInfo('You may need to manually map the IAM role in OpenSearch UI → Security → Roles');
  }
}

// ── IAM role ────────────────────────────────────────────────────────────────

export async function createIamRole(cfg) {
  printStep(`Creating IAM role '${cfg.iamRoleName}'...`);

  const client = new IAMClient({ region: cfg.region });

  // Check if role already exists
  try {
    const existing = await client.send(new GetRoleCommand({ RoleName: cfg.iamRoleName }));
    cfg.iamRoleArn = existing.Role.Arn;
    printSuccess(`Role already exists: ${cfg.iamRoleArn}`);
    return;
  } catch (err) {
    if (err.name !== 'NoSuchEntityException') throw err;
  }

  // Trust policy
  const trustPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { Service: 'osis-pipelines.amazonaws.com' },
      Action: 'sts:AssumeRole',
    }],
  });

  try {
    const result = await client.send(new CreateRoleCommand({
      RoleName: cfg.iamRoleName,
      AssumeRolePolicyDocument: trustPolicy,
      Tags: stackTags(cfg.pipelineName),
    }));
    cfg.iamRoleArn = result.Role.Arn;
    printSuccess(`Role created: ${cfg.iamRoleArn}`);
  } catch (err) {
    printError('Failed to create IAM role');
    console.error();
    if (/AccessDenied|not authorized/i.test(err.message)) {
      console.error(`  ${chalk.bold('Permission denied.')} Your IAM identity needs ${chalk.bold('iam:CreateRole')}.`);
    } else {
      console.error(`  ${chalk.dim(err.message)}`);
    }
    console.error();
    throw new Error('Failed to create IAM role');
  }

  // Permissions policy — includes both managed (es:*) and serverless (aoss:*) access
  const statements = [
    {
      Effect: 'Allow',
      Action: ['es:DescribeDomain', 'es:ESHttp*'],
      Resource: `arn:aws:es:${cfg.region}:${cfg.accountId}:domain/*`,
    },
    {
      Effect: 'Allow',
      Action: ['aps:RemoteWrite'],
      Resource: `arn:aws:aps:${cfg.region}:${cfg.accountId}:workspace/*`,
    },
  ];

  // Add AOSS permissions for serverless collections
  if (cfg.serverless) {
    statements.push({
      Effect: 'Allow',
      Action: ['aoss:BatchGetCollection', 'aoss:APIAccessAll'],
      Resource: `arn:aws:aoss:${cfg.region}:${cfg.accountId}:collection/*`,
    });
  }

  const permissionsPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: statements,
  });

  try {
    await client.send(new PutRolePolicyCommand({
      RoleName: cfg.iamRoleName,
      PolicyName: `${cfg.iamRoleName}-policy`,
      PolicyDocument: permissionsPolicy,
    }));
    printSuccess('Permissions policy attached');
  } catch (err) {
    printError('Failed to attach permissions policy');
    console.error(`  ${chalk.dim(err.message)}`);
    console.error();
    throw new Error('Failed to attach IAM permissions policy');
  }

  // Give IAM a moment to propagate
  await sleep(5000);
}

// ── APS workspace ───────────────────────────────────────────────────────────

export async function createApsWorkspace(cfg) {
  printStep(`Creating APS workspace '${cfg.apsWorkspaceAlias}'...`);

  const client = new AmpClient({ region: cfg.region });

  // Check if workspace already exists
  try {
    const list = await client.send(new ListWorkspacesCommand({ alias: cfg.apsWorkspaceAlias }));
    const existing = list.workspaces?.[0];
    if (existing?.workspaceId) {
      cfg.apsWorkspaceId = existing.workspaceId;
      cfg.prometheusUrl = `https://aps-workspaces.${cfg.region}.amazonaws.com/workspaces/${cfg.apsWorkspaceId}/api/v1/remote_write`;
      printSuccess(`Workspace already exists: ${cfg.apsWorkspaceId}`);
      printInfo(`Remote write URL: ${cfg.prometheusUrl}`);
      return;
    }
  } catch { /* proceed to create */ }

  try {
    const result = await client.send(new CreateWorkspaceCommand({
      alias: cfg.apsWorkspaceAlias,
      tags: { [TAG_KEY]: cfg.pipelineName },
    }));
    cfg.apsWorkspaceId = result.workspaceId;
    cfg.prometheusUrl = `https://aps-workspaces.${cfg.region}.amazonaws.com/workspaces/${cfg.apsWorkspaceId}/api/v1/remote_write`;

    // Wait for workspace to be active
    const spinner = createSpinner('Waiting for APS workspace...');
    spinner.start();
    const maxWait = 60_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      try {
        const check = await client.send(new ListWorkspacesCommand({ alias: cfg.apsWorkspaceAlias }));
        if (check.workspaces?.[0]?.status?.statusCode === 'ACTIVE') break;
      } catch { /* keep waiting */ }
      await sleep(5000);
    }
    spinner.succeed(`Workspace created: ${cfg.apsWorkspaceId}`);
    printInfo(`Remote write URL: ${cfg.prometheusUrl}`);
  } catch (err) {
    printError('Failed to create APS workspace');
    console.error();
    if (/AccessDenied|not authorized/i.test(err.message)) {
      console.error(`  ${chalk.bold('Permission denied.')} Your IAM identity needs ${chalk.bold('aps:CreateWorkspace')}.`);
    } else {
      console.error(`  ${chalk.dim(err.message)}`);
    }
    console.error();
    throw new Error('Failed to create APS workspace');
  }
}

// ── OSI pipeline ────────────────────────────────────────────────────────────

export async function createOsiPipeline(cfg, pipelineYaml) {
  printStep(`Creating OSI pipeline '${cfg.pipelineName}'...`);

  const client = new OSISClient({ region: cfg.region });

  // Check if pipeline already exists
  let skipCreate = false;
  try {
    const resp = await client.send(new GetPipelineCommand({ PipelineName: cfg.pipelineName }));
    const status = resp.Pipeline?.Status;
    if (status === 'ACTIVE') {
      cfg.ingestEndpoints = resp.Pipeline?.IngestEndpointUrls || [];
      printSuccess(`Pipeline '${cfg.pipelineName}' already exists (ACTIVE)`);
      for (const url of cfg.ingestEndpoints) printInfo(`Ingestion endpoint: https://${url}`);
      return;
    }
    if (status === 'CREATING') {
      printInfo(`Pipeline '${cfg.pipelineName}' is already being created — waiting...`);
      skipCreate = true;
    } else {
      printWarning(`Pipeline '${cfg.pipelineName}' exists with status ${status} — skipping creation`);
      return;
    }
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }

  if (!skipCreate) {
    try {
      await client.send(new CreatePipelineCommand({
        PipelineName: cfg.pipelineName,
        MinUnits: cfg.minOcu,
        MaxUnits: cfg.maxOcu,
        PipelineConfigurationBody: pipelineYaml,
        PipelineRoleArn: cfg.iamRoleArn,
        Tags: stackTags(cfg.pipelineName),
      }));
      printSuccess(`Pipeline '${cfg.pipelineName}' creation initiated`);
    } catch (err) {
      printError('Failed to create OSI pipeline');
      console.error();
      if (/AccessDenied|not authorized/i.test(err.message)) {
        console.error(`  ${chalk.bold('Permission denied.')} Your IAM identity needs ${chalk.bold('osis:CreatePipeline')}.`);
        console.error(`  ${chalk.dim(err.message)}`);
      } else {
        console.error(`  ${chalk.dim(err.message)}`);
      }
      console.error();
      throw new Error('Failed to create OSI pipeline');
    }
  }

  // Wait for pipeline to become active
  const spinner = createSpinner('Waiting for pipeline to activate...');
  spinner.start();
  const maxWait = 900_000; // 15 min
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    try {
      const resp = await client.send(new GetPipelineCommand({ PipelineName: cfg.pipelineName }));
      const status = resp.Pipeline?.Status;
      if (status === 'ACTIVE') {
        const urls = resp.Pipeline?.IngestEndpointUrls || [];
        cfg.ingestEndpoints = urls;
        spinner.succeed('Pipeline is active');
        for (const url of urls) {
          printInfo(`Ingestion endpoint: https://${url}`);
        }
        return;
      }
      if (status === 'CREATE_FAILED') {
        const reason = resp.Pipeline?.StatusReason?.Description || 'unknown';
        spinner.fail('Pipeline creation failed');
        printInfo(`Reason: ${reason}`);
        throw new Error(`Pipeline creation failed: ${reason}`);
      }
    } catch (err) {
      if (err.message?.startsWith('Pipeline creation failed')) throw err;
      /* keep polling */
    }
    await sleepWithTicker(10_000, spinner, start,
      (s) => `Waiting for pipeline... (${fmtElapsed(s)})`);
  }

  spinner.fail('Timed out waiting for pipeline after 15 minutes');
  throw new Error(`Pipeline '${cfg.pipelineName}' did not become active within 15 minutes`);
}

// ── OpenSearch UI workspace ──────────────────────────────────────────

/**
 * Set up OpenSearch UI: derive the URL and create an Observability workspace.
 * Skipped when dashboardsAction is 'reuse' (user provided their own URL).
 * For managed domains, uses basic auth to call the Dashboards API.
 * For serverless, provides the URL only (workspace setup via AWS console).
 */
export async function setupDashboards(cfg) {
  if (!cfg.opensearchEndpoint) return;
  if (cfg.dashboardsAction === 'reuse') {
    printStep('OpenSearch UI');
    printSuccess(`Using existing Dashboards: ${cfg.dashboardsUrl}`);
    return;
  }

  printStep('Setting up OpenSearch UI...');

  // Use OpenSearch Application URL
  if (!cfg.appEndpoint && cfg.appId) {
    const client = new OpenSearchClient({ region: cfg.region });
    await fetchAppEndpoint(client, cfg);
  }
  cfg.dashboardsUrl = cfg.appEndpoint || '';
  if (!cfg.dashboardsUrl) {
    printWarning('No OpenSearch Application endpoint available');
    printInfo('Create an OpenSearch Application in the AWS console to get the UI URL');
    return;
  }
  printSuccess(`URL: ${cfg.dashboardsUrl}`);
}

async function createObservabilityWorkspace(cfg) {
  if (!cfg.dashboardsUrl) return;
  const dashboardsBase = cfg.dashboardsUrl.replace(/\/+$/, '');
  const url = `${dashboardsBase}/api/workspaces`;
  const auth = Buffer.from(`${MANAGED_MASTER_USER}:${MANAGED_MASTER_PASS}`).toString('base64');

  // Check if an observability workspace already exists
  try {
    const listResp = await fetch(url, {
      method: 'GET',
      headers: {
        'osd-xsrf': 'true',
        'Authorization': `Basic ${auth}`,
      },
    });

    if (listResp.ok) {
      const data = await listResp.json();
      const existing = (data.result?.workspaces || []).find(
        (w) => w.name === 'Observability'
      );
      if (existing) {
        printSuccess(`Observability workspace already exists (id: ${existing.id})`);
        return;
      }
    }
  } catch { /* proceed to create */ }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'osd-xsrf': 'true',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        attributes: {
          name: 'Observability',
          description: 'Observability workspace for traces, logs, and metrics',
          features: ['use-case-observability'],
        },
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const workspaceId = data.result?.id;
      if (workspaceId) {
        printSuccess(`Observability workspace created (id: ${workspaceId})`);
      } else {
        printSuccess('Observability workspace created');
      }
    } else {
      const body = await resp.text();
      printWarning(`Could not create Observability workspace (${resp.status}): ${body}`);
      printInfo('You can create one manually in OpenSearch UI → Workspaces');
    }
  } catch (err) {
    printWarning(`Could not create Observability workspace: ${err.message}`);
    printInfo('You can create one manually in OpenSearch UI → Workspaces');
  }
}

// ── Direct Query Data Source (AMP → OpenSearch) ─────────────────────────────

/**
 * Create an IAM role for the Direct Query Service to access AMP.
 * Trust policy allows directquery.opensearchservice.amazonaws.com to assume it.
 */
export async function createDqsPrometheusRole(cfg) {
  const roleName = cfg.dqsRoleName;
  printStep(`Creating DQS Prometheus role '${roleName}'...`);

  const client = new IAMClient({ region: cfg.region });

  // Check if role already exists
  try {
    const existing = await client.send(new GetRoleCommand({ RoleName: roleName }));
    cfg.dqsRoleArn = existing.Role.Arn;
    printSuccess(`DQS role already exists: ${cfg.dqsRoleArn}`);
    return;
  } catch (err) {
    if (err.name !== 'NoSuchEntityException') throw err;
  }

  const trustPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect: 'Allow',
      Principal: { Service: 'directquery.opensearchservice.amazonaws.com' },
      Action: 'sts:AssumeRole',
    }],
  });

  try {
    const result = await client.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: trustPolicy,
      Tags: stackTags(cfg.pipelineName),
    }));
    cfg.dqsRoleArn = result.Role.Arn;
    printSuccess(`DQS role created: ${cfg.dqsRoleArn}`);
  } catch (err) {
    printError('Failed to create DQS Prometheus role');
    console.error(`  ${chalk.dim(err.message)}`);
    console.error();
    throw new Error('Failed to create DQS Prometheus role');
  }

  // Attach APS access policy
  const apsWorkspaceArn = `arn:aws:aps:${cfg.region}:${cfg.accountId}:workspace/${cfg.apsWorkspaceId}`;
  const permissionsPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Action: 'aps:*', Resource: apsWorkspaceArn }],
  });

  try {
    await client.send(new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: 'APSAccess',
      PolicyDocument: permissionsPolicy,
    }));
    printSuccess('APS access policy attached to DQS role');
  } catch (err) {
    printError('Failed to attach APS policy to DQS role');
    console.error(`  ${chalk.dim(err.message)}`);
    console.error();
    throw new Error('Failed to attach APS policy to DQS role');
  }

  await sleep(5000);
}

/**
 * Create a Direct Query Data Source connecting OpenSearch to AMP (Prometheus).
 * Uses the OpenSearch service control plane API.
 */
export async function createDirectQueryDataSource(cfg) {
  const dataSourceName = cfg.dqsDataSourceName;
  printStep(`Creating Direct Query data source '${dataSourceName}'...`);

  const client = new OpenSearchClient({ region: cfg.region });
  const workspaceArn = `arn:aws:aps:${cfg.region}:${cfg.accountId}:workspace/${cfg.apsWorkspaceId}`;

  try {
    const result = await client.send(new AddDirectQueryDataSourceCommand({
      DataSourceName: dataSourceName,
      DataSourceType: {
        Prometheus: {
          RoleArn: cfg.dqsRoleArn,
          WorkspaceArn: workspaceArn,
        },
      },
      Description: `Prometheus data source for ${cfg.pipelineName} observability stack`,
    }));
    cfg.dqsDataSourceArn = result.DataSourceArn;
    printSuccess(`Direct Query data source created: ${cfg.dqsDataSourceArn}`);
    await tagResource(cfg.region, cfg.dqsDataSourceArn, cfg.pipelineName);
  } catch (err) {
    // Treat "already exists" as success
    if (/already exists/i.test(err.message) || err.name === 'ResourceAlreadyExistsException') {
      cfg.dqsDataSourceArn = `arn:aws:opensearch:${cfg.region}:${cfg.accountId}:datasource/${dataSourceName}`;
      printSuccess(`Data source '${dataSourceName}' already exists`);
      return;
    }
    printError('Failed to create Direct Query data source');
    console.error(`  ${chalk.dim(err.message)}`);
    console.error();
    throw new Error('Failed to create Direct Query data source');
  }
}

/**
 * Create an OpenSearch Application (the new OpenSearch UI) and associate
 * the OpenSearch domain/collection and the DQS data source with it.
 */
export async function createOpenSearchApplication(cfg) {
  const appName = cfg.appName;
  printStep(`Creating OpenSearch Application '${appName}'...`);

  const client = new OpenSearchClient({ region: cfg.region });

  // Check if app already exists
  try {
    const list = await client.send(new ListApplicationsCommand({}));
    const existing = (list.ApplicationSummaries || []).find((a) => a.name === appName);
    if (existing) {
      cfg.appId = existing.id;
      printSuccess(`Application '${appName}' already exists (id: ${cfg.appId})`);
      await fetchAppEndpoint(client, cfg);
      // Update data sources on existing app
      await associateDataSourcesWithApp(cfg, client);
      return;
    }
  } catch { /* proceed to create */ }

  // Build data sources list
  const dataSources = buildAppDataSources(cfg);

  try {
    const result = await client.send(new CreateApplicationCommand({
      name: appName,
      dataSources,
      appConfigs: [
        {
          key: 'opensearchDashboards.dashboardAdmin.users',
          value: JSON.stringify(['*']),
        },
        {
          key: 'opensearchDashboards.dashboardAdmin.groups',
          value: JSON.stringify([cfg.iamRoleArn]),
        },
      ],
      iamIdentityCenterOptions: {
        enabled: false,
      },
    }));
    cfg.appId = result.id;
    printSuccess(`Application created: ${cfg.appId}`);
    if (result.arn) {
      await tagResource(cfg.region, result.arn, cfg.pipelineName);
    }
    await fetchAppEndpoint(client, cfg);
  } catch (err) {
    if (/already exists/i.test(err.message) || err.name === 'ResourceAlreadyExistsException' || err.name === 'ConflictException') {
      printSuccess(`Application '${appName}' already exists`);
      // Try to find and update it
      try {
        const list = await client.send(new ListApplicationsCommand({}));
        const existing = (list.ApplicationSummaries || []).find((a) => a.name === appName);
        if (existing) {
          cfg.appId = existing.id;
          await fetchAppEndpoint(client, cfg);
          await associateDataSourcesWithApp(cfg, client);
        }
      } catch { /* best effort */ }
      return;
    }
    printWarning(`Could not create OpenSearch Application: ${err.message}`);
    printInfo('You can create one manually in the AWS console');
  }
}

/**
 * Fetch the application endpoint via GetApplicationCommand.
 */
async function fetchAppEndpoint(client, cfg) {
  if (!cfg.appId) return;
  try {
    const resp = await client.send(new GetApplicationCommand({ id: cfg.appId }));
    cfg.appEndpoint = resp.endpoint || '';
    // endpoint logged by setupDashboards
  } catch { /* best effort */ }
}

/**
 * Build the data sources list for application create/update.
 */
function buildAppDataSources(cfg) {
  const dataSources = [];
  if (cfg.serverless) {
    const collectionId = extractServerlessCollectionId(cfg.opensearchEndpoint);
    if (collectionId) {
      dataSources.push({
        dataSourceArn: `arn:aws:aoss:${cfg.region}:${cfg.accountId}:collection/${collectionId}`,
      });
    }
  } else if (!cfg.serverless) {
    // For managed domains, derive the domain name from the endpoint URL if reusing,
    // otherwise use cfg.osDomainName (which may be set by applySimpleDefaults)
    let domainName = cfg.osDomainName;
    if (cfg.opensearchEndpoint && cfg.osAction === 'reuse') {
      const m = cfg.opensearchEndpoint.match(/search-(.+?)-[a-z0-9]+\.[a-z0-9-]+\.es\.amazonaws\.com/);
      if (m) domainName = m[1];
    }
    if (domainName) {
      dataSources.push({
        dataSourceArn: `arn:aws:es:${cfg.region}:${cfg.accountId}:domain/${domainName}`,
      });
    }
  } else if (cfg.opensearchEndpoint) {
    // Extract domain name from endpoint URL: https://search-DOMAIN-xxx.region.es.amazonaws.com
    const m = cfg.opensearchEndpoint.match(/search-([^-]+-[^.]+)\./);
    if (m) {
      // The full domain name is between "search-" and the random suffix before the region
      const domainName = cfg.opensearchEndpoint.match(/search-(.+?)-[a-z0-9]+\.[a-z0-9-]+\.es\.amazonaws\.com/)?.[1];
      if (domainName) {
        dataSources.push({
          dataSourceArn: `arn:aws:es:${cfg.region}:${cfg.accountId}:domain/${domainName}`,
        });
      }
    }
  }
  if (cfg.dqsDataSourceArn) {
    dataSources.push({ dataSourceArn: cfg.dqsDataSourceArn });
  }
  return dataSources;
}

/**
 * Associate the OpenSearch domain and DQS data source with the application.
 */
async function associateDataSourcesWithApp(cfg, client) {
  if (!cfg.appId) return;

  const dataSources = buildAppDataSources(cfg);
  if (dataSources.length === 0) return;

  try {
    await client.send(new UpdateApplicationCommand({
      id: cfg.appId,
      dataSources,
    }));
    printSuccess('Data sources associated with application');
  } catch (err) {
    printWarning(`Could not associate data sources: ${err.message}`);
  }
}

/**
 * Extract serverless collection ID from endpoint URL.
 * Endpoint format: https://<id>.<region>.aoss.amazonaws.com
 */
function extractServerlessCollectionId(endpoint) {
  const match = endpoint?.match(/https?:\/\/([^.]+)\./);
  return match?.[1] || '';
}

// ── Resource listing (for interactive reuse selection) ──────────────────────

/**
 * List all OpenSearch endpoints in the given region — both managed domains
 * and serverless collections.
 * Returns [{ name, endpoint, engineVersion, serverless }].
 */
export async function listDomains(region) {
  const results = [];

  // 1. Managed domains
  try {
    const client = new OpenSearchClient({ region });
    const { DomainNames } = await client.send(new ListDomainNamesCommand({}));
    if (DomainNames?.length) {
      const names = DomainNames.map((d) => d.DomainName);
      const { DomainStatusList } = await client.send(
        new DescribeDomainsCommand({ DomainNames: names }),
      );
      for (const d of DomainStatusList || []) {
        results.push({
          name: d.DomainName,
          endpoint: d.Endpoint ? `https://${d.Endpoint}` : '',
          engineVersion: d.EngineVersion || '',
          serverless: false,
        });
      }
    }
  } catch { /* managed listing failed — continue */ }

  // 2. Serverless collections
  try {
    const aoss = new OpenSearchServerlessClient({ region });
    const resp = await aoss.send(new ListServerlessCollectionsCommand({}));
    for (const c of resp.collectionSummaries || []) {
      const endpoint = c.arn
        ? `https://${c.id}.${region}.aoss.amazonaws.com`
        : '';
      results.push({
        name: c.name,
        endpoint: c.status === 'ACTIVE' ? endpoint : '',
        engineVersion: 'Serverless',
        serverless: true,
      });
    }
  } catch { /* serverless listing failed — continue */ }

  return results;
}

/**
 * List IAM roles, optionally filtered by a prefix/keyword.
 * Returns [{ name, arn }].
 */
export async function listRoles(region) {
  const client = new IAMClient({ region });
  const roles = [];
  let marker;

  // Paginate (IAM can have many roles)
  do {
    const resp = await client.send(new ListRolesCommand({
      MaxItems: 200,
      Marker: marker,
    }));
    for (const r of resp.Roles || []) {
      roles.push({ name: r.RoleName, arn: r.Arn });
    }
    marker = resp.IsTruncated ? resp.Marker : undefined;
  } while (marker);

  return roles;
}

/**
 * List APS workspaces in the given region.
 * Returns [{ alias, id, url }].
 */
export async function listWorkspaces(region) {
  const client = new AmpClient({ region });
  const resp = await client.send(new ListWorkspacesCommand({}));
  return (resp.workspaces || [])
    .filter((w) => w.status?.statusCode === 'ACTIVE')
    .map((w) => ({
      alias: w.alias || '',
      id: w.workspaceId,
      url: `https://aps-workspaces.${region}.amazonaws.com/workspaces/${w.workspaceId}/api/v1/remote_write`,
    }));
}

/**
 * List OpenSearch Applications in the given region.
 * Returns [{ name, id, endpoint }].
 */
export async function listApplications(region) {
  const client = new OpenSearchClient({ region });
  const resp = await client.send(new ListApplicationsCommand({}));
  return (resp.ApplicationSummaries || []).map((a) => ({
    name: a.name,
    id: a.id,
    endpoint: a.endpoint || '',
  }));
}

// ── Pipeline listing / describe / update ─────────────────────────────────────

/**
 * List all OSI pipelines in the given region.
 * Returns [{ name, status, minUnits, maxUnits, createdAt, lastUpdatedAt }].
 */
export async function listPipelines(region) {
  const client = new OSISClient({ region });
  const resp = await client.send(new ListPipelinesCommand({ MaxResults: 100 }));
  return (resp.Pipelines || []).map((p) => ({
    name: p.PipelineName,
    status: p.Status,
    minUnits: p.MinUnits,
    maxUnits: p.MaxUnits,
    createdAt: p.CreatedAt,
    lastUpdatedAt: p.LastUpdatedAt,
  }));
}


/**
 * Get the OTLP ingest endpoint URL for an OSI pipeline.
 */
export async function getPipelineEndpoint(region, pipelineName) {
  const client = new OSISClient({ region });
  const resp = await client.send(new GetPipelineCommand({ PipelineName: pipelineName }));
  const urls = resp.Pipeline?.IngestEndpointUrls;
  return urls?.length ? urls[0] : null;
}

// ── Stack discovery (tag-based) ──────────────────────────────────────────────

/**
 * Tag a resource after creation using the Resource Groups Tagging API.
 * Best-effort — failures are silently ignored.
 */
export async function tagResource(region, arn, stackName) {
  try {
    const client = new ResourceGroupsTaggingAPIClient({ region });
    await client.send(new TagResourcesCommand({
      ResourceARNList: [arn],
      Tags: { [TAG_KEY]: stackName },
    }));
  } catch { /* best effort */ }
}

/**
 * List all open-stack stacks in a region by querying the Resource Groups Tagging API.
 * Returns [{ name, resources: [{ arn, type }] }] grouped by stack name.
 */
export async function listStacks(region) {
  const client = new ResourceGroupsTaggingAPIClient({ region });
  const stacks = new Map();

  let paginationToken;
  do {
    const resp = await client.send(new GetResourcesCommand({
      TagFilters: [{ Key: TAG_KEY }],
      PaginationToken: paginationToken || undefined,
    }));

    for (const r of resp.ResourceTagMappingList || []) {
      const tag = (r.Tags || []).find((t) => t.Key === TAG_KEY);
      if (!tag) continue;
      const stackName = tag.Value;
      if (!stacks.has(stackName)) {
        stacks.set(stackName, []);
      }
      stacks.get(stackName).push({
        arn: r.ResourceARN,
        type: arnToType(r.ResourceARN),
      });
    }

    paginationToken = resp.PaginationToken;
  } while (paginationToken);

  // Supplement with OpenSearch Applications (may not appear in tagging API)
  await supplementApplications(region, stacks);

  return [...stacks.entries()].map(([name, resources]) => ({ name, resources }));
}

/**
 * Get all resources for a specific stack by its tag value.
 * Returns [{ arn, type }].
 */
export async function getStackResources(region, stackName) {
  const client = new ResourceGroupsTaggingAPIClient({ region });
  const resources = [];

  let paginationToken;
  do {
    const resp = await client.send(new GetResourcesCommand({
      TagFilters: [{ Key: TAG_KEY, Values: [stackName] }],
      PaginationToken: paginationToken || undefined,
    }));

    for (const r of resp.ResourceTagMappingList || []) {
      resources.push({
        arn: r.ResourceARN,
        type: arnToType(r.ResourceARN),
      });
    }

    paginationToken = resp.PaginationToken;
  } while (paginationToken);

  // Supplement with OpenSearch Application if not already present
  const stacks = new Map([[stackName, resources]]);
  await supplementApplications(region, stacks);

  return resources;
}

/**
 * Map an ARN to a human-readable resource type.
 */
function arnToType(arn) {
  if (/^arn:aws:osis:/.test(arn)) return 'OSI Pipeline';
  if (/^arn:aws:aoss:.*:collection\//.test(arn)) return 'OpenSearch Serverless';
  if (/^arn:aws:es:.*:domain\//.test(arn)) return 'OpenSearch Domain';
  if (/^arn:aws:iam:.*:role\//.test(arn)) return 'IAM Role';
  if (/^arn:aws:aps:.*:workspace\//.test(arn)) return 'APS Workspace';
  if (/^arn:aws:opensearch:.*:datasource\//.test(arn)) return 'DQ Data Source';
  if (/^arn:aws:opensearch:.*:application\//.test(arn)) return 'OpenSearch Application';
  return 'Resource';
}

/**
 * Extract the resource name from an ARN.
 */
export function arnToName(arn) {
  // IAM roles: arn:aws:iam::123:role/role-name
  const iamMatch = arn.match(/:role\/(.+)$/);
  if (iamMatch) return iamMatch[1];
  // Most others: .../{name} or ...:<name>
  const lastSlash = arn.lastIndexOf('/');
  if (lastSlash !== -1) return arn.slice(lastSlash + 1);
  const lastColon = arn.lastIndexOf(':');
  if (lastColon !== -1) return arn.slice(lastColon + 1);
  return arn;
}

/**
 * Enrich resource objects with display names where the ARN-derived name is not
 * human-friendly (e.g. APS workspace IDs → aliases, application IDs → names).
 */
export async function enrichResourceNames(region, resources) {
  // APS workspaces: resolve alias
  const apsResources = resources.filter((r) => r.type === 'APS Workspace');
  if (apsResources.length) {
    const client = new AmpClient({ region });
    for (const r of apsResources) {
      try {
        const wsId = arnToName(r.arn);
        const resp = await client.send(new DescribeWorkspaceCommand({ workspaceId: wsId }));
        if (resp.workspace?.alias) r.displayName = resp.workspace.alias;
      } catch { /* keep default */ }
    }
  }
  // OpenSearch Applications: resolve name from ID
  const appResources = resources.filter((r) => r.type === 'OpenSearch Application');
  if (appResources.length) {
    try {
      const client = new OpenSearchClient({ region });
      const list = await client.send(new ListApplicationsCommand({}));
      for (const r of appResources) {
        const appId = arnToName(r.arn);
        const app = (list.ApplicationSummaries || []).find((a) => a.id === appId);
        if (app?.name) r.displayName = app.name;
      }
    } catch { /* keep default */ }
  }
}

/**
 * Find OpenSearch Applications whose name matches a stack name and add them
 * to the resource list if not already present (tagging API may not return them).
 */
async function supplementApplications(region, stacks) {
  if (stacks.size === 0) return;
  try {
    const client = new OpenSearchClient({ region });
    const list = await client.send(new ListApplicationsCommand({}));
    for (const app of list.ApplicationSummaries || []) {
      if (!app.name || !app.arn) continue;
      const resources = stacks.get(app.name);
      if (!resources) continue;
      const alreadyPresent = resources.some((r) => r.type === 'OpenSearch Application');
      if (!alreadyPresent) {
        resources.push({ arn: app.arn, type: 'OpenSearch Application' });
      }
    }
  } catch { /* best effort */ }
}

/**
 * Fetch detailed information for a single resource by ARN.
 * Returns { entries: [[label, value], ...], rawConfig?: string }.
 */
export async function describeResource(region, resource) {
  const { arn, type } = resource;
  const name = arnToName(arn);
  const entries = [['ARN', arn]];
  let rawConfig;

  try {
    if (type === 'OSI Pipeline') {
      const client = new OSISClient({ region });
      const resp = await client.send(new GetPipelineCommand({ PipelineName: name }));
      const p = resp.Pipeline || {};
      entries.push(['Status', p.Status || 'Unknown']);
      if (p.StatusReason?.Message) entries.push(['Status Reason', p.StatusReason.Message]);
      entries.push(['Min Units', String(p.MinUnits ?? '')]);
      entries.push(['Max Units', String(p.MaxUnits ?? '')]);
      if (p.IngestEndpointUrls?.length) {
        for (const url of p.IngestEndpointUrls) entries.push(['Ingest Endpoint', url]);
      }
      if (p.PipelineRoleArn) entries.push(['Role ARN', p.PipelineRoleArn]);
      if (p.CreatedAt) entries.push(['Created', p.CreatedAt.toISOString()]);
      if (p.LastUpdatedAt) entries.push(['Last Updated', p.LastUpdatedAt.toISOString()]);
      if (p.PipelineConfigurationBody) rawConfig = p.PipelineConfigurationBody;
    } else if (type === 'OpenSearch Serverless') {
      const client = new OpenSearchServerlessClient({ region });
      const resp = await client.send(new BatchGetCollectionCommand({ ids: [name] }));
      const c = (resp.collectionDetails || [])[0] || {};
      if (c.status) entries.push(['Status', c.status]);
      if (c.type) entries.push(['Type', c.type]);
      if (c.collectionEndpoint) entries.push(['Collection Endpoint', c.collectionEndpoint]);
      if (c.dashboardEndpoint) entries.push(['Dashboard Endpoint', c.dashboardEndpoint]);
      if (c.description) entries.push(['Description', c.description]);
      if (c.createdDate) entries.push(['Created', new Date(c.createdDate).toISOString()]);
      if (c.lastModifiedDate) entries.push(['Last Modified', new Date(c.lastModifiedDate).toISOString()]);
    } else if (type === 'OpenSearch Domain') {
      const client = new OpenSearchClient({ region });
      const resp = await client.send(new DescribeDomainCommand({ DomainName: name }));
      const d = resp.DomainStatus || {};
      if (d.EngineVersion) entries.push(['Engine Version', d.EngineVersion]);
      if (d.Endpoint) entries.push(['Endpoint', `https://${d.Endpoint}`]);
      if (d.ClusterConfig) {
        const cc = d.ClusterConfig;
        if (cc.InstanceType) entries.push(['Instance Type', cc.InstanceType]);
        entries.push(['Instance Count', String(cc.InstanceCount ?? 1)]);
      }
      entries.push(['Processing', String(d.Processing ?? false)]);
      if (d.Created !== undefined) entries.push(['Created', String(d.Created)]);
    } else if (type === 'APS Workspace') {
      const wsId = name;
      const client = new AmpClient({ region });
      const resp = await client.send(new DescribeWorkspaceCommand({ workspaceId: wsId }));
      const w = resp.workspace || {};
      if (w.status?.statusCode) entries.push(['Status', w.status.statusCode]);
      if (w.alias) entries.push(['Alias', w.alias]);
      if (w.prometheusEndpoint) entries.push(['Prometheus Endpoint', w.prometheusEndpoint]);
      if (w.createdAt) entries.push(['Created', w.createdAt.toISOString()]);
    } else if (type === 'IAM Role') {
      const client = new IAMClient({ region });
      const resp = await client.send(new GetRoleCommand({ RoleName: name }));
      const r = resp.Role || {};
      if (r.Description) entries.push(['Description', r.Description]);
      if (r.Path) entries.push(['Path', r.Path]);
      if (r.CreateDate) entries.push(['Created', r.CreateDate.toISOString()]);
      if (r.MaxSessionDuration) entries.push(['Max Session Duration', `${r.MaxSessionDuration}s`]);
    } else if (type === 'DQ Data Source') {
      const client = new OpenSearchClient({ region });
      const resp = await client.send(new GetDirectQueryDataSourceCommand({ DataSourceName: name }));
      if (resp.DataSourceType) {
        const typeKey = Object.keys(resp.DataSourceType)[0];
        if (typeKey) entries.push(['Data Source Type', typeKey]);
      }
      if (resp.Description) entries.push(['Description', resp.Description]);
      if (resp.OpenSearchArns?.length) {
        for (const a of resp.OpenSearchArns) entries.push(['OpenSearch ARN', a]);
      }
    } else if (type === 'OpenSearch Application') {
      const client = new OpenSearchClient({ region });
      const appId = name;
      const resp = await client.send(new GetApplicationCommand({ id: appId }));
      if (resp.status) entries.push(['Status', resp.status]);
      if (resp.endpoint) entries.push(['Endpoint', resp.endpoint]);
      if (resp.dataSources?.length) {
        for (const ds of resp.dataSources) {
          if (ds.dataSourceArn) entries.push(['Data Source', ds.dataSourceArn]);
        }
      }
      if (resp.createdAt) entries.push(['Created', resp.createdAt.toISOString()]);
      if (resp.lastUpdatedAt) entries.push(['Last Updated', resp.lastUpdatedAt.toISOString()]);
    }
  } catch (err) {
    entries.push(['Error', err.message]);
  }

  return { entries, rawConfig };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fmtElapsed(totalSec) {
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s}s`;
}

/** Sleep for `totalMs`, updating `spinner.text` every second via `textFn(elapsedSec)`. */
async function sleepWithTicker(totalMs, spinner, startTime, textFn) {
  const end = Date.now() + totalMs;
  while (Date.now() < end) {
    spinner.text = textFn(Math.round((Date.now() - startTime) / 1000));
    await sleep(Math.min(1000, end - Date.now()));
  }
}
