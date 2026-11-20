/**
 * EC2 demo workload launcher.
 * Launches an EC2 instance running docker-compose with example agents + OTel Demo,
 * exporting all telemetry to the managed OSIS pipeline via SigV4.
 */
import {
  EC2Client, RunInstancesCommand, DescribeInstancesCommand, TerminateInstancesCommand,
  CreateSecurityGroupCommand, AuthorizeSecurityGroupEgressCommand, DeleteSecurityGroupCommand,
  DescribeSecurityGroupsCommand, RevokeSecurityGroupEgressCommand,
  DescribeSubnetsCommand, DescribeInstanceTypeOfferingsCommand,
  waitUntilInstanceRunning, waitUntilInstanceTerminated,
} from '@aws-sdk/client-ec2';
import {
  IAMClient, CreateRoleCommand, PutRolePolicyCommand, CreateInstanceProfileCommand,
  AddRoleToInstanceProfileCommand, GetInstanceProfileCommand,
  RemoveRoleFromInstanceProfileCommand, DeleteInstanceProfileCommand,
  DeleteRolePolicyCommand, DeleteRoleCommand,
} from '@aws-sdk/client-iam';
import {
  SSMClient, GetParameterCommand,
} from '@aws-sdk/client-ssm';
import { createRequire } from 'node:module';
import { printStep, printSuccess, printWarning, printInfo, createSpinner } from './ui.mjs';

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../package.json');

const TAG_KEY = 'observability-stack:pipeline-name';
const INSTANCE_TYPE = 't3.xlarge';

// The stack revision the EC2 instance clones. Defaults to the bundle release
// tag matching this CLI version (CLI is version-locked to the bundle), so a
// pinned CLI deploys the matching pinned stack (no drift from main HEAD at boot
// time). Override with OBS_STACK_REF for development.
const STACK_REF = process.env.OBS_STACK_REF || `v${PKG_VERSION}`;

function tags(pipelineName, extra = {}) {
  return [
    { Key: TAG_KEY, Value: pipelineName },
    { Key: 'Name', Value: `${pipelineName}-demo` },
    ...Object.entries(extra).map(([Key, Value]) => ({ Key, Value })),
  ];
}

function tagSpec(resourceType, pipelineName) {
  return [{ ResourceType: resourceType, Tags: tags(pipelineName) }];
}

async function getLatestAL2023Ami(ssm) {
  const { Parameter } = await ssm.send(new GetParameterCommand({
    Name: '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64',
  }));
  return Parameter.Value;
}

async function getDefaultVpcSubnet(ec2, instanceType) {
  const { Subnets } = await ec2.send(new DescribeSubnetsCommand({
    Filters: [{ Name: 'default-for-az', Values: ['true'] }],
  }));
  if (!Subnets?.length) throw new Error('No default VPC subnet found. Ensure a default VPC exists in this region.');

  const { InstanceTypeOfferings } = await ec2.send(new DescribeInstanceTypeOfferingsCommand({
    LocationType: 'availability-zone',
    Filters: [{ Name: 'instance-type', Values: [instanceType] }],
  }));
  const supportedAzs = new Set((InstanceTypeOfferings || []).map(o => o.Location));
  const match = Subnets.find(s => supportedAzs.has(s.AvailabilityZone));
  if (!match) {
    throw new Error(`No default VPC subnet is in an AZ that supports ${instanceType}. Supported AZs: ${[...supportedAzs].join(', ') || '(none)'}`);
  }
  return match;
}

// Pick the first caller-provided VPC subnet whose AZ offers instanceType.
// t3.xlarge (and other types) aren't offered in every AZ, so a raw subnetIds[0]
// can fail RunInstances ~15 min into the deploy; mirror the default-VPC guard.
async function getVpcSubnetForInstance(ec2, subnetIds, instanceType) {
  const { Subnets } = await ec2.send(new DescribeSubnetsCommand({
    Filters: [{ Name: 'subnet-id', Values: subnetIds }],
  }));
  if (!Subnets?.length) throw new Error(`None of the provided subnets were found: ${subnetIds.join(', ')}`);

  const { InstanceTypeOfferings } = await ec2.send(new DescribeInstanceTypeOfferingsCommand({
    LocationType: 'availability-zone',
    Filters: [{ Name: 'instance-type', Values: [instanceType] }],
  }));
  const supportedAzs = new Set((InstanceTypeOfferings || []).map(o => o.Location));

  // Preserve caller subnet order so subnetIds[0] wins when its AZ qualifies.
  const byCallerOrder = subnetIds
    .map(id => Subnets.find(s => s.SubnetId === id))
    .filter(Boolean);
  const match = byCallerOrder.find(s => supportedAzs.has(s.AvailabilityZone));
  if (!match) {
    throw new Error(`No provided subnet is in an AZ that supports ${instanceType}. Supported AZs: ${[...supportedAzs].join(', ') || '(none)'}`);
  }
  return match.SubnetId;
}

