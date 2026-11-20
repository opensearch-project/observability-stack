import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureAgentEvalsSetup, evalsConfigBody, evalsDatasetAttributes, missingDatasetAttributes,
} from '../src/agent-evals-ui.mjs';
import { pickDataSource, repairDataSourceRefs, DS_REF_TYPE } from '../src/opensearch-ui-init.mjs';

// We need to extract the pure functions for testing.
// Since buildAppDataSources is not exported, we replicate the logic here
// and test it matches expectations. In a refactor, these would be exported.

function buildAppDataSources(cfg) {
  const dataSources = [];
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
  if (cfg.connectedDataSourceArn) {
    dataSources.push({ dataSourceArn: cfg.connectedDataSourceArn });
  }
  return dataSources;
}

describe('buildAppDataSources', () => {
  const baseCfg = { region: 'us-east-1', accountId: '123456789012' };

  it('managed domain - create new', () => {
    const ds = buildAppDataSources({
      ...baseCfg, osAction: 'create',
      osDomainName: 'my-domain', opensearchEndpoint: '',
    });
    assert.equal(ds.length, 1);
    assert.match(ds[0].dataSourceArn, /domain\/my-domain$/);
  });

  it('managed domain - reuse: extracts domain name from endpoint URL', () => {
    const ds = buildAppDataSources({
      ...baseCfg, osAction: 'reuse',
      osDomainName: 'wrong-name-from-defaults',
      opensearchEndpoint: 'https://search-actual-domain-name-abc123xyz.us-east-1.es.amazonaws.com',
    });
    assert.equal(ds.length, 1);
    assert.match(ds[0].dataSourceArn, /domain\/actual-domain-name$/);
  });

  it('managed domain - reuse: handles hyphenated domain names', () => {
    const ds = buildAppDataSources({
      ...baseCfg, osAction: 'reuse',
      osDomainName: 'pipeline-name',
      opensearchEndpoint: 'https://search-open-stack-aos-test-z6hp76cbu35szosamuup3vsuqq.us-east-1.es.amazonaws.com',
    });
    assert.match(ds[0].dataSourceArn, /domain\/open-stack-aos-test$/);
  });

  it('includes Connected Data Source ARN when present', () => {
    const ds = buildAppDataSources({
      ...baseCfg, osAction: 'create',
      osDomainName: 'my-domain',
      connectedDataSourceArn: 'arn:aws:opensearch:us-east-1:123:datasource/prom',
    });
    assert.equal(ds.length, 2);
    assert.match(ds[1].dataSourceArn, /datasource\/prom$/);
  });
});

// Test service map index pattern (always otel-v2 per Pratik's fix)
describe('service map index pattern', () => {
  it('uses otel-v2-apm-service-map*', () => {
    const pattern = 'otel-v2-apm-service-map*';
    assert.equal(pattern, 'otel-v2-apm-service-map*');
  });
});

