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
import { printStep, printSuccess, printWarning, printInfo, createSpinner } from './ui.mjs';

const TAG_KEY = 'observability-stack:pipeline-name';
const INSTANCE_TYPE = 't3.xlarge';

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

function buildUserData(cfg) {
  const osiEndpoint = `https://${cfg.ingestEndpoints[0]}`;
  const region = cfg.region;

  const collectorConfig = `
extensions:
  sigv4auth:
    region: "${region}"
    service: osis

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
        cors: { allowed_origins: ["http://*", "https://*"] }

processors:
  batch: { timeout: 10s, send_batch_size: 1024 }
  memory_limiter: { check_interval: 5s, limit_percentage: 80, spike_limit_percentage: 25 }
  resourcedetection: { detectors: [env, ec2, system] }

exporters:
  otlphttp/osis-logs:
    logs_endpoint: ${osiEndpoint}/${cfg.pipelineName}/v1/logs
    auth: { authenticator: sigv4auth }
    compression: none
  otlphttp/osis-traces:
    traces_endpoint: ${osiEndpoint}/${cfg.pipelineName}/v1/traces
    auth: { authenticator: sigv4auth }
    compression: none
  otlphttp/osis-metrics:
    metrics_endpoint: ${osiEndpoint}/${cfg.pipelineName}/v1/metrics
    auth: { authenticator: sigv4auth }
    compression: none

service:
  telemetry:
    logs:
      level: info
  extensions: [sigv4auth]
  pipelines:
    logs:    { receivers: [otlp], processors: [resourcedetection, memory_limiter, batch], exporters: [otlphttp/osis-logs] }
    traces:  { receivers: [otlp], processors: [resourcedetection, memory_limiter, batch], exporters: [otlphttp/osis-traces] }
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

git clone --depth 1 https://github.com/opensearch-project/observability-stack.git /opt/obs-stack
cd /opt/obs-stack

cat > docker-compose/otel-collector/config.yaml << 'COLLECTOREOF'
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
    command: ["--config=/etc/otelcol-config.yml"]
    volumes:
      - ./docker-compose/otel-collector/config.yaml:/etc/otelcol-config.yml
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

export { tags as _tags, tagSpec as _tagSpec, buildUserData as _buildUserData };

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

  const spinner = createSpinner('Looking up AMI and subnet...');
  const [ami, subnet] = await Promise.all([getLatestAL2023Ami(ssm), getDefaultVpcSubnet(ec2, INSTANCE_TYPE)]);
  spinner.stop(`AMI: ${ami}`);

  const sgSpinner = createSpinner('Creating security group...');
  const sgId = await createDemoSecurityGroup(ec2, cfg);
  sgSpinner.stop(`Security group: ${sgId}`);

  const profileSpinner = createSpinner('Creating instance profile...');
  const profileName = await createDemoInstanceProfile(iam, cfg);
  profileSpinner.stop(`Instance profile: ${profileName}`);

  const launchSpinner = createSpinner(`Launching ${INSTANCE_TYPE} instance...`);
  const { Instances } = await ec2.send(new RunInstancesCommand({
    ImageId: ami,
    InstanceType: INSTANCE_TYPE,
    MinCount: 1,
    MaxCount: 1,
    SubnetId: subnet.SubnetId,
    SecurityGroupIds: [sgId],
    IamInstanceProfile: { Name: profileName },
    UserData: buildUserData(cfg),
    TagSpecifications: tagSpec('instance', cfg.pipelineName),
    BlockDeviceMappings: [{ DeviceName: '/dev/xvda', Ebs: { VolumeSize: 30, VolumeType: 'gp3' } }],
    MetadataOptions: { HttpTokens: 'required', HttpPutResponseHopLimit: 2 },
  }));
  const instanceId = Instances[0].InstanceId;
  launchSpinner.stop(`Instance launched: ${instanceId}`);

  const waitSpinner = createSpinner('Waiting for instance to be running...');
  await waitUntilInstanceRunning({ client: ec2, maxWaitTime: 300 }, { InstanceIds: [instanceId] });
  waitSpinner.stop('Instance running');

  printSuccess(`Demo workloads deploying on ${instanceId}`);
  printInfo('Services will be ready in ~3-5 minutes (docker pull + start)');
  printInfo(`View init logs: aws ssm start-session --target ${instanceId} --region ${cfg.region}`);

  cfg.demoInstanceId = instanceId;
  cfg.demoSecurityGroupId = sgId;
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
    const spinner = createSpinner(`Terminating ${instanceIds.length} instance(s)...`);
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: instanceIds }));
    await waitUntilInstanceTerminated({ client: ec2, maxWaitTime: 300 }, { InstanceIds: instanceIds });
    spinner.stop('Instances terminated');
  } else {
    printInfo('No demo instances found');
  }

  // Delete instance profile + role
  const roleName = `${cfg.pipelineName}-ec2-demo-role`;
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