/**
 * Where the eval canary reads agent spans: the domain or collection endpoint, the SigV4
 * service and the resources the demo role needs to read. Null when the endpoint is unknown.
 */
/** The only indices the eval canary reads: agent spans, and results (to skip graded traces). */
export const CANARY_READ_INDICES = ['otel-v1-apm-span*', 'otel-v1-genai-evaluation*'];

function canaryTarget(cfg) {
  if (!cfg.opensearchEndpoint) return null;
  const url = /^https?:\/\//.test(cfg.opensearchEndpoint) ? cfg.opensearchEndpoint : `https://${cfg.opensearchEndpoint}`;
  if (cfg.opensearchType === 'serverless') {
    return {
      url, service: 'aoss',
      actions: ['aoss:APIAccessAll'],
      resources: [`arn:aws:aoss:${cfg.region}:${cfg.accountId}:collection/${cfg.collectionId || '*'}`],
    };
  }
  const domain = `arn:aws:es:${cfg.region}:${cfg.accountId}:domain/${cfg.osDomainName || '*'}`;
  return { url, service: 'es', actions: ['es:ESHttpGet', 'es:ESHttpPost'], resources: CANARY_READ_INDICES.map((i) => `${domain}/${i}`) };
}

/** Data access policy that lets the demo role read the collection (name <= 32 chars). */
export function demoReadPolicyName(collectionName) {
  return `${collectionName.slice(0, 22)}-demo-read`;
}

/** Security roles the demo role is mapped to on managed domains. destroy removes the same set. */
export const DEMO_FGAC_ROLES = ['readall'];

// User data that enables the eval canary (profile aws-evals) with SigV4 settings, or clears
// COMPOSE_PROFILES when there is nothing to read from.
function canaryEnvScript(cfg) {
  const t = canaryTarget(cfg);
  if (!t) {
    return `# Managed mode has no local opensearch/prometheus. Clear COMPOSE_PROFILES
# (overriding the local-backends value committed in .env) to prune the services
# that require those backends.
export COMPOSE_PROFILES=`;
  }
  return `# Eval canary: reads agent spans from the domain or collection with SigV4 (instance
# role) and sends gen_ai.evaluation.result events through the collector to the pipeline.
cat >> .env << 'CANARYEOF'
COMPOSE_PROFILES=aws-evals
EVAL_CANARY_OPENSEARCH_URL=${t.url}
OPENSEARCH_AWS_SERVICE=${t.service}
AWS_REGION=${cfg.region}
CANARYEOF
export COMPOSE_PROFILES=aws-evals`;
}