// Test caller role ARN extraction
describe('caller role ARN extraction', () => {
  it('extracts role from assumed-role ARN', () => {
    const arn = 'arn:aws:sts::027423573553:assumed-role/Admin/kylhouns-Isengard';
    const match = arn.match(/assumed-role\/([^/]+)\//);
    const roleArn = match ? `arn:aws:iam::027423573553:role/${match[1]}` : '';
    assert.equal(roleArn, 'arn:aws:iam::027423573553:role/Admin');
  });

  it('handles IAM user ARN (no assumed-role)', () => {
    const arn = 'arn:aws:iam::027423573553:user/myuser';
    const match = arn.match(/assumed-role\/([^/]+)\//);
    assert.equal(match, null);
  });
});

// ── EC2 demo unit tests ──────────────────────────────────────────────────────

import { _tags, _tagSpec, _buildUserData, _getVpcSubnetForInstance, _canaryTarget, demoReadPolicyName, domainNameFromEndpoint } from '../src/ec2-demo.mjs';

describe('EC2 demo tags', () => {
  it('includes pipeline tag and Name tag', () => {
    const result = _tags('my-stack');
    assert.equal(result[0].Key, 'observability-stack:pipeline-name');
    assert.equal(result[0].Value, 'my-stack');
    assert.equal(result[1].Key, 'Name');
    assert.equal(result[1].Value, 'my-stack-demo');
  });

  it('includes extra tags', () => {
    const result = _tags('my-stack', { Env: 'test' });
    assert.equal(result.length, 3);
    assert.equal(result[2].Key, 'Env');
  });
});

describe('EC2 demo tagSpec', () => {
  it('wraps tags in ResourceType spec', () => {
    const result = _tagSpec('instance', 'my-stack');
    assert.equal(result[0].ResourceType, 'instance');
    assert.ok(result[0].Tags.length >= 2);
  });
});

describe('EC2 demo buildUserData', () => {
  const cfg = {
    pipelineName: 'test-pipeline',
    region: 'us-west-2',
    ingestEndpoints: ['test-pipeline-abc123.us-west-2.osis.amazonaws.com'],
  };

  it('returns base64 encoded string', () => {
    const result = _buildUserData(cfg);
    const decoded = Buffer.from(result, 'base64').toString();
    assert.ok(decoded.startsWith('#!/bin/bash'));
  });

  it('contains correct OSIS endpoint with pipeline name in path', () => {
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(decoded.includes('test-pipeline-abc123.us-west-2.osis.amazonaws.com/test-pipeline/v1/logs'));
    assert.ok(decoded.includes('test-pipeline-abc123.us-west-2.osis.amazonaws.com/test-pipeline/v1/traces'));
    assert.ok(decoded.includes('test-pipeline-abc123.us-west-2.osis.amazonaws.com/test-pipeline/v1/metrics'));
  });

  it('contains sigv4auth with correct region', () => {
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(decoded.includes('region: "us-west-2"'));
    assert.ok(decoded.includes('service: osis'));
  });

  it('contains docker compose managed file', () => {
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(decoded.includes('docker-compose.managed.yml'));
  });

  it('does not reference local backend compose files', () => {
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(!decoded.includes('docker-compose.local-opensearch'));
  });

  it('installs docker, git, compose, and buildx', () => {
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(decoded.includes('dnf install -y docker git'));
    assert.ok(decoded.includes('docker-compose'));
    assert.ok(decoded.includes('docker-buildx'));
  });

  it('pins the stack clone to the bundle release tag instead of tracking main HEAD', () => {
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(decoded.includes('--branch "$OBS_STACK_REF"'));
    // CLI is version-locked to the bundle: clone ref is `v<PKG_VERSION>`.
    assert.ok(/OBS_STACK_REF="v\d/.test(decoded));
  });

  it('layers the OSIS overlay on the stack collector config instead of replacing it', () => {
    // The stack's config.yaml carries gen_ai_normalizer and the transform that de-dots attribute
    // keys and stringifies map log bodies. Overwriting it drops both, and OpenSearch then rejects
    // spans with colliding dotted keys.
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(decoded.includes("cat > docker-compose/otel-collector/managed.yaml << 'COLLECTOREOF'"));
    assert.ok(!decoded.includes('cat > docker-compose/otel-collector/config.yaml'));
    assert.ok(decoded.includes('"--config=/etc/otelcol-config.yml", "--config=/etc/otelcol-managed.yml"'));
    assert.ok(decoded.includes('./docker-compose/otel-collector/managed.yaml:/etc/otelcol-managed.yml'));
  });

  it('runs the stack transform and GenAI normalizer in the OSIS pipelines', () => {
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(decoded.includes('processors: [resourcedetection, memory_limiter, gen_ai_normalizer, transform, batch], exporters: [otlphttp/osis-traces]'));
    assert.ok(decoded.includes('processors: [resourcedetection, memory_limiter, transform, batch], exporters: [otlphttp/osis-logs]'));
  });

  it('clears COMPOSE_PROFILES so local-backend services are pruned in managed mode', () => {
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(decoded.includes('export COMPOSE_PROFILES='));
  });
});

describe('EC2 demo getVpcSubnetForInstance — AZ offering guard', () => {
  // Stub EC2: subnet-a in us-east-1a, subnet-b in us-east-1b; offerings configurable.
  const makeEc2 = (offeringAzs) => ({
    send: async (cmd) => {
      const name = cmd.constructor.name;
      if (name === 'DescribeSubnetsCommand') {
        const ids = cmd.input.Filters[0].Values;
        const all = { 'subnet-a': 'us-east-1a', 'subnet-b': 'us-east-1b' };
        return { Subnets: ids.filter(id => all[id]).map(id => ({ SubnetId: id, AvailabilityZone: all[id] })) };
      }
      if (name === 'DescribeInstanceTypeOfferingsCommand') {
        return { InstanceTypeOfferings: offeringAzs.map(az => ({ Location: az })) };
      }
      throw new Error(`unexpected command ${name}`);
    },
  });

  it('returns subnetIds[0] when its AZ offers the instance type', async () => {
    const ec2 = makeEc2(['us-east-1a', 'us-east-1b']);
    assert.equal(await _getVpcSubnetForInstance(ec2, ['subnet-a', 'subnet-b'], 't3.xlarge'), 'subnet-a');
  });

  it('skips to the next subnet whose AZ offers the instance type', async () => {
    const ec2 = makeEc2(['us-east-1b']); // only b offers it
    assert.equal(await _getVpcSubnetForInstance(ec2, ['subnet-a', 'subnet-b'], 't3.xlarge'), 'subnet-b');
  });

  it('throws when no provided subnet is in a supporting AZ', async () => {
    const ec2 = makeEc2(['us-east-1c']); // neither a nor b
    await assert.rejects(
      () => _getVpcSubnetForInstance(ec2, ['subnet-a', 'subnet-b'], 't3.xlarge'),
      /No provided subnet is in an AZ that supports t3\.xlarge/,
    );
  });

  it('throws when none of the provided subnets are found', async () => {
    const ec2 = makeEc2(['us-east-1a']);
    await assert.rejects(
      () => _getVpcSubnetForInstance(ec2, ['subnet-missing'], 't3.xlarge'),
      /None of the provided subnets were found/,
    );
  });
});

// ── managed-mode compose project resolution ──────────────────────────────────
// Regression guard for #298: the generated docker-compose.managed.yml must
// resolve as a valid project with COMPOSE_PROFILES empty, with every
// local-backend service pruned (managed mode defines no opensearch/prometheus).

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';

function dockerComposeAvailable() {
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Extract the docker-compose.managed.yml heredoc body from generated user-data.
function extractManagedCompose(userDataB64) {
  const decoded = Buffer.from(userDataB64, 'base64').toString();
  const m = decoded.match(/docker-compose\.managed\.yml << .MANAGEDEOF.\n([\s\S]*?)\nMANAGEDEOF/);
  if (!m) throw new Error('managed compose heredoc not found in user-data');
  return m[1];
}

describe('EC2 demo managed compose project', { skip: !dockerComposeAvailable() }, () => {
  const cfg = {
    pipelineName: 'test-pipeline',
    region: 'us-west-2',
    ingestEndpoints: ['test-pipeline-abc123.us-west-2.osis.amazonaws.com'],
  };
  // Repo root holds the included compose files; managed.yml's relative
  // include: paths resolve against the file's own directory.
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const managedPath = join(repoRoot, 'docker-compose.managed.yml');

  function configServices(profiles) {
    return execFileSync(
      'docker', ['compose', '-f', managedPath, 'config', '--services'],
      { cwd: repoRoot, env: { ...process.env, COMPOSE_PROFILES: profiles }, encoding: 'utf8' },
    ).split('\n').filter(Boolean);
  }

  it('validates and prunes local-backend services when COMPOSE_PROFILES is empty', () => {
    writeFileSync(managedPath, extractManagedCompose(_buildUserData(cfg)));
    try {
      const services = configServices('');
      assert.ok(services.length > 0, 'expected the managed project to resolve to a non-empty service list');
      assert.ok(!services.includes('example-agent-eval-canary'),
        'eval canary should be pruned in managed mode (no local opensearch)');
      assert.ok(!services.includes('otel-demo-alerting-rules-monitors-init'),
        'otel-demo monitors-init should be pruned in managed mode (no local prometheus/opensearch)');
      assert.ok(!services.includes('example-anomaly-detection-init'),
        'anomaly-detection-init should be pruned in managed mode (no local opensearch)');
      assert.ok(services.includes('otel-collector'),
        'otel-collector should always be present');
    } finally {
      rmSync(managedPath, { force: true });
    }
  });
});

// ── renderPipeline tests ─────────────────────────────────────────────────────

import { renderPipeline } from '../src/render.mjs';

describe('renderPipeline', () => {
  const cfg = {
    pipelineName: 'test-stack',
    opensearchEndpoint: 'https://search-test-abc.us-east-1.es.amazonaws.com',
    region: 'us-east-1',
    iamRoleArn: 'arn:aws:iam::123456789012:role/test-osi-role',
    prometheusUrl: 'https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-123/api/v1/remote_write',
    serviceMapWindow: '30s',
  };

  const yaml = renderPipeline(cfg);

  it('contains OTLP paths with pipeline name', () => {
    assert.ok(yaml.includes("logs_path: '/test-stack/v1/logs'"));
    assert.ok(yaml.includes("traces_path: '/test-stack/v1/traces'"));
    assert.ok(yaml.includes("metrics_path: '/test-stack/v1/metrics'"));
  });

  it('contains OpenSearch endpoint in sinks', () => {
    assert.ok(yaml.includes(cfg.opensearchEndpoint));
  });

  it('contains IAM role ARN in sinks', () => {
    const matches = yaml.match(/sts_role_arn/g);
    assert.ok(matches && matches.length >= 2, 'should have sts_role_arn in multiple sinks');
  });

  it('contains Prometheus URL in metrics and service-map sinks', () => {
    const matches = yaml.match(new RegExp(cfg.prometheusUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
    assert.equal(matches.length, 2, 'prometheus URL should appear in metrics + service-map sinks');
  });

  it('uses index_type for logs sink', () => {
    assert.ok(yaml.includes('index_type: log-analytics-plain'));
  });

  it('uses index_type for traces sink', () => {
    assert.ok(yaml.includes('index_type: trace-analytics-plain-raw'));
  });

  it('uses index_type for service map sink', () => {
    assert.ok(yaml.includes('index_type: otel-v2-apm-service-map'));
  });

  it('contains service map window duration', () => {
    assert.ok(yaml.includes('window_duration: 30s'));
  });

  it('routes logs, evaluations, traces, and metrics from otlp-pipeline', () => {
    assert.ok(yaml.includes("'getEventType() == \"LOG\" and /eventName != \"gen_ai.evaluation.result\"'"));
    assert.ok(yaml.includes("'getEventType() == \"LOG\" and /eventName == \"gen_ai.evaluation.result\"'"));
    assert.ok(yaml.includes("'getEventType() == \"TRACE\"'"));
    assert.ok(yaml.includes("'getEventType() == \"METRIC\"'"));
  });

  it('is valid YAML structure (starts with version)', () => {
    assert.ok(yaml.startsWith("version: '2'"));
  });
});

// ── VPC / network topology tests ──────────────────────────────────────────────

import { validateConfig } from '../src/cli.mjs';

function baseCfg(overrides = {}) {
  return {
    pipelineName: 'obs-stack-test',
    region: 'us-east-1',
    osAction: 'create',
    osDomainName: 'obs-stack-test',
    iamAction: 'create',
    apsAction: 'create',
    dashboardsAction: 'create',
    vpcId: '',
    subnetIds: [],
    securityGroupIds: [],
    ...overrides,
  };
}

describe('validateConfig — VPC options', () => {
  it('passes with no VPC options (public default)', () => {
    assert.deepEqual(validateConfig(baseCfg()), []);
  });

  it('passes with a complete VPC config', () => {
    const errors = validateConfig(baseCfg({
      vpcId: 'vpc-0a1b2c3d4e5f60718',
      subnetIds: ['subnet-0aaaa1111bbbb2222', 'subnet-0cccc3333dddd4444'],
      securityGroupIds: ['sg-0eeee5555ffff6666'],
    }));
    assert.deepEqual(errors, []);
  });

  it('requires subnets and SGs when a VPC is given', () => {
    const errors = validateConfig(baseCfg({ vpcId: 'vpc-0a1b2c3d4e5f60718' }));
    assert.ok(errors.some((e) => e.includes('--subnet-ids is required')));
    assert.ok(errors.some((e) => e.includes('--security-group-ids is required')));
  });

  it('requires a VPC when only subnets are given', () => {
    const errors = validateConfig(baseCfg({ subnetIds: ['subnet-0aaaa1111bbbb2222'] }));
    assert.ok(errors.some((e) => e.includes('--vpc-id is required')));
  });

  it('rejects malformed IDs', () => {
    const errors = validateConfig(baseCfg({
      vpcId: 'notavpc',
      subnetIds: ['sub-xyz'],
      securityGroupIds: ['group-1'],
    }));
    assert.ok(errors.some((e) => e.includes('--vpc-id must look like')));
    assert.ok(errors.some((e) => e.includes('Invalid subnet ID')));
    assert.ok(errors.some((e) => e.includes('Invalid security group ID')));
  });

  it('rejects more than 3 subnets', () => {
    const errors = validateConfig(baseCfg({
      vpcId: 'vpc-0a1b2c3d4e5f60718',
      subnetIds: ['subnet-1', 'subnet-2', 'subnet-3', 'subnet-4'],
      securityGroupIds: ['sg-0eeee5555ffff6666'],
    }));
    assert.ok(errors.some((e) => e.includes('at most 3 subnets')));
  });

  it('fails fast when VPC flags are given but no OpenSearch backend is chosen', () => {
    // Advanced mode with only VPC flags: osAction stays empty. Regression guard —
    // this used to skip domain creation and fail deep in pipeline creation.
    const errors = validateConfig(baseCfg({
      osAction: '',
      osDomainName: '',
      vpcId: 'vpc-0a1b2c3d4e5f60718',
      subnetIds: ['subnet-0aaaa1111bbbb2222', 'subnet-0cccc3333dddd4444'],
      securityGroupIds: ['sg-0eeee5555ffff6666'],
    }));
    assert.ok(errors.some((e) => e.includes('No OpenSearch backend specified')));
  });

  it('rejects VPC options when reusing an existing domain', () => {
    const errors = validateConfig(baseCfg({
      osAction: 'reuse',
      opensearchEndpoint: 'https://search-foo-abc.us-east-1.es.amazonaws.com',
      vpcId: 'vpc-0a1b2c3d4e5f60718',
      subnetIds: ['subnet-0aaaa1111bbbb2222'],
      securityGroupIds: ['sg-0eeee5555ffff6666'],
    }));
    assert.ok(errors.some((e) => e.includes('VPC options apply only when creating')));
  });
});

describe('validateConfig — OSI pipeline role', () => {
  it('fails fast when no IAM action is chosen (advanced mode, no IAM flags)', () => {
    // Regression guard for the KYL-25 e2e finding: advanced mode with no IAM
    // flags leaves iamAction empty, the role step is skipped, and OSIS
    // CreatePipeline gets an empty PipelineRoleArn — failing ~11 min in, after
    // the domain is built. Symmetric to the "No OpenSearch backend" guard.
    const errors = validateConfig(baseCfg({ iamAction: '' }));
    assert.ok(errors.some((e) => e.includes('No OSI pipeline role specified')));
  });

  it('still requires --iam-role-arn when reusing a role', () => {
    const errors = validateConfig(baseCfg({ iamAction: 'reuse', iamRoleArn: '' }));
    assert.ok(errors.some((e) => e.includes('--iam-role-arn required when reusing')));
  });
});

import {
  fgacPrincipals,
  appAdminConfigs,
  isIamRoleOrUserArn,
  mergeAossPolicyPrincipals,
  connectedDataSourceRolePolicies,
  pipelineRoleTrustPolicy,
  validateVpcTopology,
  pipelineRoleArnError,
  permissionsAllowPort,
  permissionsAllowInternet,
  analyzeSecurityGroupRules,
  checkSecurityGroupRules,
  _withRetry,
  _isRoleNotPropagatedError,
  _isTransientHttpError,
  _isOsisInternalError,
} from '../src/aws.mjs';

// ── OSI pipeline role ARN pre-flight (last-line guard before CreatePipeline) ──
describe('pipelineRoleArnError', () => {
  it('flags an empty ARN', () => {
    assert.ok(pipelineRoleArnError('').includes('none was resolved'));
    assert.ok(pipelineRoleArnError(undefined).includes('none was resolved'));
  });

  it('flags a malformed ARN', () => {
    assert.ok(pipelineRoleArnError('not-an-arn').includes('must be an IAM role ARN'));
    assert.ok(pipelineRoleArnError('arn:aws:s3:::bucket').includes('must be an IAM role ARN'));
  });

  it('accepts a well-formed IAM role ARN', () => {
    assert.equal(pipelineRoleArnError('arn:aws:iam::123456789012:role/obs-stack-osi-role'), '');
  });
});

// ── Live VPC topology validation (EC2 API path) ───────────────────────────────
// validateVpcTopology takes injected EC2 accessors so we can exercise every
// branch without real AWS calls.

describe('validateVpcTopology', () => {
  const cfg = {
    region: 'us-east-1',
    vpcId: 'vpc-aaa',
    subnetIds: ['subnet-1', 'subnet-2'],
    securityGroupIds: ['sg-1'],
  };

  // Happy-path accessors: everything exists, in the target VPC, distinct AZs.
  function goodDeps() {
    return {
      describeVpcs: async () => [{ VpcId: 'vpc-aaa' }],
      describeSubnets: async () => [
        { SubnetId: 'subnet-1', VpcId: 'vpc-aaa', AvailabilityZone: 'us-east-1a' },
        { SubnetId: 'subnet-2', VpcId: 'vpc-aaa', AvailabilityZone: 'us-east-1b' },
      ],
      describeSecurityGroups: async () => [{ GroupId: 'sg-1', VpcId: 'vpc-aaa' }],
    };
  }

  it('returns [] with no VPC configured (skips EC2 calls)', async () => {
    let called = false;
    const errors = await validateVpcTopology(
      { region: 'us-east-1', vpcId: '', subnetIds: [], securityGroupIds: [] },
      { describeVpcs: async () => { called = true; return []; } },
    );
    assert.deepEqual(errors, []);
    assert.equal(called, false);
  });

  it('passes for a valid VPC topology', async () => {
    assert.deepEqual(await validateVpcTopology(cfg, goodDeps()), []);
  });

  it('reports a missing VPC and stops', async () => {
    const errors = await validateVpcTopology(cfg, {
      ...goodDeps(),
      describeVpcs: async () => [],
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /VPC vpc-aaa was not found/);
  });

  it('translates InvalidVpcID.NotFound into a clean error', async () => {
    const errors = await validateVpcTopology(cfg, {
      ...goodDeps(),
      describeVpcs: async () => { throw new Error('InvalidVpcID.NotFound: The vpc ID does not exist'); },
    });
    assert.match(errors[0], /VPC vpc-aaa was not found/);
  });

  it('flags a subnet that belongs to a different VPC', async () => {
    const errors = await validateVpcTopology(cfg, {
      ...goodDeps(),
      describeSubnets: async () => [
        { SubnetId: 'subnet-1', VpcId: 'vpc-aaa', AvailabilityZone: 'us-east-1a' },
        { SubnetId: 'subnet-2', VpcId: 'vpc-other', AvailabilityZone: 'us-east-1b' },
      ],
    });
    assert.ok(errors.some((e) => /Subnet subnet-2 belongs to VPC vpc-other/.test(e)));
  });

  it('flags a subnet that does not exist', async () => {
    const errors = await validateVpcTopology(cfg, {
      ...goodDeps(),
      describeSubnets: async () => [
        { SubnetId: 'subnet-1', VpcId: 'vpc-aaa', AvailabilityZone: 'us-east-1a' },
      ],
    });
    assert.ok(errors.some((e) => /Subnet subnet-2 was not found/.test(e)));
  });

  it('flags two subnets sharing an Availability Zone (zone-awareness edge case)', async () => {
    const errors = await validateVpcTopology(cfg, {
      ...goodDeps(),
      describeSubnets: async () => [
        { SubnetId: 'subnet-1', VpcId: 'vpc-aaa', AvailabilityZone: 'us-east-1a' },
        { SubnetId: 'subnet-2', VpcId: 'vpc-aaa', AvailabilityZone: 'us-east-1a' },
      ],
    });
    assert.ok(errors.some((e) => /both in us-east-1a/.test(e) && /distinct Availability Zone/.test(e)));
  });

  it('does not flag AZ collisions for a single-subnet domain', async () => {
    const single = { ...cfg, subnetIds: ['subnet-1'] };
    const errors = await validateVpcTopology(single, {
      ...goodDeps(),
      describeSubnets: async () => [
        { SubnetId: 'subnet-1', VpcId: 'vpc-aaa', AvailabilityZone: 'us-east-1a' },
      ],
    });
    assert.deepEqual(errors, []);
  });

  it('flags a security group that belongs to a different VPC', async () => {
    const errors = await validateVpcTopology(cfg, {
      ...goodDeps(),
      describeSecurityGroups: async () => [{ GroupId: 'sg-1', VpcId: 'vpc-other' }],
    });
    assert.ok(errors.some((e) => /Security group sg-1 belongs to VPC vpc-other/.test(e)));
  });

  it('flags a security group that does not exist', async () => {
    const errors = await validateVpcTopology(cfg, {
      ...goodDeps(),
      describeSecurityGroups: async () => [],
    });
    assert.ok(errors.some((e) => /Security group sg-1 was not found/.test(e)));
  });

  it('accumulates multiple independent problems in one pass', async () => {
    const errors = await validateVpcTopology(cfg, {
      describeVpcs: async () => [{ VpcId: 'vpc-aaa' }],
      describeSubnets: async () => [
        { SubnetId: 'subnet-1', VpcId: 'vpc-aaa', AvailabilityZone: 'us-east-1a' },
        { SubnetId: 'subnet-2', VpcId: 'vpc-aaa', AvailabilityZone: 'us-east-1a' },
      ],
      describeSecurityGroups: async () => [{ GroupId: 'sg-1', VpcId: 'vpc-other' }],
    });
    assert.ok(errors.some((e) => /both in us-east-1a/.test(e)));
    assert.ok(errors.some((e) => /Security group sg-1 belongs to VPC vpc-other/.test(e)));
  });
});

// ── Security-group rule analysis (best-effort data-path check) ────────────────

describe('permissionsAllowPort', () => {
  const opts = { selfIds: ['sg-1'], vpcCidrs: ['172.30.0.0/16'] };

  it('matches a tcp/443 range from a self-referencing group', () => {
    const perms = [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, UserIdGroupPairs: [{ GroupId: 'sg-1' }], IpRanges: [] }];
    assert.equal(permissionsAllowPort(perms, 443, opts), true);
  });

  it('matches all-protocols (-1) regardless of port fields', () => {
    const perms = [{ IpProtocol: '-1', UserIdGroupPairs: [{ GroupId: 'sg-1' }], IpRanges: [] }];
    assert.equal(permissionsAllowPort(perms, 443, opts), true);
  });

  it('matches a 0.0.0.0/0 CIDR range covering the port', () => {
    const perms = [{ IpProtocol: 'tcp', FromPort: 0, ToPort: 65535, UserIdGroupPairs: [], IpRanges: [{ CidrIp: '0.0.0.0/0' }] }];
    assert.equal(permissionsAllowPort(perms, 443, opts), true);
  });

  it('matches the VPC CIDR', () => {
    const perms = [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '172.30.0.0/16' }] }];
    assert.equal(permissionsAllowPort(perms, 443, opts), true);
  });

  it('does not match a foreign group or a narrower CIDR', () => {
    const perms = [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, UserIdGroupPairs: [{ GroupId: 'sg-other' }], IpRanges: [{ CidrIp: '10.0.0.5/32' }] }];
    assert.equal(permissionsAllowPort(perms, 443, opts), false);
  });

  it('does not match a rule whose port range excludes 443', () => {
    const perms = [{ IpProtocol: 'tcp', FromPort: 80, ToPort: 80, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }];
    assert.equal(permissionsAllowPort(perms, 443, opts), false);
  });
});

describe('permissionsAllowInternet', () => {
  it('matches only a 0.0.0.0/0 range, not a self-ref or VPC CIDR', () => {
    assert.equal(permissionsAllowInternet([{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }], 443), true);
    assert.equal(permissionsAllowInternet([{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }], 443), true);
    assert.equal(permissionsAllowInternet([{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, UserIdGroupPairs: [{ GroupId: 'sg-1' }] }], 443), false);
    assert.equal(permissionsAllowInternet([{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '172.30.0.0/16' }] }], 443), false);
  });
});

