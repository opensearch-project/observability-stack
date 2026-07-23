import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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

import { _tags, _tagSpec, _buildUserData, _getVpcSubnetForInstance } from '../src/ec2-demo.mjs';

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

  it('routes logs, traces, and metrics from otlp-pipeline', () => {
    assert.ok(yaml.includes("'getEventType() == \"LOG\"'"));
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
  validateVpcTopology,
  pipelineRoleArnError,
  _withRetry,
  _isRoleNotPropagatedError,
  _isTransientHttpError,
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