function buildUserData(cfg) {
  const osiEndpoint = `https://${cfg.ingestEndpoints[0]}`;
  const region = cfg.region;

  // Overlay on the stack's own collector config (docker-compose/otel-collector/config.yaml at
  // the pinned ref), passed as a second --config. The collector merges the files and replaces
  // lists, so this swaps the exporters and pipelines for OSIS while keeping the base config's
  // processors -- notably gen_ai_normalizer and the transform that de-dots attribute keys and
  // stringifies map log bodies. Without them OpenSearch rejects spans with colliding dotted keys
  // (db.system vs db.system.name, user_agent vs user_agent.original) and logs whose body is a map.
  const collectorConfig = `
extensions:
  sigv4auth:
    region: "${region}"
    service: osis

processors:
  resourcedetection: { detectors: [env, ec2, system] }

exporters:
  otlphttp/osis-logs:
    logs_endpoint: ${osiEndpoint}/${cfg.pipelineName}/v1/logs
    auth: { authenticator: sigv4auth }
    compression: none
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 60s
      max_elapsed_time: 1800s
  otlphttp/osis-traces:
    traces_endpoint: ${osiEndpoint}/${cfg.pipelineName}/v1/traces
    auth: { authenticator: sigv4auth }
    compression: none
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 60s
      max_elapsed_time: 1800s
  otlphttp/osis-metrics:
    metrics_endpoint: ${osiEndpoint}/${cfg.pipelineName}/v1/metrics
    auth: { authenticator: sigv4auth }
    compression: none
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 60s
      max_elapsed_time: 1800s

service:
  extensions: [sigv4auth]
  pipelines:
    logs:    { receivers: [otlp], processors: [resourcedetection, memory_limiter, transform, batch], exporters: [otlphttp/osis-logs] }
    traces:  { receivers: [otlp], processors: [resourcedetection, memory_limiter, gen_ai_normalizer, transform, batch], exporters: [otlphttp/osis-traces] }
    metrics: { receivers: [otlp], processors: [resourcedetection, memory_limiter, batch], exporters: [otlphttp/osis-metrics] }
`.trim();

  return Buffer.from(`#!/bin/bash
set -euo pipefail
exec > /var/log/obs-stack-init.log 2>&1

dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user

mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
BUILDX_VERSION=\$(curl -s https://api.github.com/repos/docker/buildx/releases/latest | grep tag_name | cut -d'"' -f4)
curl -SL "https://github.com/docker/buildx/releases/download/\${BUILDX_VERSION}/buildx-\${BUILDX_VERSION}.linux-amd64" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx

# Clone the stack at the pinned ref (see STACK_REF). Fall back to the default
# branch if the ref is absent (e.g. an untagged dev build).
OBS_STACK_REF="${STACK_REF}"
if ! git clone --depth 1 --branch "\$OBS_STACK_REF" https://github.com/opensearch-project/observability-stack.git /opt/obs-stack; then
  echo "WARNING: ref \$OBS_STACK_REF not found, falling back to default branch"
  git clone --depth 1 https://github.com/opensearch-project/observability-stack.git /opt/obs-stack
fi
cd /opt/obs-stack

cat > docker-compose/otel-collector/managed.yaml << 'COLLECTOREOF'
${collectorConfig}
COLLECTOREOF

# Patch otel-demo frontend-proxy: the upstream envoy template references
# \${TELEMETRY_DOCS_HOST}/\${TELEMETRY_DOCS_PORT} but those aren't wired through
# docker-compose, so envoy bootstraps with an empty socket address and crash-loops.
# Inject the vars into .env and forward them into the frontend-proxy service.
if ! grep -q '^TELEMETRY_DOCS_HOST=' .env; then
  printf '\nTELEMETRY_DOCS_HOST=otel-collector\nTELEMETRY_DOCS_PORT=4318\n' >> .env
fi
if ! grep -q 'TELEMETRY_DOCS_HOST' docker-compose.otel-demo.yml; then
  sed -i '/^      - FLAGD_UI_PORT$/a\\      - TELEMETRY_DOCS_HOST\\n      - TELEMETRY_DOCS_PORT' docker-compose.otel-demo.yml
fi

# Write a standalone compose file for managed mode (no local backends)
cat > /opt/obs-stack/docker-compose.managed.yml << 'MANAGEDEOF'
# Managed mode: only collector + workload services, no local backends
include:
  - docker-compose.examples.yml
  - docker-compose.otel-demo.yml

x-default-logging: &logging
  driver: "json-file"
  options:
    max-size: "5m"
    max-file: "2"

networks:
  observability-stack-network:
    driver: bridge

services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:\${OTEL_COLLECTOR_VERSION}
    container_name: otel-collector
    command: ["--config=/etc/otelcol-config.yml", "--config=/etc/otelcol-managed.yml"]
    volumes:
      - ./docker-compose/otel-collector/config.yaml:/etc/otelcol-config.yml
      - ./docker-compose/otel-collector/managed.yaml:/etc/otelcol-managed.yml
    ports:
      - "\${OTEL_COLLECTOR_PORT_GRPC:-4317}:4317"
      - "\${OTEL_COLLECTOR_PORT_HTTP:-4318}:4318"
      - "8888:8888"
    environment:
      - GOMEMLIMIT=400MiB
    networks:
      - observability-stack-network
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 500M
    logging: *logging
MANAGEDEOF

${canaryEnvScript(cfg)}

# Kafka's healthcheck can exceed compose's dependency grace window on first boot,
# leaving kafka-dependent services in 'Created' state. Retry once — second pass
# finds kafka healthy and starts the stragglers.
docker compose -f docker-compose.managed.yml up -d || true
sleep 60
docker compose -f docker-compose.managed.yml up -d
`).toString('base64');
}