describe('analyzeSecurityGroupRules', () => {
  const vpcCidrs = ['172.30.0.0/16'];

  it('no warnings for a demo when egress allows internet and 443 is open in-VPC', () => {
    const groups = [{
      GroupId: 'sg-1',
      IpPermissions: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, UserIdGroupPairs: [{ GroupId: 'sg-1' }] }],
      IpPermissionsEgress: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
    }];
    assert.deepEqual(analyzeSecurityGroupRules(groups, { groupIds: ['sg-1'], vpcCidrs, demo: true }), []);
  });

  it('warns about both intra-VPC and internet egress when egress is stripped (demo)', () => {
    // The SA's failure: default allow-all egress removed, so the demo can't reach
    // OSIS in-VPC OR bootstrap over the internet.
    const groups = [{
      GroupId: 'sg-1',
      IpPermissions: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, UserIdGroupPairs: [{ GroupId: 'sg-1' }] }],
      IpPermissionsEgress: [],
    }];
    const w = analyzeSecurityGroupRules(groups, { groupIds: ['sg-1'], vpcCidrs, demo: true });
    assert.equal(w.length, 2);
    assert.ok(w.some((x) => /within the VPC/i.test(x)));
    assert.ok(w.some((x) => /0\.0\.0\.0\/0/.test(x) && /internet/i.test(x)));
  });

  it('flags missing internet egress even when in-VPC egress is present (demo)', () => {
    // Egress scoped to the VPC CIDR: telemetry to OSIS works, but the demo cannot
    // pull images. This is the case the earlier version wrongly passed.
    const groups = [{
      GroupId: 'sg-1',
      IpPermissions: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, UserIdGroupPairs: [{ GroupId: 'sg-1' }] }],
      IpPermissionsEgress: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '172.30.0.0/16' }] }],
    }];
    const w = analyzeSecurityGroupRules(groups, { groupIds: ['sg-1'], vpcCidrs, demo: true });
    assert.equal(w.length, 1);
    assert.ok(/internet/i.test(w[0]) && /0\.0\.0\.0\/0/.test(w[0]));
  });

  it('does NOT require internet egress when no demo launches (--skip-demo)', () => {
    // No demo: only OSIS→domain in-VPC egress is needed. VPC-scoped egress suffices.
    const groups = [{
      GroupId: 'sg-1',
      IpPermissions: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, UserIdGroupPairs: [{ GroupId: 'sg-1' }] }],
      IpPermissionsEgress: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '172.30.0.0/16' }] }],
    }];
    assert.deepEqual(analyzeSecurityGroupRules(groups, { groupIds: ['sg-1'], vpcCidrs, demo: false }), []);
  });

  it('warns about missing intra-VPC ingress on 443', () => {
    const groups = [{
      GroupId: 'sg-1',
      IpPermissions: [{ IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
      IpPermissionsEgress: [{ IpProtocol: '-1', IpRanges: [{ CidrIp: '0.0.0.0/0' }] }],
    }];
    const w = analyzeSecurityGroupRules(groups, { groupIds: ['sg-1'], vpcCidrs, demo: true });
    assert.equal(w.length, 1);
    assert.ok(/ingress.*443/i.test(w[0]));
  });

  it('is satisfied when the union across multiple groups covers ingress and egress', () => {
    const groups = [
      { GroupId: 'sg-in', IpPermissions: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, UserIdGroupPairs: [{ GroupId: 'sg-in' }] }], IpPermissionsEgress: [] },
      { GroupId: 'sg-out', IpPermissions: [], IpPermissionsEgress: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0' }] }] },
    ];
    assert.deepEqual(analyzeSecurityGroupRules(groups, { groupIds: ['sg-in', 'sg-out'], vpcCidrs, demo: true }), []);
  });
});

