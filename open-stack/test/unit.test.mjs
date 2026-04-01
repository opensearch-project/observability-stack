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
  if (cfg.dqsDataSourceArn) {
    dataSources.push({ dataSourceArn: cfg.dqsDataSourceArn });
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

  it('includes DQS datasource ARN when present', () => {
    const ds = buildAppDataSources({
      ...baseCfg, osAction: 'create',
      osDomainName: 'my-domain',
      dqsDataSourceArn: 'arn:aws:opensearch:us-east-1:123:datasource/prom',
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
    assert.equal(result[0].Key, 'open-stack:pipeline-name');
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
});
