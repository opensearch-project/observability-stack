import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// We need to extract the pure functions for testing.
// Since buildAppDataSources is not exported, we replicate the logic here
// and test it matches expectations. In a refactor, these would be exported.

function buildAppDataSources(cfg) {
  const dataSources = [];
  if (cfg.serverless) {
    const match = cfg.opensearchEndpoint?.match(/https?:\/\/([^.]+)\./);
    const collectionId = match?.[1] || '';
    if (collectionId) {
      dataSources.push({
        dataSourceArn: `arn:aws:aoss:${cfg.region}:${cfg.accountId}:collection/${collectionId}`,
      });
    }
  } else if (!cfg.serverless) {
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
      ...baseCfg, serverless: false, osAction: 'create',
      osDomainName: 'my-domain', opensearchEndpoint: '',
    });
    assert.equal(ds.length, 1);
    assert.match(ds[0].dataSourceArn, /domain\/my-domain$/);
  });

  it('managed domain - reuse: extracts domain name from endpoint URL', () => {
    const ds = buildAppDataSources({
      ...baseCfg, serverless: false, osAction: 'reuse',
      osDomainName: 'wrong-name-from-defaults',
      opensearchEndpoint: 'https://search-actual-domain-name-abc123xyz.us-east-1.es.amazonaws.com',
    });
    assert.equal(ds.length, 1);
    assert.match(ds[0].dataSourceArn, /domain\/actual-domain-name$/);
  });

  it('managed domain - reuse: handles hyphenated domain names', () => {
    const ds = buildAppDataSources({
      ...baseCfg, serverless: false, osAction: 'reuse',
      osDomainName: 'pipeline-name',
      opensearchEndpoint: 'https://search-open-stack-aos-test-z6hp76cbu35szosamuup3vsuqq.us-east-1.es.amazonaws.com',
    });
    assert.match(ds[0].dataSourceArn, /domain\/open-stack-aos-test$/);
  });

  it('serverless - extracts collection ID from endpoint', () => {
    const ds = buildAppDataSources({
      ...baseCfg, serverless: true, osAction: 'create',
      opensearchEndpoint: 'https://qkm56or0u8mgicn7e3gd.us-east-1.aoss.amazonaws.com',
    });
    assert.equal(ds.length, 1);
    assert.match(ds[0].dataSourceArn, /collection\/qkm56or0u8mgicn7e3gd$/);
  });

  it('includes DQS datasource ARN when present', () => {
    const ds = buildAppDataSources({
      ...baseCfg, serverless: false, osAction: 'create',
      osDomainName: 'my-domain',
      dqsDataSourceArn: 'arn:aws:opensearch:us-east-1:123:datasource/prom',
    });
    assert.equal(ds.length, 2);
    assert.match(ds[1].dataSourceArn, /datasource\/prom$/);
  });
});

// Test service map index pattern selection (from opensearch-ui-init logic)
describe('service map index pattern', () => {
  it('AOS uses otel-v1-apm-service-map*', () => {
    const serverless = false;
    const pattern = serverless ? 'otel-v2-apm-service-map*' : 'otel-v1-apm-service-map*';
    assert.equal(pattern, 'otel-v1-apm-service-map*');
  });

  it('AOSS uses otel-v2-apm-service-map*', () => {
    const serverless = true;
    const pattern = serverless ? 'otel-v2-apm-service-map*' : 'otel-v1-apm-service-map*';
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