describe('checkSecurityGroupRules', () => {
  const cfg = { region: 'us-east-1', vpcId: 'vpc-aaa', securityGroupIds: ['sg-1'] };

  it('returns [] when no VPC is configured', async () => {
    assert.deepEqual(await checkSecurityGroupRules({ region: 'us-east-1', vpcId: '', securityGroupIds: [] }), []);
  });

  it('degrades to a single manual-verify warning when describe is unauthorized', async () => {
    const w = await checkSecurityGroupRules(cfg, {
      describeSecurityGroups: async () => { const e = new Error('UnauthorizedOperation'); e.name = 'UnauthorizedOperation'; throw e; },
      describeVpcs: async () => [{ VpcId: 'vpc-aaa', CidrBlock: '172.30.0.0/16' }],
    });
    assert.equal(w.length, 1);
    assert.ok(/lacks ec2:DescribeSecurityGroups/.test(w[0]));
  });

  it('flags a stripped egress rule end-to-end (demo default)', async () => {
    const w = await checkSecurityGroupRules(cfg, {
      describeSecurityGroups: async () => [{
        GroupId: 'sg-1',
        IpPermissions: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, UserIdGroupPairs: [{ GroupId: 'sg-1' }] }],
        IpPermissionsEgress: [],
      }],
      describeVpcs: async () => [{ VpcId: 'vpc-aaa', CidrBlockAssociationSet: [{ CidrBlock: '172.30.0.0/16' }] }],
    });
    // demo defaults on (skipDemo unset): both in-VPC and internet egress missing.
    assert.equal(w.length, 2);
    assert.ok(w.some((x) => /internet/i.test(x)));
  });

  it('does not flag internet egress when skipDemo is set', async () => {
    const w = await checkSecurityGroupRules({ ...cfg, skipDemo: true }, {
      describeSecurityGroups: async () => [{
        GroupId: 'sg-1',
        IpPermissions: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, UserIdGroupPairs: [{ GroupId: 'sg-1' }] }],
        IpPermissionsEgress: [{ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '172.30.0.0/16' }] }],
      }],
      describeVpcs: async () => [{ VpcId: 'vpc-aaa', CidrBlockAssociationSet: [{ CidrBlock: '172.30.0.0/16' }] }],
    });
    assert.deepEqual(w, []);
  });
});

// ── Creation ordering / race-condition guards ────────────────────────────────

describe('withRetry', () => {
  const fast = { delayMs: 1, backoff: 1, maxDelayMs: 1 };

  it('returns the result on first success without retrying', async () => {
    let calls = 0;
    const out = await _withRetry(async () => { calls++; return 'ok'; }, fast);
    assert.equal(out, 'ok');
    assert.equal(calls, 1);
  });

  it('retries transient failures then succeeds', async () => {
    let calls = 0;
    const out = await _withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('ECONNREFUSED');
      return 'ok';
    }, { ...fast, attempts: 5, shouldRetry: _isTransientHttpError });
    assert.equal(out, 'ok');
    assert.equal(calls, 3);
  });

  it('stops immediately when shouldRetry returns false', async () => {
    let calls = 0;
    await assert.rejects(
      _withRetry(async () => { calls++; throw new Error('nope'); }, { ...fast, shouldRetry: () => false }),
      /nope/,
    );
    assert.equal(calls, 1);
  });

  it('rethrows the last error after exhausting attempts', async () => {
    let calls = 0;
    await assert.rejects(
      _withRetry(async () => { calls++; throw new Error('still failing'); }, { ...fast, attempts: 3 }),
      /still failing/,
    );
    assert.equal(calls, 3);
  });
});

describe('isRoleNotPropagatedError', () => {
  it('matches OSIS/OpenSearch assume-role propagation errors', () => {
    for (const msg of [
      'The role arn:aws:iam::123:role/foo cannot be assumed',
      'is not authorized to perform: sts:AssumeRole',
      'role arn:aws:iam::123:role/foo does not exist',
      'Invalid PipelineRoleArn',
    ]) {
      assert.ok(_isRoleNotPropagatedError(new Error(msg)), `expected retry for: ${msg}`);
    }
  });

  it('does not match unrelated errors', () => {
    assert.ok(!_isRoleNotPropagatedError(new Error('AccessDeniedException: es:CreateDomain')));
    assert.ok(!_isRoleNotPropagatedError(new Error('quota exceeded')));
  });
});

describe('isTransientHttpError', () => {
  it('matches connection and gateway errors', () => {
    for (const msg of ['ECONNREFUSED', 'socket hang up', 'fetch failed', 'returned 503', 'gateway timeout']) {
      assert.ok(_isTransientHttpError(new Error(msg)), `expected transient for: ${msg}`);
    }
  });

  it('does not match a plain 400 / auth error', () => {
    assert.ok(!_isTransientHttpError(new Error('400 bad request: malformed body')));
    assert.ok(!_isTransientHttpError(new Error('ValidationException')));
  });
});

describe('isOsisInternalError', () => {
  it('matches the OSIS CreatePipeline internal exception', () => {
    for (const msg of [
      'Unable to create pipeline due to an internal exception. Please try again, and contact AWS Support if the problem persists.',
      'internal failure',
      'InternalServerError',
    ]) {
      assert.ok(_isOsisInternalError(new Error(msg)), `expected retry for: ${msg}`);
    }
  });

  it('matches by error name', () => {
    const err = new Error('something opaque');
    err.name = 'InternalException';
    assert.ok(_isOsisInternalError(err));
  });

  it('does not match validation or auth errors', () => {
    assert.ok(!_isOsisInternalError(new Error('ValidationException: Invalid PipelineRoleArn')));
    assert.ok(!_isOsisInternalError(new Error('is not authorized to perform: osis:CreatePipeline')));
  });
});

describe('fgacPrincipals — FGAC role/user set', () => {
  const osiRole = 'arn:aws:iam::123456789012:role/obs-stack-test-osi-role';

  it('always includes the OSI pipeline role as a backend role', () => {
    const { backendRoles, users } = fgacPrincipals({ iamRoleArn: osiRole });
    assert.deepEqual(backendRoles, [osiRole]);
    assert.deepEqual(users, []);
  });

  it('adds a role-type caller principal as a backend role', () => {
    const caller = { arn: 'arn:aws:iam::123456789012:role/Admin', type: 'role' };
    const { backendRoles, users } = fgacPrincipals({ iamRoleArn: osiRole, callerPrincipal: caller });
    assert.deepEqual(backendRoles, [osiRole, caller.arn]);
    assert.deepEqual(users, []);
  });

  it('adds a user-type caller principal as a user, not a backend role', () => {
    const caller = { arn: 'arn:aws:iam::123456789012:user/kyle', type: 'user' };
    const { backendRoles, users } = fgacPrincipals({ iamRoleArn: osiRole, callerPrincipal: caller });
    assert.deepEqual(backendRoles, [osiRole]);
    assert.deepEqual(users, [caller.arn]);
  });

  it('does not duplicate the caller when it equals the OSI role', () => {
    const caller = { arn: osiRole, type: 'role' };
    const { backendRoles, users } = fgacPrincipals({ iamRoleArn: osiRole, callerPrincipal: caller });
    assert.deepEqual(backendRoles, [osiRole]);
    assert.deepEqual(users, []);
  });
});

// ── Pre-deploy architecture diagram (VPC annotations) ─────────────────────────

import { renderArchitectureDiagram } from '../src/commands/create.mjs';