async function createDemoSecurityGroup(ec2, cfg) {
  const sgName = `${cfg.pipelineName}-demo-sg`;
  try {
    const { GroupId } = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: sgName,
      Description: `Observability Stack demo - ${cfg.pipelineName}`,
      TagSpecifications: tagSpec('security-group', cfg.pipelineName),
    }));
    return GroupId;
  } catch (e) {
    if (e.Code === 'InvalidGroup.Duplicate') {
      const { SecurityGroups } = await ec2.send(new DescribeSecurityGroupsCommand({
        Filters: [{ Name: 'group-name', Values: [sgName] }],
      }));
      return SecurityGroups[0].GroupId;
    }
    throw e;
  }
}

async function createDemoInstanceProfile(iam, cfg) {
  const roleName = `${cfg.pipelineName}-ec2-demo-role`;
  const profileName = roleName;

  const trustPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Principal: { Service: 'ec2.amazonaws.com' }, Action: 'sts:AssumeRole' }],
  });

  const ingestPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Action: 'osis:Ingest', Resource: `arn:aws:osis:${cfg.region}:${cfg.accountId}:pipeline/${cfg.pipelineName}` }],
  });

  try {
    await iam.send(new CreateRoleCommand({ RoleName: roleName, AssumeRolePolicyDocument: trustPolicy, Tags: tags(cfg.pipelineName) }));
  } catch (e) { if (e.name !== 'EntityAlreadyExistsException') throw e; }

  await iam.send(new PutRolePolicyCommand({ RoleName: roleName, PolicyName: 'osis-ingest', PolicyDocument: ingestPolicy }));

  // Attach SSM managed policy for debugging access
  const { AttachRolePolicyCommand } = await import('@aws-sdk/client-iam');
  try {
    await iam.send(new AttachRolePolicyCommand({
      RoleName: roleName,
      PolicyArn: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore',
    }));
  } catch (e) { /* already attached */ }

  try {
    await iam.send(new CreateInstanceProfileCommand({ InstanceProfileName: profileName, Tags: tags(cfg.pipelineName) }));
    await iam.send(new AddRoleToInstanceProfileCommand({ InstanceProfileName: profileName, RoleName: roleName }));
    await new Promise(r => setTimeout(r, 10000));
  } catch (e) {
    if (e.name !== 'EntityAlreadyExistsException') throw e;
    // Verify role is attached
    try { await iam.send(new AddRoleToInstanceProfileCommand({ InstanceProfileName: profileName, RoleName: roleName })); } catch {}
  }

  return profileName;
}

// Read access for the eval canary: an IAM policy on the demo role, plus a data access policy
// (serverless) or a readall FGAC mapping (managed). Not fatal: the rest of the demo still runs.
async function grantCanaryRead(iam, cfg, roleName) {
  const t = canaryTarget(cfg);
  if (!t) return;
  const roleArn = `arn:aws:iam::${cfg.accountId}:role/${roleName}`;
  try {
    await iam.send(new PutRolePolicyCommand({
      RoleName: roleName, PolicyName: 'opensearch-read',
      PolicyDocument: JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: t.actions, Resource: t.resources }] }),
    }));
    if (cfg.opensearchType === 'serverless') {
      await putDemoReadAccessPolicy(cfg, roleArn);
    } else if (cfg.vpcId) {
      printWarning(`VPC domain: map ${roleArn} to the readall role so the eval canary can read spans.`);
    } else {
      await mapDemoRoleReadall(cfg, roleArn);
    }
    printSuccess('Eval canary read access granted');
  } catch (e) {
    printWarning(`Eval canary read access: ${e.message}. Agent evaluations stay empty until the demo role can read spans.`);
  }
}

