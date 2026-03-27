import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import {
  OpenSearchClient,
  CreateDomainCommand,
  DescribeDomainCommand,
  ListDomainNamesCommand,
  DescribeDomainsCommand,
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
} from '@aws-sdk/client-amp';
import {
  OSISClient,
  ListPipelinesCommand,
  CreatePipelineCommand,
  GetPipelineCommand,
  UpdatePipelineCommand,
} from '@aws-sdk/client-osis';
import {
  printStep,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  createSpinner,
} from './ui.mjs';
import chalk from 'chalk';

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
    }
    console.error();
    throw new Error('AWS credentials are not configured or have expired');
  }

  cfg.accountId = identity.Account;
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

  printStep('Mapping OSI role in OpenSearch FGAC...');

  const url = `${cfg.opensearchEndpoint}/_plugins/_security/api/rolesmapping/all_access`;
  const auth = Buffer.from(`${MANAGED_MASTER_USER}:${MANAGED_MASTER_PASS}`).toString('base64');

  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify([
        { op: 'add', path: '/backend_roles', value: [cfg.iamRoleArn] },
      ]),
    });

    if (resp.ok) {
      printSuccess(`OSI role mapped to all_access in OpenSearch`);
    } else {
      const body = await resp.text();
      printWarning(`FGAC mapping returned ${resp.status}: ${body}`);
      printInfo('You may need to manually map the IAM role in OpenSearch Dashboards → Security → Roles');
    }
  } catch (err) {
    printWarning(`Could not map OSI role in FGAC: ${err.message}`);
    printInfo('You may need to manually map the IAM role in OpenSearch Dashboards → Security → Roles');
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
    const result = await client.send(new CreateWorkspaceCommand({ alias: cfg.apsWorkspaceAlias }));
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
  try {
    await client.send(new GetPipelineCommand({ PipelineName: cfg.pipelineName }));
    printWarning(`Pipeline '${cfg.pipelineName}' already exists — skipping creation`);
    printInfo('To update, delete the existing pipeline first or use a different name');
    return;
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }

  try {
    await client.send(new CreatePipelineCommand({
      PipelineName: cfg.pipelineName,
      MinUnits: cfg.minOcu,
      MaxUnits: cfg.maxOcu,
      PipelineConfigurationBody: pipelineYaml,
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

  // Wait for pipeline to become active
  const spinner = createSpinner('Waiting for pipeline to activate...');
  spinner.start();
  const maxWait = 300_000; // 5 min
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    try {
      const resp = await client.send(new GetPipelineCommand({ PipelineName: cfg.pipelineName }));
      const status = resp.Pipeline?.Status;
      if (status === 'ACTIVE') {
        const urls = resp.Pipeline?.IngestEndpointUrls;
        spinner.succeed('Pipeline is active');
        if (urls?.length) {
          printInfo(`Ingestion endpoint: ${urls[0]}`);
        }
        return;
      }
      if (status === 'CREATE_FAILED') {
        const reason = resp.Pipeline?.StatusReason?.Description || 'unknown';
        spinner.fail('Pipeline creation failed');
        printInfo(`Reason: ${reason}`);
        throw new Error(`Pipeline creation failed: ${reason}`);
      }
    } catch { /* keep polling */ }
    await sleepWithTicker(10_000, spinner, start,
      (s) => `Waiting for pipeline... (${fmtElapsed(s)})`);
  }

  spinner.warn('Timed out waiting — pipeline may still be provisioning');
  printInfo(`Check: aws osis get-pipeline --pipeline-name ${cfg.pipelineName} --region ${cfg.region}`);
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
 * Get full details of a single OSI pipeline.
 */
export async function getPipeline(region, pipelineName) {
  const client = new OSISClient({ region });
  const resp = await client.send(new GetPipelineCommand({ PipelineName: pipelineName }));
  const p = resp.Pipeline;
  return {
    name: p.PipelineName,
    arn: p.PipelineArn,
    status: p.Status,
    statusReason: p.StatusReason?.Description,
    minUnits: p.MinUnits,
    maxUnits: p.MaxUnits,
    ingestEndpoints: p.IngestEndpointUrls || [],
    createdAt: p.CreatedAt,
    lastUpdatedAt: p.LastUpdatedAt,
    pipelineConfigurationBody: p.PipelineConfigurationBody,
    logPublishingOptions: p.LogPublishingOptions,
    bufferOptions: p.BufferOptions,
  };
}

/**
 * Update an OSI pipeline.
 * @param {string} region
 * @param {string} pipelineName
 * @param {{ minUnits?: number, maxUnits?: number, pipelineConfigurationBody?: string, logPublishingOptions?: object, bufferOptions?: object }} params
 */
export async function updatePipeline(region, pipelineName, params) {
  const client = new OSISClient({ region });

  const cmd = { PipelineName: pipelineName };
  if (params.minUnits != null) cmd.MinUnits = params.minUnits;
  if (params.maxUnits != null) cmd.MaxUnits = params.maxUnits;
  if (params.pipelineConfigurationBody != null) cmd.PipelineConfigurationBody = params.pipelineConfigurationBody;
  if (params.logPublishingOptions != null) cmd.LogPublishingOptions = params.logPublishingOptions;
  if (params.bufferOptions != null) cmd.BufferOptions = params.bufferOptions;

  await client.send(new UpdatePipelineCommand(cmd));

  // Poll for update completion
  const spinner = createSpinner('Waiting for pipeline update...');
  spinner.start();
  const maxWait = 300_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    try {
      const resp = await client.send(new GetPipelineCommand({ PipelineName: pipelineName }));
      const status = resp.Pipeline?.Status;
      if (status === 'ACTIVE') {
        spinner.succeed('Pipeline updated successfully');
        return;
      }
      if (status === 'UPDATE_FAILED') {
        const reason = resp.Pipeline?.StatusReason?.Description || 'unknown';
        spinner.fail('Pipeline update failed');
        throw new Error(`Pipeline update failed: ${reason}`);
      }
    } catch (err) {
      if (err.message.startsWith('Pipeline update failed')) throw err;
    }
    await sleepWithTicker(10_000, spinner, start,
      (s) => `Waiting for pipeline update... (${fmtElapsed(s)})`);
  }

  spinner.warn('Timed out waiting for update — pipeline may still be updating');
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