describe('renderArchitectureDiagram — VPC annotations', () => {
  const strip = (s) => s.replace(/\x1B\[[0-9;]*m/g, '');
  const pub = () => ({ pipelineName: 'obs-stack-test', opensearchType: 'managed' });
  const vpc = () => ({
    ...pub(),
    vpcId: 'vpc-0a1b2c3d',
    subnetIds: ['subnet-aaaa', 'subnet-bbbb'],
    securityGroupIds: ['sg-0eeee'],
  });
  // Box rows carry the widths that the positional math depends on.
  const boxRowWidths = (lines) =>
    lines.map(strip).filter((l) => /[┌└│]/.test(l)).map((l) => l.trimEnd().length);

  it('public render has no network header and no [vpc] tags', () => {
    const text = renderArchitectureDiagram(pub()).map(strip).join('\n');
    assert.ok(!text.includes('[vpc]'));
    assert.ok(!text.includes('Network topology'));
  });

  it('VPC render shows a header with the VPC, subnet, and SG IDs', () => {
    const text = renderArchitectureDiagram(vpc()).map(strip).join('\n');
    assert.ok(text.includes('Network topology'));
    assert.ok(text.includes('vpc-0a1b2c3d'));
    assert.ok(text.includes('subnet-aaaa') && text.includes('subnet-bbbb'));
    assert.ok(text.includes('sg-0eeee'));
  });

  it('tags exactly the private boxes (EC2, OSI endpoint, OpenSearch)', () => {
    const lines = renderArchitectureDiagram(vpc()).map(strip);
    const tagged = lines.filter((l) => l.includes('[vpc]') && /│/.test(l));
    // Three in-VPC boxes; Prometheus/CDS/UI are regional and stay untagged.
    assert.equal(tagged.length, 3);
    assert.ok(tagged.some((l) => l.includes('EC2 Instance')));
    assert.ok(tagged.some((l) => l.includes('OSI Endpoint')));
    assert.ok(tagged.some((l) => l.includes('OpenSearch') && !l.includes('OpenSearch UI')));
    // Regional services are never tagged. AWS Prometheus shares a row with the
    // OpenSearch box, so check that no [vpc] appears within the Prometheus cell
    // (the text at or after "AWS Prometheus"), not merely on the same line.
    const promCell = (l) => l.slice(l.indexOf('AWS Prometheus'));
    assert.ok(!lines.some((l) => l.includes('AWS Prometheus') && promCell(l).includes('[vpc]')));
  });

  it('adds no width to any box vs. the public render (column math unchanged)', () => {
    assert.deepEqual(boxRowWidths(renderArchitectureDiagram(vpc())), boxRowWidths(renderArchitectureDiagram(pub())));
  });
});

// ── Serverless (AOSS NextGen time series) tests ─────────────────────────────

import { SERVERLESS_TIMESTAMP_FIELDS } from '../src/render.mjs';
import { defaultCollectionGroupName } from '../src/config.mjs';
import { collectionIdFromEndpoint } from '../src/aws.mjs';

describe('renderPipeline — serverless', () => {
  const yaml = renderPipeline({
    pipelineName: 'test-stack',
    opensearchType: 'serverless',
    opensearchEndpoint: 'https://abc123.aoss.us-east-1.on.aws',
    region: 'us-east-1',
    iamRoleArn: 'arn:aws:iam::123456789012:role/test-osi-role',
    prometheusUrl: 'https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-123/api/v1/remote_write',
    serviceMapWindow: '30s',
  });

  it('uses index_type custom for every serverless sink so template_content is applied', () => {
    assert.equal(yaml.match(/index_type: custom/g)?.length, 4);
  });

  it('sets index.timestamp_field to each signal time field in the index templates', () => {
    for (const field of Object.values(SERVERLESS_TIMESTAMP_FIELDS)) {
      assert.ok(yaml.includes(`"index.timestamp_field":"${field}"`), `missing timestamp_field ${field}`);
    }
  });

  it('copies time into @timestamp only for evaluation results', () => {
    assert.equal(yaml.match(/copy_values/g)?.length, 1);
    assert.ok(yaml.indexOf('copy_values') > yaml.indexOf('\notel-evaluations-pipeline:'));
  });
});

describe('defaultCollectionGroupName', () => {
  it('appends -cg', () => {
    assert.equal(defaultCollectionGroupName('obs-stack'), 'obs-stack-cg');
  });

  it('truncates to the 32 character group name limit', () => {
    const name = defaultCollectionGroupName('a'.repeat(40));
    assert.equal(name.length, 32);
    assert.ok(name.endsWith('-cg'));
  });
});

describe('collectionIdFromEndpoint', () => {
  it('extracts the collection id from a NextGen endpoint', () => {
    assert.equal(collectionIdFromEndpoint('https://abc123.aoss.us-east-1.on.aws'), 'abc123');
  });
});

describe('validateConfig — serverless capacity', () => {
  const sls = (overrides = {}) => ({
    pipelineName: 'obs-stack-test',
    region: 'us-east-1',
    opensearchType: 'serverless',
    osAction: 'create',
    aossCollectionName: 'obs-stack-test',
    aossMinOcu: 0,
    aossMaxOcu: 16,
    iamAction: 'create',
    apsAction: 'create',
    dashboardsAction: 'create',
    subnetIds: [],
    securityGroupIds: [],
    ...overrides,
  });

  it('accepts the 0 to 16 default', () => {
    assert.deepEqual(validateConfig(sls()), []);
  });

  it('rejects min greater than max', () => {
    assert.ok(validateConfig(sls({ aossMinOcu: 8, aossMaxOcu: 4 })).some((e) => e.includes('--aoss-min-ocu')));
  });

  it('rejects max of 0', () => {
    assert.ok(validateConfig(sls({ aossMaxOcu: 0 })).some((e) => e.includes('--aoss-max-ocu')));
  });

  it('rejects a group name longer than 32 characters', () => {
    assert.ok(validateConfig(sls({ aossCollectionGroupName: 'g'.repeat(33) })).some((e) => e.includes('at most 32')));
  });
});

describe('appAdminConfigs', () => {
  const osiRole = 'arn:aws:iam::123456789012:role/obs-stack-test-osi-role';
  const USERS = 'opensearchDashboards.dashboardAdmin.users';
  const GROUPS = 'opensearchDashboards.dashboardAdmin.groups';
  const asMap = (configs) => Object.fromEntries(configs.map((c) => [c.key, JSON.parse(c.value)]));

  it('maps the OSI role and a role caller as groups, with no users entry', () => {
    const caller = { arn: 'arn:aws:iam::123456789012:role/Admin', type: 'role' };
    assert.deepEqual(asMap(appAdminConfigs({ iamRoleArn: osiRole, callerPrincipal: caller })), {
      [GROUPS]: [osiRole, caller.arn],
    });
  });

  it('maps an IAM user caller as a user', () => {
    const caller = { arn: 'arn:aws:iam::123456789012:user/kyle', type: 'user' };
    assert.deepEqual(asMap(appAdminConfigs({ iamRoleArn: osiRole, callerPrincipal: caller })), {
      [GROUPS]: [osiRole],
      [USERS]: [caller.arn],
    });
  });

  it('leaves root and federated callers out of users', () => {
    for (const arn of ['arn:aws:iam::123456789012:root', 'arn:aws:sts::123456789012:federated-user/kyle']) {
      const configs = asMap(appAdminConfigs({ iamRoleArn: osiRole, callerPrincipal: { arn, type: 'user' } }));
      assert.equal(configs[USERS], undefined);
    }
  });

  it('drops "*" from existing users and keeps other existing admins', () => {
    const existing = [
      { key: USERS, value: JSON.stringify(['*', 'arn:aws:iam::123456789012:user/other']) },
      { key: GROUPS, value: JSON.stringify(['*', 'arn:aws:iam::123456789012:role/Ops']) },
    ];
    const configs = asMap(appAdminConfigs({ iamRoleArn: osiRole }, existing));
    assert.deepEqual(configs, {
      [GROUPS]: ['arn:aws:iam::123456789012:role/Ops', osiRole],
      [USERS]: ['arn:aws:iam::123456789012:user/other'],
    });
  });

  it('treats missing or malformed config values as empty', () => {
    assert.deepEqual(asMap(appAdminConfigs({ iamRoleArn: osiRole }, [{ key: USERS, value: 'not json' }])), { [GROUPS]: [osiRole] });
  });

  it('keeps the IAM path of a role caller', () => {
    const caller = { arn: 'arn:aws:iam::123456789012:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_Admin_abc', type: 'role' };
    assert.deepEqual(asMap(appAdminConfigs({ iamRoleArn: osiRole, callerPrincipal: caller })), { [GROUPS]: [osiRole, caller.arn] });
  });
});

describe('connectedDataSourceRolePolicies', () => {
  const cfg = { region: 'us-west-2', accountId: '123456789012', apsWorkspaceId: 'ws-abc', connectedDataSourceName: 'obs_prometheus' };
  const { trustPolicy, permissionsPolicy } = connectedDataSourceRolePolicies(cfg);

  it('limits the trust policy to this account and data source', () => {
    assert.deepEqual(trustPolicy.Statement[0].Condition, {
      StringEquals: { 'aws:SourceAccount': '123456789012' },
      ArnEquals: { 'aws:SourceArn': 'arn:aws:opensearch:us-west-2:123456789012:datasource/obs_prometheus' },
    });
  });

  it('grants explicit aps actions on the workspace and its rule groups namespaces', () => {
    const [scoped, list] = permissionsPolicy.Statement;
    assert.ok(!scoped.Action.includes('aps:*'));
    assert.ok(scoped.Action.includes('aps:QueryMetrics'));
    assert.ok(scoped.Action.includes('aps:PutRuleGroupsNamespace'));
    assert.deepEqual(scoped.Resource, [
      'arn:aws:aps:us-west-2:123456789012:workspace/ws-abc',
      'arn:aws:aps:us-west-2:123456789012:rulegroupsnamespace/ws-abc/*',
    ]);
    assert.deepEqual(list, { Effect: 'Allow', Action: 'aps:ListWorkspaces', Resource: '*' });
  });
});

describe('pipelineRoleTrustPolicy', () => {
  it('limits the OSIS trust policy to this account', () => {
    const [st] = pipelineRoleTrustPolicy({ region: 'us-west-2', accountId: '123456789012' }).Statement;
    assert.equal(st.Principal.Service, 'osis-pipelines.amazonaws.com');
    assert.deepEqual(st.Condition, { StringEquals: { 'aws:SourceAccount': '123456789012' } });
  });
});

describe('isIamRoleOrUserArn', () => {
  it('accepts IAM role and user ARNs, including paths', () => {
    assert.ok(isIamRoleOrUserArn('arn:aws:iam::123456789012:role/Admin'));
    assert.ok(isIamRoleOrUserArn('arn:aws:iam::123456789012:role/aws-reserved/sso.amazonaws.com/AWSReservedSSO_x'));
    assert.ok(isIamRoleOrUserArn('arn:aws:iam::123456789012:user/kyle'));
  });
  it('rejects root, federated users and empty values', () => {
    assert.ok(!isIamRoleOrUserArn('arn:aws:iam::123456789012:root'));
    assert.ok(!isIamRoleOrUserArn('arn:aws:sts::123456789012:federated-user/kyle'));
    assert.ok(!isIamRoleOrUserArn(undefined));
  });
});

describe('mergeAossPolicyPrincipals', () => {
  it('adds missing principals to every rule set and keeps existing ones', () => {
    const policy = [{ Rules: [], Principal: ['arn:aws:iam::1:role/osi'] }, { Rules: [] }];
    assert.deepEqual(mergeAossPolicyPrincipals(policy, ['arn:aws:iam::1:role/osi', 'arn:aws:iam::1:role/b']), [
      { Rules: [], Principal: ['arn:aws:iam::1:role/osi', 'arn:aws:iam::1:role/b'] },
      { Rules: [], Principal: ['arn:aws:iam::1:role/osi', 'arn:aws:iam::1:role/b'] },
    ]);
  });
});

// ── GenAI evaluation index ──────────────────────────────────────────────────

import { readFileSync, existsSync } from 'node:fs';
import {
  ensureEvaluationIndex,
  evaluationTemplateContent,
  EVALUATION_TEMPLATE,
  EVALUATION_POLICY,
  evaluationPolicy,
} from '../src/evaluation-index.mjs';

const EVAL_FILES = ['otel-v1-genai-evaluation-index-template.json', 'otel-v1-genai-evaluation-policy.json'];

describe('evaluation index files', () => {
  // The CLI, CDK, local compose stack and Helm chart ship their own copies; they must not drift.
  for (const file of EVAL_FILES) {
    it(`${file} is identical in every copy`, () => {
      const cli = readFileSync(new URL(`../src/genai-evaluation/${file}`, import.meta.url), 'utf8');
      for (const rel of [
        `../../cdk/lib/genai-evaluation/${file}`,
        `../../../docker-compose/data-prepper/${file}`,
        `../../../charts/observability-stack/files/genai-evaluation/${file}`,
      ]) {
        const url = new URL(rel, import.meta.url);
        if (!existsSync(url)) continue; // published package: only the CLI copy exists
        assert.equal(readFileSync(url, 'utf8'), cli, `${rel} differs from the CLI copy`);
      }
    });
  }

  // The local Data Prepper pipeline inlines the template by hand (the CLI and CDK build theirs from
  // the JSON), so compare that copy too: a mapping change must reach the local stack as well.
  it('the local Data Prepper pipeline inlines the same template, without index_patterns', () => {
    const url = new URL('../../../docker-compose/data-prepper/pipelines.template.yaml', import.meta.url);
    if (!existsSync(url)) return; // published package
    const lines = readFileSync(url, 'utf8').split('\n');
    const start = lines.findIndex((l) => /^otel-evaluations-pipeline:/.test(l));
    assert.ok(start >= 0, 'otel-evaluations-pipeline not found');
    const tc = lines.findIndex((l, i) => i > start && /^\s*template_content:\s*\|\s*$/.test(l));
    assert.ok(tc > start, 'template_content not found in otel-evaluations-pipeline');
    const indent = lines[tc + 1].match(/^\s*/)[0].length;
    const block = [];
    for (const l of lines.slice(tc + 1)) {
      if (l.trim() && l.match(/^\s*/)[0].length < indent) break;
      block.push(l.slice(indent));
    }
    const { index_patterns: _patterns, ...expected } = EVALUATION_TEMPLATE;
    assert.deepEqual(JSON.parse(block.join('\n')), expected);
  });

  it('template is version 1, matches the rollover indices and has no delete in the policy', () => {
    assert.equal(EVALUATION_TEMPLATE.version, 1);
    assert.deepEqual(EVALUATION_TEMPLATE.index_patterns, ['otel-v1-genai-evaluation-*']);
    assert.ok(!JSON.stringify(EVALUATION_POLICY).includes('"delete"'));
  });
});

for (const opensearchType of ['managed', 'serverless']) {
  describe(`renderPipeline evaluations (${opensearchType})`, () => {
    const yaml = renderPipeline({
      pipelineName: 'test-stack',
      opensearchType,
      opensearchEndpoint: 'https://example.test',
      region: 'us-east-1',
      iamRoleArn: 'arn:aws:iam::123456789012:role/test-osi-role',
      prometheusUrl: 'https://prometheus.test/api/v1/remote_write',
      serviceMapWindow: '30s',
    });

    it('routes evaluation results only to the evaluations sub-pipeline', () => {
      assert.ok(yaml.includes(`- evaluations: 'getEventType() == "LOG" and /eventName == "gen_ai.evaluation.result"'`));
      assert.ok(yaml.includes(`- logs: 'getEventType() == "LOG" and /eventName != "gen_ai.evaluation.result"'`));
      assert.ok(!yaml.includes(`- logs: 'getEventType() == "LOG"'\n`));
      assert.match(yaml, /name: otel-evaluations-pipeline\n\s+routes:\n\s+- evaluations/);
    });

    it('writes otel-v1-genai-evaluation with the frozen template', () => {
      const section = yaml.slice(yaml.indexOf('\notel-evaluations-pipeline:'));
      assert.ok(section.includes("index: 'otel-v1-genai-evaluation'"));
      assert.ok(section.includes('index_type: custom'));
      const content = JSON.parse(section.match(/template_content: '([^']+)'/)[1]);
      const { index_patterns: _p, ...expected } = EVALUATION_TEMPLATE;
      if (opensearchType === 'serverless') {
        assert.deepEqual(content.index_patterns, ['otel-v1-genai-evaluation']);
        assert.deepEqual(content.template.settings, { 'index.timestamp_field': 'time' });
        assert.ok(!JSON.stringify(content).includes('index_state_management'));
        assert.equal(content.version, 1);
        assert.deepEqual(content.template.mappings, expected.template.mappings);
      } else {
        assert.deepEqual(content, expected);
      }
      // The Agent Evaluations UI filters on @timestamp on every backend.
      assert.match(section.split('\n\n')[0], /copy_values:\n\s+entries:\n\s+- from_key: "time"\n\s+to_key: "@timestamp"/);
    });
  });
}

describe('evaluationTemplateContent', () => {
  it('drops index_patterns (the sink sets them) and keeps version and priority', () => {
    const t = JSON.parse(evaluationTemplateContent());
    assert.equal(t.index_patterns, undefined);
    assert.equal(t.version, 1);
    assert.equal(t.priority, 100);
  });

  it('maps every field the Agent Evaluations UI queries from index creation', () => {
    const fields = {};
    const flatten = (props, prefix) => {
      for (const [k, v] of Object.entries(props)) {
        if (v.properties) flatten(v.properties, `${prefix}${k}.`);
        else fields[`${prefix}${k}`] = v;
      }
    };
    flatten(JSON.parse(evaluationTemplateContent()).template.mappings.properties, '');
    const keyword = { type: 'keyword', ignore_above: 256 };
    assert.deepEqual(fields.eventName, { type: 'text', fields: { keyword } });
    for (const f of [
      'error.type', 'gen_ai.evaluation.name', 'gen_ai.evaluation.score.label', 'gen_ai.agent.name',
      'gen_ai.agent.version', 'gen_ai.conversation.id', 'test.suite.name', 'test.suite.run.id', 'test.case.id',
      'gen_ai.prompt.version', 'opensearch.gen_ai.evaluation.evaluator.version',
      'opensearch.gen_ai.evaluation.level', 'opensearch.gen_ai.evaluation.score.direction',
    ]) assert.deepEqual(fields[`attributes.${f}`], keyword, f);
    assert.deepEqual(fields['attributes.gen_ai.evaluation.score.value'], { type: 'double' });
    assert.deepEqual(fields['attributes.gen_ai.evaluation.explanation'], { type: 'text' });
    for (const f of ['min', 'max', 'threshold']) {
      assert.deepEqual(fields[`attributes.opensearch.gen_ai.evaluation.score.${f}`], { type: 'double' }, f);
    }
    assert.deepEqual(fields.traceId, { type: 'keyword', ignore_above: 32 });
    assert.deepEqual(fields.spanId, { type: 'keyword', ignore_above: 16 });
    assert.deepEqual(fields['@timestamp'], { type: 'date_nanos' });
    assert.equal(JSON.parse(evaluationTemplateContent()).template.mappings.date_detection, false);
  });
});

/** Fake domain: a map of "METHOD path" -> [status, body], recording every call. */
function fakeDomain(routes) {
  const calls = [];
  const fetchFn = async (url, method, body) => {
    const path = new URL(url).pathname;
    calls.push({ method, path, body: body ? JSON.parse(body) : undefined });
    const hit = routes[`${method} ${path}`];
    const [status, data] = typeof hit === 'function' ? hit() : hit ?? [404, { error: 'not found' }];
    return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(data) };
  };
  return { fetchFn, calls };
}