async function putDemoReadAccessPolicy(cfg, roleArn) {
  const { OpenSearchServerlessClient, CreateAccessPolicyCommand, GetAccessPolicyCommand, UpdateAccessPolicyCommand } =
    await import('@aws-sdk/client-opensearchserverless');
  const client = new OpenSearchServerlessClient({ region: cfg.region });
  const name = demoReadPolicyName(cfg.aossCollectionName);
  const policy = JSON.stringify([{
    Rules: [{ ResourceType: 'index', Resource: CANARY_READ_INDICES.map((i) => `index/${cfg.aossCollectionName}/${i}`), Permission: ['aoss:DescribeIndex', 'aoss:ReadDocument'] }],
    Principal: [roleArn],
  }]);
  try {
    await client.send(new CreateAccessPolicyCommand({ name, type: 'data', policy }));
  } catch (e) {
    if (!/ConflictException|already exists/i.test(`${e.name} ${e.message}`)) throw e;
    const { accessPolicyDetail: d } = await client.send(new GetAccessPolicyCommand({ name, type: 'data' }));
    await client.send(new UpdateAccessPolicyCommand({ name, type: 'data', policyVersion: d.policyVersion, policy }));
  }
}

async function mapDemoRoleReadall(cfg, roleArn) {
  const { domainFetchFor } = await import('./aws.mjs');
  const { domainFetch } = await domainFetchFor(cfg);
  for (const role of DEMO_FGAC_ROLES) {
    const url = `${canaryTarget(cfg).url}/_plugins/_security/api/rolesmapping/${role}`;
    const cur = await domainFetch(url, 'GET');
    const existing = cur.ok ? ((await cur.json())?.[role]?.backend_roles || []) : [];
    const resp = await domainFetch(url, 'PATCH', JSON.stringify([{ op: 'add', path: '/backend_roles', value: [...new Set([...existing, roleArn])] }]));
    if (!resp.ok) throw new Error(`PATCH rolesmapping/${role} returned ${resp.status}: ${await resp.text()}`);
  }
}

export { canaryTarget as _canaryTarget, canaryEnvScript as _canaryEnvScript, tags as _tags, tagSpec as _tagSpec, buildUserData as _buildUserData, getVpcSubnetForInstance as _getVpcSubnetForInstance };

export async function launchDemoInstance(cfg) {
  printStep('Launching EC2 demo instance...');

  const ec2 = new EC2Client({ region: cfg.region });

  // Check for existing running instance
  const { Reservations } = await ec2.send(new DescribeInstancesCommand({
    Filters: [
      { Name: `tag:${TAG_KEY}`, Values: [cfg.pipelineName] },
      { Name: 'instance-state-name', Values: ['running', 'pending'] },
    ],
  }));
  const existing = (Reservations || []).flatMap(r => r.Instances);
  if (existing.length) {
    cfg.demoInstanceId = existing[0].InstanceId;
    printSuccess(`Demo instance already running: ${cfg.demoInstanceId}`);
    return cfg.demoInstanceId;
  }
  const iam = new IAMClient({ region: cfg.region });
  const ssm = new SSMClient({ region: cfg.region });

  // When a VPC was selected for the stack, place the demo instance in the same
  // network so it can reach a VPC-private OSIS ingestion endpoint. Otherwise fall
  // back to the account's default VPC subnet (current behavior).
  const inVpc = Boolean(cfg.vpcId);

  const spinner = createSpinner('Looking up AMI and subnet...').start();
  const amiPromise = getLatestAL2023Ami(ssm);
  const subnetId = inVpc
    ? await getVpcSubnetForInstance(ec2, cfg.subnetIds, INSTANCE_TYPE)
    : (await getDefaultVpcSubnet(ec2, INSTANCE_TYPE)).SubnetId;
  const ami = await amiPromise;
  spinner.succeed(`AMI: ${ami}`);

  // In VPC mode, reuse the caller-provided security groups (they should already
  // allow the intra-VPC traffic the domain/pipeline need). Otherwise create a
  // dedicated demo SG in the default VPC.
  let sgIds;
  if (inVpc) {
    sgIds = cfg.securityGroupIds;
  } else {
    const sgSpinner = createSpinner('Creating security group...').start();
    sgIds = [await createDemoSecurityGroup(ec2, cfg)];
    sgSpinner.succeed(`Security group: ${sgIds[0]}`);
  }

  const profileSpinner = createSpinner('Creating instance profile...').start();
  const profileName = await createDemoInstanceProfile(iam, cfg);
  profileSpinner.succeed(`Instance profile: ${profileName}`);
  await grantCanaryRead(iam, cfg, profileName);

  const launchSpinner = createSpinner(`Launching ${INSTANCE_TYPE} instance${inVpc ? ` in ${subnetId}` : ''}...`).start();
  const { Instances } = await ec2.send(new RunInstancesCommand({
    ImageId: ami,
    InstanceType: INSTANCE_TYPE,
    MinCount: 1,
    MaxCount: 1,
    SubnetId: subnetId,
    SecurityGroupIds: sgIds,
    IamInstanceProfile: { Name: profileName },
    UserData: buildUserData(cfg),
    TagSpecifications: tagSpec('instance', cfg.pipelineName),
    BlockDeviceMappings: [{ DeviceName: '/dev/xvda', Ebs: { VolumeSize: 30, VolumeType: 'gp3' } }],
    MetadataOptions: { HttpTokens: 'required', HttpPutResponseHopLimit: 2 },
  }));
  const instanceId = Instances[0].InstanceId;
  launchSpinner.succeed(`Instance launched: ${instanceId}`);

  const waitSpinner = createSpinner('Waiting for instance to be running...').start();
  await waitUntilInstanceRunning({ client: ec2, maxWaitTime: 300 }, { InstanceIds: [instanceId] });
  waitSpinner.succeed('Instance running');

  printSuccess(`Demo workloads deploying on ${instanceId}`);
  printInfo('Services will be ready in ~3-5 minutes (docker pull + start)');
  printInfo(`View init logs: aws ssm start-session --target ${instanceId} --region ${cfg.region}`);

  cfg.demoInstanceId = instanceId;
  cfg.demoSecurityGroupId = sgIds[0];
  return instanceId;
}

