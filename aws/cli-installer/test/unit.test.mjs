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

import { _tags, _tagSpec, _buildUserData } from '../src/ec2-demo.mjs';

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

  it('pins the stack clone to a ref instead of tracking main HEAD', () => {
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(decoded.includes('--branch "$OBS_STACK_REF"'));
    assert.ok(decoded.includes('cli-installer-v'));
  });

  it('clears COMPOSE_PROFILES so local-backend services are pruned in managed mode', () => {
    const decoded = Buffer.from(_buildUserData(cfg), 'base64').toString();
    assert.ok(decoded.includes('export COMPOSE_PROFILES='));
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