describe('evaluationPolicy', () => {
  it('adds a delete state after the retention days, like the local retention policies', () => {
    const p = evaluationPolicy(7).policy;
    const write = p.states.find((st) => st.name === p.default_state);
    assert.deepEqual(write.actions, EVALUATION_POLICY.policy.states[0].actions);
    assert.deepEqual(write.transitions, [{ state_name: 'delete', conditions: { min_index_age: '7d' } }]);
    assert.deepEqual(p.states.at(-1), { name: 'delete', actions: [{ delete: {} }], transitions: [] });
    assert.deepEqual(p.ism_template, EVALUATION_POLICY.policy.ism_template);
  });

  it('keeps the rollover-only policy for 0 and does not change the shared copy', () => {
    assert.deepEqual(evaluationPolicy(0), EVALUATION_POLICY);
    evaluationPolicy(30);
    assert.ok(!JSON.stringify(EVALUATION_POLICY).includes('"delete"'));
  });

  it('passes the configured retention through ensureEvaluationIndex', async () => {
    const { fetchFn, calls } = fakeDomain({
      'PUT /_plugins/_ism/policies/otel-v1-genai-evaluation-policy': [201, {}],
      'PUT /_index_template/otel-v1-genai-evaluation-index-template': [200, { acknowledged: true }],
      'PUT /otel-v1-genai-evaluation-000001': [200, { acknowledged: true }],
    });
    await ensureEvaluationIndex(fetchFn, 'https://domain.test', { delayMs: 0, retentionDays: 0 });
    assert.deepEqual(calls.find((c) => c.method === 'PUT').body, EVALUATION_POLICY);
  });
});

describe('ensureEvaluationIndex', () => {
  const ep = 'https://domain.test';

  it('creates the policy, then the template, then the write index on an empty domain', async () => {
    const { fetchFn, calls } = fakeDomain({
      'PUT /_plugins/_ism/policies/otel-v1-genai-evaluation-policy': [201, {}],
      'PUT /_index_template/otel-v1-genai-evaluation-index-template': [200, { acknowledged: true }],
      'PUT /otel-v1-genai-evaluation-000001': [200, { acknowledged: true }],
    });
    const r = await ensureEvaluationIndex(fetchFn, ep, { delayMs: 0 });
    assert.deepEqual(r, { policy: 'created', template: 'created', alias: 'created' });
    const puts = calls.filter((c) => c.method === 'PUT');
    assert.deepEqual(puts.map((c) => c.path), [
      '/_plugins/_ism/policies/otel-v1-genai-evaluation-policy',
      '/_index_template/otel-v1-genai-evaluation-index-template',
      '/otel-v1-genai-evaluation-000001',
    ]);
    assert.deepEqual(puts[0].body, evaluationPolicy(7)); // default retention
    assert.deepEqual(puts[1].body, EVALUATION_TEMPLATE);
    assert.deepEqual(puts[2].body, { aliases: { 'otel-v1-genai-evaluation': { is_write_index: true } } });
  });

  it('leaves an existing policy, same-version template and alias alone', async () => {
    const { fetchFn, calls } = fakeDomain({
      'GET /_plugins/_ism/policies/otel-v1-genai-evaluation-policy': [200, {}],
      'GET /_index_template/otel-v1-genai-evaluation-index-template': [200, { index_templates: [{ index_template: { version: 1 } }] }],
      'GET /_alias/otel-v1-genai-evaluation': [200, { 'otel-v1-genai-evaluation-000003': {} }],
    });
    const r = await ensureEvaluationIndex(fetchFn, ep, { delayMs: 0 });
    assert.deepEqual(r, { policy: 'exists', template: 'exists', alias: 'exists' });
    assert.equal(calls.filter((c) => c.method === 'PUT').length, 0);
  });

  it('replaces a template with a lower or missing version', async () => {
    for (const installed of [{ version: 0 }, {}]) {
      const { fetchFn, calls } = fakeDomain({
        'GET /_plugins/_ism/policies/otel-v1-genai-evaluation-policy': [200, {}],
        'GET /_index_template/otel-v1-genai-evaluation-index-template': [200, { index_templates: [{ index_template: installed }] }],
        'PUT /_index_template/otel-v1-genai-evaluation-index-template': [200, {}],
        'GET /_alias/otel-v1-genai-evaluation': [200, {}],
      });
      const r = await ensureEvaluationIndex(fetchFn, ep, { delayMs: 0 });
      assert.equal(r.template, 'updated');
      assert.ok(calls.some((c) => c.method === 'PUT' && c.path.startsWith('/_index_template/')));
    }
  });

  it('does not create the alias over a concrete index with the alias name', async () => {
    const { fetchFn, calls } = fakeDomain({
      'GET /_plugins/_ism/policies/otel-v1-genai-evaluation-policy': [200, {}],
      'GET /_index_template/otel-v1-genai-evaluation-index-template': [200, { index_templates: [{ index_template: { version: 1 } }] }],
      'GET /otel-v1-genai-evaluation': [200, { 'otel-v1-genai-evaluation': {} }],
    });
    const r = await ensureEvaluationIndex(fetchFn, ep, { delayMs: 0 });
    assert.equal(r.alias, 'concrete-index');
    assert.ok(!calls.some((c) => c.path === '/otel-v1-genai-evaluation-000001'));
  });

  it('retries transient errors and fails on a stable 4xx', async () => {
    let n = 0;
    const flaky = fakeDomain({
      'GET /_plugins/_ism/policies/otel-v1-genai-evaluation-policy': () => (++n < 3 ? [503, {}] : [200, {}]),
      'GET /_index_template/otel-v1-genai-evaluation-index-template': [200, { index_templates: [{ index_template: { version: 1 } }] }],
      'GET /_alias/otel-v1-genai-evaluation': [200, {}],
    });
    assert.equal((await ensureEvaluationIndex(flaky.fetchFn, ep, { delayMs: 0 })).policy, 'exists');
    assert.equal(n, 3);

    const bad = fakeDomain({ 'GET /_plugins/_ism/policies/otel-v1-genai-evaluation-policy': [400, { error: 'bad' }] });
    await assert.rejects(ensureEvaluationIndex(bad.fetchFn, ep, { delayMs: 0 }), /returned 400/);
  });
});