export async function teardownDemoInstance(cfg) {
  printStep('Tearing down EC2 demo resources...');

  const ec2 = new EC2Client({ region: cfg.region });
  const iam = new IAMClient({ region: cfg.region });
  const filter = [{ Name: `tag:${TAG_KEY}`, Values: [cfg.pipelineName] }];

  // Find and terminate instances
  const { Reservations } = await ec2.send(new DescribeInstancesCommand({
    Filters: [...filter, { Name: 'instance-state-name', Values: ['running', 'stopped', 'pending'] }],
  }));
  const instanceIds = (Reservations || []).flatMap(r => r.Instances.map(i => i.InstanceId));

  if (instanceIds.length) {
    const spinner = createSpinner(`Terminating ${instanceIds.length} instance(s)...`).start();
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: instanceIds }));
    await waitUntilInstanceTerminated({ client: ec2, maxWaitTime: 300 }, { InstanceIds: instanceIds });
    spinner.succeed('Instances terminated');
  } else {
    printInfo('No demo instances found');
  }

  // Delete instance profile + role
  const roleName = `${cfg.pipelineName}-ec2-demo-role`;
  try { await iam.send(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: 'opensearch-read' })); }
  catch (e) { if (e.name !== 'NoSuchEntityException') printWarning(`Role policy cleanup: ${e.message}`); }
  try {
    await iam.send(new RemoveRoleFromInstanceProfileCommand({ InstanceProfileName: roleName, RoleName: roleName }));
    await iam.send(new DeleteInstanceProfileCommand({ InstanceProfileName: roleName }));
    await iam.send(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: 'osis-ingest' }));
    // Detach any managed policies
    const { ListAttachedRolePoliciesCommand, DetachRolePolicyCommand } = await import('@aws-sdk/client-iam');
    const { AttachedPolicies } = await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }));
    for (const p of AttachedPolicies || []) {
      await iam.send(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: p.PolicyArn }));
    }
    await iam.send(new DeleteRoleCommand({ RoleName: roleName }));
    printSuccess('Instance profile and role deleted');
  } catch (e) {
    if (e.name !== 'NoSuchEntityException') printWarning(`Role cleanup: ${e.message}`);
  }

  // Delete security group
  const { SecurityGroups } = await ec2.send(new DescribeSecurityGroupsCommand({ Filters: filter }));
  for (const sg of SecurityGroups || []) {
    try {
      await ec2.send(new DeleteSecurityGroupCommand({ GroupId: sg.GroupId }));
      printSuccess(`Security group ${sg.GroupId} deleted`);
    } catch (e) {
      printWarning(`SG cleanup: ${e.message}`);
    }
  }
}