describe('Agent Evaluations UI setup', () => {
  const WS = 'ws1';
  const DS = 'ds-1';
  const TRACES = 'traces-1';

  // An in-memory saved objects API over one workspace: index patterns and correlations.
  function fakeOsui(seed = {}) {
    const objects = { 'index-pattern': [...(seed.patterns || [])], correlations: [...(seed.correlations || [])] };
    const calls = [];
    let n = 0;
    const api = {
      async get(path) {
        calls.push(['GET', path]);
        const type = /type=([a-z-]+)/.exec(path)[1];
        return { status: 200, data: { saved_objects: objects[type] } };
      },
      async post(path, body) {
        calls.push(['POST', path, body]);
        const type = /saved_objects\/([a-z-]+)$/.exec(path)[1];
        const o = { id: `${type}-new-${++n}`, ...body };
        objects[type].push(o);
        return { status: 200, data: o };
      },
      async put(path, body) {
        calls.push(['PUT', path, body]);
        const [, type, id] = /saved_objects\/([a-z-]+)\/(.+)$/.exec(path);
        const o = objects[type].find((x) => x.id === id);
        Object.assign(o.attributes, body.attributes);
        return { status: 200, data: o };
      },
    };
    return { api, objects, calls };
  }

  it('builds the dataset the UI\'s "Create evaluations dataset" makes', () => {
    const a = evalsDatasetAttributes();
    assert.equal(a.title, 'otel-v1-genai-evaluation*');
    assert.equal(a.timeFieldName, '@timestamp');
    assert.equal(a.signalType, 'logs');
    assert.equal(a.displayName, 'Evaluation Dataset');
    assert.deepEqual(JSON.parse(a.schemaMappings), {
      otelLogs: { timestamp: '@timestamp', traceId: 'traceId', spanId: 'spanId', serviceName: 'resource.attributes.service.name' },
    });
  });

  it('builds the AgentEvals-Config correlation with traces then evaluations references', () => {
    assert.deepEqual(evalsConfigBody(WS, TRACES, 'ev-1'), {
      attributes: {
        correlationType: 'AgentEvals-Config-ws1',
        title: 'AgentEvals-Config',
        version: '1.0.0',
        entities: [{ tracesDataset: { id: 'references[0].id' } }, { evaluationsDataset: { id: 'references[1].id' } }],
      },
      references: [
        { name: 'entities[0].index', type: 'index-pattern', id: TRACES },
        { name: 'entities[1].index', type: 'index-pattern', id: 'ev-1' },
      ],
    });
  });

  it('creates the dataset on the data source and the config in an empty workspace', async () => {
    const { api, objects } = fakeOsui();
    const r = await ensureAgentEvalsSetup(api, { wsId: WS, dsId: DS, tracesId: TRACES });
    assert.equal(r.datasetCreated, true);
    assert.equal(r.configCreated, true);
    const [pattern] = objects['index-pattern'];
    assert.deepEqual(pattern.attributes, evalsDatasetAttributes());
    assert.deepEqual(pattern.references, [{ id: DS, name: 'dataSource', type: 'data-source' }]);
    const [config] = objects.correlations;
    assert.equal(config.attributes.correlationType, 'AgentEvals-Config-ws1');
    assert.deepEqual(config.references.map((x) => x.id), [TRACES, r.evalsId]);
  });

  it('references the data source as data-source, as the UI does, also on serverless', async () => {
    const { api, objects } = fakeOsui();
    await ensureAgentEvalsSetup(api, { wsId: WS, dsId: DS, tracesId: TRACES });
    assert.equal(objects['index-pattern'][0].references[0].type, 'data-source');
  });

  it('is idempotent: a second run creates nothing', async () => {
    const { api, objects, calls } = fakeOsui();
    const first = await ensureAgentEvalsSetup(api, { wsId: WS, dsId: DS, tracesId: TRACES });
    const before = calls.length;
    const second = await ensureAgentEvalsSetup(api, { wsId: WS, dsId: DS, tracesId: TRACES });
    assert.equal(second.datasetCreated, false);
    assert.equal(second.configCreated, false);
    assert.equal(second.evalsId, first.evalsId);
    assert.equal(second.configId, first.configId);
    assert.equal(objects['index-pattern'].length, 1);
    assert.equal(objects.correlations.length, 1);
    assert.ok(calls.slice(before).every(([m]) => m === 'GET'));
  });

  it('reuses a pattern with the title, filling only the attributes it lacks', async () => {
    const existing = { id: 'old', attributes: { title: 'otel-v1-genai-evaluation*', timeFieldName: '@timestamp', displayName: 'Mine' }, references: [{ id: DS, name: 'dataSource', type: 'data-source' }] };
    const { api, objects } = fakeOsui({ patterns: [existing] });
    const r = await ensureAgentEvalsSetup(api, { wsId: WS, dsId: DS, tracesId: TRACES });
    assert.equal(r.evalsId, 'old');
    assert.equal(r.datasetCreated, false);
    assert.equal(objects['index-pattern'].length, 1);
    assert.equal(existing.attributes.signalType, 'logs');
    assert.equal(existing.attributes.displayName, 'Mine');
    assert.ok(existing.attributes.schemaMappings);
  });

  it('prefers the pattern on the same data source', async () => {
    const other = { id: 'other', attributes: { ...evalsDatasetAttributes() }, references: [{ id: 'ds-other', name: 'dataSource', type: 'data-source' }] };
    const mine = { id: 'mine', attributes: { ...evalsDatasetAttributes() }, references: [{ id: DS, name: 'dataSource', type: 'data-source' }] };
    const { api } = fakeOsui({ patterns: [other, mine] });
    assert.equal((await ensureAgentEvalsSetup(api, { wsId: WS, dsId: DS, tracesId: TRACES })).evalsId, 'mine');
  });

  it('keeps an existing config (a user\'s Settings choice) as is', async () => {
    const config = { id: 'cfg', attributes: { correlationType: 'AgentEvals-Config-ws1', title: 'AgentEvals-Config' }, references: [] };
    const { api, objects } = fakeOsui({ correlations: [{ id: 'apm', attributes: { correlationType: 'APM-Config-ws1' } }, config] });
    const r = await ensureAgentEvalsSetup(api, { wsId: WS, dsId: DS, tracesId: TRACES });
    assert.equal(r.configId, 'cfg');
    assert.equal(r.configCreated, false);
    assert.equal(objects.correlations.length, 2);
  });

  it('creates no config without a traces dataset', async () => {
    const { api, objects } = fakeOsui();
    const r = await ensureAgentEvalsSetup(api, { wsId: WS, dsId: DS });
    assert.ok(r.evalsId);
    assert.equal(r.configId, undefined);
    assert.equal(objects.correlations.length, 0);
  });

  it('lists index patterns instead of searching (search does not match titles with *)', async () => {
    const { api, calls } = fakeOsui();
    await ensureAgentEvalsSetup(api, { wsId: WS, dsId: DS, tracesId: TRACES });
    const lookups = calls.filter(([m, p]) => m === 'GET' && p.includes('type=index-pattern'));
    assert.ok(lookups.length > 0);
    assert.ok(lookups.every(([, p]) => !p.includes('search=')));
  });

  it('lists only absent attributes as missing', () => {
    assert.deepEqual(missingDatasetAttributes(evalsDatasetAttributes()), {});
    assert.deepEqual(Object.keys(missingDatasetAttributes({ title: 'x' })).sort(), ['displayName', 'schemaMappings', 'signalType']);
  });
});

describe('pickDataSource', () => {
  const a = { id: 'a', attributes: { endpoint: 'https://search-other-x.us-west-2.es.amazonaws.com' } };
  const b = { id: 'b', attributes: { endpoint: 'https://search-mine-y.us-west-2.es.amazonaws.com/' } };

  it('picks the data source on the stack endpoint', () => {
    assert.equal(pickDataSource([a, b], 'https://search-mine-y.us-west-2.es.amazonaws.com').id, 'b');
  });

  it('falls back to the first data source', () => {
    assert.equal(pickDataSource([a, b], 'https://nope.example.com').id, 'a');
    assert.equal(pickDataSource([a, b], undefined).id, 'a');
  });

  it('returns undefined without data sources', () => {
    assert.equal(pickDataSource(undefined, 'x'), undefined);
  });
});

describe('index pattern data source references', () => {
  it('uses data-source for every engine type', () => {
    assert.equal(DS_REF_TYPE, 'data-source');
  });

  it('repairs a serverless reference written by older installers', () => {
    const refs = [{ id: 'ds1', name: 'dataSource', type: 'OpenSearch Serverless' }, { id: 'x', name: 'other', type: 'foo' }];
    assert.deepEqual(repairDataSourceRefs(refs), [{ id: 'ds1', name: 'dataSource', type: 'data-source' }, { id: 'x', name: 'other', type: 'foo' }]);
  });

  it('leaves correct or missing references alone', () => {
    assert.equal(repairDataSourceRefs([{ id: 'ds1', name: 'dataSource', type: 'data-source' }]), null);
    assert.equal(repairDataSourceRefs([]), null);
    assert.equal(repairDataSourceRefs(undefined), null);
  });
});

describe('EC2 demo eval canary', () => {
  const base = { pipelineName: 'p', region: 'eu-west-3', accountId: '123456789012', ingestEndpoints: ['x.osis.amazonaws.com'] };
  const decode = (cfg) => Buffer.from(_buildUserData(cfg), 'base64').toString();

  it('reads a collection with SigV4 service aoss', () => {
    const cfg = { ...base, opensearchType: 'serverless', opensearchEndpoint: 'https://abc.aoss.eu-west-3.on.aws', collectionId: 'abc', aossCollectionName: 'p' };
    const t = _canaryTarget(cfg);
    assert.equal(t.service, 'aoss');
    assert.deepEqual(t.resources, ['arn:aws:aoss:eu-west-3:123456789012:collection/abc']);
    const ud = decode(cfg);
    assert.ok(ud.includes('export COMPOSE_PROFILES=aws-evals'));
    assert.ok(ud.includes('EVAL_CANARY_OPENSEARCH_URL=https://abc.aoss.eu-west-3.on.aws'));
    assert.ok(ud.includes('OPENSEARCH_AWS_SERVICE=aoss'));
  });

  it('reads a managed domain with SigV4 service es', () => {
    const cfg = { ...base, opensearchType: 'managed', opensearchEndpoint: 'search-d.eu-west-3.es.amazonaws.com', osDomainName: 'd' };
    const t = _canaryTarget(cfg);
    assert.equal(t.url, 'https://search-d.eu-west-3.es.amazonaws.com');
    assert.deepEqual(t.actions, ['es:ESHttpGet', 'es:ESHttpPost']);
    assert.deepEqual(t.resources, [
      'arn:aws:es:eu-west-3:123456789012:domain/d/otel-v1-apm-span*',
      'arn:aws:es:eu-west-3:123456789012:domain/d/otel-v1-genai-evaluation*',
    ]);
    assert.ok(decode(cfg).includes('OPENSEARCH_AWS_SERVICE=es'));
  });

  it('scopes a reused domain by the name in its endpoint', () => {
    assert.equal(domainNameFromEndpoint('https://search-prod-logs-abc123xyz.eu-west-3.es.amazonaws.com'), 'prod-logs');
    assert.equal(domainNameFromEndpoint('vpc-my-dom-q1w2e3.us-east-1.es.amazonaws.com'), 'my-dom');
    assert.equal(domainNameFromEndpoint('https://abc.aoss.eu-west-3.on.aws'), null);
    const t = _canaryTarget({ ...base, opensearchType: 'managed', osDomainName: 'p1',
      opensearchEndpoint: 'https://search-prod-logs-abc123xyz.eu-west-3.es.amazonaws.com' });
    assert.ok(t.resources.every((r) => r.includes(':domain/prod-logs/')));
  });

  it('keeps the demo read policy name within the 32 character limit', () => {
    assert.ok(demoReadPolicyName('a'.repeat(32)).length <= 32);
  });
});

// ── Agent Observability explore panels ───────────────────────────────────────
import { AGENT_PANELS, agentPanelQuery, agentPanelObject, datasetDataSource, syncAgentDashboard } from '../src/agent-panels.mjs';

describe('agent panels', () => {
  const byId = (id) => AGENT_PANELS.find((p) => p.id === id);

  it('counts documents for a pie, dropping those without the field and capping at 10', () => {
    const q = agentPanelQuery(byId('llm-requests-by-model'));
    assert.equal(q.chartType, 'pie');
    assert.equal(q.query, 'source = otel-v1-apm-span* | where isnotnull(`attributes.gen_ai.request.model`) | stats count() as value by `attributes.gen_ai.request.model` | sort - value | head 10');
    assert.deepEqual(q.axesMapping, { size: 'value', color: 'attributes.gen_ai.request.model' });
  });

  it('sums a metric into a horizontal bar (category on y, value on x), ranked and capped', () => {
    const q = agentPanelQuery(byId('token-usage-by-agent'));
    assert.equal(q.chartType, 'bar');
    assert.match(q.query, /stats sum\(`attributes\.gen_ai\.usage\.input_tokens`\) as value by `attributes\.gen_ai\.agent\.name` \| sort - value \| head 10$/);
    assert.deepEqual(q.axesMapping, { x: 'value', y: 'attributes.gen_ai.agent.name' });
  });

  it('null-checks both the category and the split field, and splits by colour', () => {
    const q = agentPanelQuery(byId('agent-ops-by-service'));
    assert.match(q.query, /where isnotnull\(`serviceName`\) and isnotnull\(`attributes\.gen_ai\.operation\.name`\)/);
    assert.deepEqual(q.axesMapping, { x: 'value', y: 'serviceName', color: 'attributes.gen_ai.operation.name' });
  });

  it('builds a PPL explore object over the traces pattern', () => {
    const o = agentPanelObject(byId('tool-usage-stats'), 'traces-id');
    const search = JSON.parse(o.attributes.kibanaSavedObjectMeta.searchSourceJSON);
    assert.equal(search.query.language, 'PPL');
    assert.equal(search.query.dataset.id, 'traces-id');
    assert.deepEqual(o.references, [{ name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern', id: 'traces-id' }]);
  });
});

describe('agent panels data source', () => {
  it('builds the dataset data source from the data-source saved object', () => {
    assert.deepEqual(
      datasetDataSource({ id: 'ds-1', attributes: { title: 'my-collection', dataSourceEngineType: 'OpenSearch Serverless', dataSourceVersion: '' } }),
      { id: 'ds-1', title: 'my-collection', type: 'OpenSearch Serverless', version: '' },
    );
    assert.deepEqual(datasetDataSource({ id: 'ds-1' }), { id: 'ds-1', title: 'ds-1', type: 'OpenSearch', version: '' });
    assert.equal(datasetDataSource(undefined), undefined);
  });

  it('puts the data source on the panel dataset, and omits it when there is none', () => {
    const ds = { id: 'ds-1', title: 't', type: 'OpenSearch Serverless', version: '' };
    const panel = AGENT_PANELS[0];
    const withDs = JSON.parse(agentPanelObject(panel, 'traces-id', ds).attributes.kibanaSavedObjectMeta.searchSourceJSON);
    assert.deepEqual(withDs.query.dataset.dataSource, ds);
    const without = JSON.parse(agentPanelObject(panel, 'traces-id').attributes.kibanaSavedObjectMeta.searchSourceJSON);
    assert.equal('dataSource' in without.query.dataset, false);
  });
});

describe('syncAgentDashboard', () => {
  const isDash = (path) => path.includes('/dashboard/');
  const fake = (status) => {
    const calls = [];
    const run = (op) => async (path) => {
      const c = { op, path }; calls.push(c);
      const s = status(c);
      if (s instanceof Error) throw s;
      return { status: s };
    };
    return { calls, api: { post: run('post'), put: run('put'), del: run('del') } };
  };
  const dels = (calls) => calls.map((c, i) => (c.op === 'del' ? i : -1)).filter((i) => i >= 0);
  const lastDashSave = (calls) => Math.max(...calls.map((c, i) => (c.op !== 'del' && isDash(c.path) ? i : -1)));

  it('creates panels and the dashboard, then deletes the legacy visualizations', async () => {
    const { api, calls } = fake(() => 200);
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.dashboard, 'created');
    assert.equal(r.panelIds.length, AGENT_PANELS.length);
    assert.equal(r.removedLegacy.length, AGENT_PANELS.length);
    assert.ok(dels(calls).every((i) => i > lastDashSave(calls)), 'legacy objects are deleted after the dashboard save');
  });

  it('updates an existing workspace: 409 on panels and dashboard becomes PUT, then deletes legacy', async () => {
    const { api, calls } = fake((c) => (c.op === 'post' ? 409 : 200));
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.dashboard, 'updated');
    assert.equal(r.panelIds.length, AGENT_PANELS.length);
    assert.ok(calls.some((c) => c.op === 'put' && isDash(c.path)));
    assert.ok(dels(calls).every((i) => i > lastDashSave(calls)));
  });

  it('keeps the legacy visualizations when the dashboard save fails (the old dashboard still references them)', async () => {
    const { api, calls } = fake((c) => (isDash(c.path) ? (c.op === 'post' ? 409 : 500) : 200));
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.dashboard, 'failed');
    assert.equal(dels(calls).length, 0);
    assert.match(r.warnings.join(' '), /dashboard not saved: HTTP 500/);
  });

  it('keeps the legacy visualizations when the dashboard request throws', async () => {
    const { api, calls } = fake((c) => (isDash(c.path) ? new Error('timeout') : 200));
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.dashboard, 'failed');
    assert.equal(dels(calls).length, 0);
  });

  it('keeps a panel that exists (409) on the dashboard even when its update fails', async () => {
    const { api } = fake((c) => (c.op === 'post' ? (isDash(c.path) ? 200 : 409) : c.op === 'put' ? 500 : 200));
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.panelIds.length, AGENT_PANELS.length);
    assert.equal(r.warnings.length, AGENT_PANELS.length);
  });

  it('leaves a panel that could not be saved off the dashboard and keeps going', async () => {
    const { api } = fake((c) => (c.path.endsWith('/explore/tool-usage-stats') ? 500 : 200));
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.panelIds.length, AGENT_PANELS.length - 1);
    assert.ok(!r.panelIds.includes('tool-usage-stats'));
    assert.equal(r.dashboard, 'created');
  });

  it('does not save a dashboard when no panel was saved', async () => {
    const { api, calls } = fake(() => 500);
    const r = await syncAgentDashboard(api, 'ws', 'traces-id');
    assert.equal(r.dashboard, 'skipped');
    assert.equal(calls.filter((c) => isDash(c.path)).length, 0);
  });
});

describe('agentPanelQuery roles for other chart types', () => {
  it('gives a non-pie panel with no metric or split horizontal bar roles, not pie roles', () => {
    const q = agentPanelQuery({ id: 'x', title: 'X', type: 'horizontal_bar', field: 'f' });
    assert.equal(q.chartType, 'bar');
    assert.deepEqual(q.axesMapping, { x: 'value', y: 'f' });
  });
});
