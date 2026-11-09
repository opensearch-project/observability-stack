/**
 * Unit tests for the PURE parts of the e2e harness: arg construction, the
 * scenario matrix, count evaluation, and synthetic OTLP payloads. These run
 * anywhere (no AWS, no credentials) and guard the harness logic itself.
 *
 * Run: node --test test/e2e/e2e-unit.test.mjs
 * (Also picked up by `node --test` over the whole test/ tree.)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCENARIOS, getScenario, selectScenarios, envToVpc,
  buildPipelineName, buildCreateArgs, buildDestroyArgs,
} from '../e2e/scenarios.mjs';
import {
  EXPECTED_INDICES, evaluateCounts, parseCount, buildOtlpPayload, otlpUrl,
} from '../e2e/verify.mjs';

// ── scenario matrix ───────────────────────────────────────────────────────────

describe('scenario matrix', () => {
  it('covers both network topologies and both demo modes', () => {
    assert.ok(SCENARIOS.some((s) => s.vpc), 'expected at least one VPC scenario');
    assert.ok(SCENARIOS.some((s) => !s.vpc), 'expected at least one public scenario');
    assert.ok(SCENARIOS.some((s) => s.demo), 'expected at least one demo scenario');
    assert.ok(SCENARIOS.some((s) => !s.demo), 'expected at least one no-demo scenario');
  });

  it('covers both backends', () => {
    assert.ok(SCENARIOS.some((s) => s.backend === 'managed'));
    assert.ok(SCENARIOS.some((s) => s.backend === 'serverless'));
  });

  it('all scenario names are unique', () => {
    const names = SCENARIOS.map((s) => s.name);
    assert.equal(new Set(names).size, names.length);
  });

  it('VPC scenarios are opt-in (not default) so the base matrix runs anywhere', () => {
    for (const s of SCENARIOS) {
      if (s.vpc) assert.equal(s.enabledByDefault, false, `${s.name} should be opt-in`);
    }
  });

  it('every scenario declares whether data flow is verified', () => {
    for (const s of SCENARIOS) {
      assert.equal(typeof s.verifyDataFlow, 'boolean', `${s.name} must set verifyDataFlow`);
    }
  });

  it('the VPC no-demo scenario does not verify data flow (private ingest unreachable from outside)', () => {
    // A VPC-attached OSIS ingest endpoint is VPC-private, so a synthetic push from
    // the runner host can never reach it, so verifying data flow there would be a
    // guaranteed false failure. VPC data flow is proven by the in-VPC demo instead.
    assert.equal(getScenario('managed-vpc-nodemo').verifyDataFlow, false);
    assert.equal(getScenario('managed-vpc-demo').verifyDataFlow, true);
  });

  it('every public scenario verifies data flow', () => {
    for (const s of SCENARIOS) {
      if (!s.vpc) assert.equal(s.verifyDataFlow, true, `${s.name} (public) should verify data flow`);
    }
  });
});

describe('getScenario / selectScenarios', () => {
  it('getScenario returns the named scenario', () => {
    assert.equal(getScenario('managed-public-demo').name, 'managed-public-demo');
  });
  it('getScenario throws on an unknown name', () => {
    assert.throws(() => getScenario('nope'), /Unknown scenario/);
  });
  it('selectScenarios defaults to enabled-by-default only', () => {
    const sel = selectScenarios();
    assert.ok(sel.length > 0);
    assert.ok(sel.every((s) => s.enabledByDefault));
  });
  it('selectScenarios --all includes opt-in scenarios', () => {
    assert.equal(selectScenarios({ all: true }).length, SCENARIOS.length);
  });
  it('selectScenarios by name overrides defaults', () => {
    const sel = selectScenarios({ names: ['managed-vpc-demo'] });
    assert.deepEqual(sel.map((s) => s.name), ['managed-vpc-demo']);
  });
});

// ── env → VPC parsing ───────────────────────────────────────────────────────

describe('envToVpc', () => {
  it('returns null when nothing is set', () => {
    assert.equal(envToVpc({}), null);
  });
  it('returns null when only partially set', () => {
    assert.equal(envToVpc({ E2E_VPC_ID: 'vpc-1' }), null);
  });
  it('parses a complete VPC config with comma-separated lists', () => {
    const v = envToVpc({
      E2E_VPC_ID: 'vpc-03e1',
      E2E_SUBNET_IDS: 'subnet-a, subnet-b',
      E2E_SECURITY_GROUP_IDS: 'sg-1',
    });
    assert.deepEqual(v, { vpcId: 'vpc-03e1', subnetIds: ['subnet-a', 'subnet-b'], securityGroupIds: ['sg-1'] });
  });
});

// ── pipeline naming ───────────────────────────────────────────────────────────

describe('buildPipelineName', () => {
  it('stays within the 28-char OSIS limit', () => {
    for (const s of SCENARIOS) {
      const name = buildPipelineName(s, 'abcde');
      assert.ok(name.length <= 28, `${s.name} -> ${name} (${name.length})`);
    }
  });
  it('starts with a lowercase letter and is alnum/hyphen only', () => {
    const name = buildPipelineName(getScenario('managed-public-demo'), 'zzzzz');
    assert.match(name, /^[a-z][a-z0-9-]*$/);
  });
  it('is distinct per scenario for the same suffix', () => {
    const suffix = 'q1w2e';
    const names = SCENARIOS.map((s) => buildPipelineName(s, suffix));
    assert.equal(new Set(names).size, names.length);
  });
});

// ── create/destroy arg construction ─────────────────────────────────────────

describe('buildCreateArgs', () => {
  const base = { pipelineName: 'e2e-mpd-abcde', region: 'us-east-1' };

  it('managed public demo: managed domain, no VPC, demo not skipped', () => {
    const args = buildCreateArgs(getScenario('managed-public-demo'), base);
    assert.ok(args.includes('--managed'));
    assert.ok(args.includes('--os-domain-name'));
    assert.ok(!args.includes('--vpc-id'));
    assert.ok(!args.includes('--skip-demo'));
    // Must NOT use --advanced: advanced mode only creates explicitly-named
    // resources, so it would skip the OSI role and hand OSIS an empty
    // PipelineRoleArn. Quick mode (the default) auto-creates the full stack.
    assert.ok(!args.includes('--advanced'));
  });

  it('no-demo scenario adds --skip-demo', () => {
    const args = buildCreateArgs(getScenario('managed-public-nodemo'), base);
    assert.ok(args.includes('--skip-demo'));
  });

  it('serverless scenario uses --serverless and --aoss-collection-name', () => {
    const args = buildCreateArgs(getScenario('serverless-public-nodemo'), base);
    assert.ok(args.includes('--serverless'));
    assert.ok(args.includes('--aoss-collection-name'));
    assert.ok(!args.includes('--managed'));
  });

  it('VPC scenario threads vpc/subnet/sg flags', () => {
    const args = buildCreateArgs(getScenario('managed-vpc-demo'), {
      ...base, vpc: { vpcId: 'vpc-1', subnetIds: ['subnet-a', 'subnet-b'], securityGroupIds: ['sg-1'] },
    });
    const i = args.indexOf('--vpc-id');
    assert.equal(args[i + 1], 'vpc-1');
    assert.equal(args[args.indexOf('--subnet-ids') + 1], 'subnet-a,subnet-b');
    assert.equal(args[args.indexOf('--security-group-ids') + 1], 'sg-1');
  });

  it('VPC scenario without vpc params throws', () => {
    assert.throws(() => buildCreateArgs(getScenario('managed-vpc-demo'), base), /requires vpc/);
  });

  it('requires pipelineName and region', () => {
    assert.throws(() => buildCreateArgs(getScenario('managed-public-demo'), { region: 'us-east-1' }), /pipelineName/);
    assert.throws(() => buildCreateArgs(getScenario('managed-public-demo'), { pipelineName: 'x' }), /region/);
  });

  it('produces args that validateConfig accepts and resolve a full stack (integration with cli.mjs)', async () => {
    // Cross-check: the args we build should parse and validate cleanly, AND once
    // defaults are applied they must resolve into an actionable full stack: an
    // OSI role, an APS workspace, and an app. This guards against a regression
    // where the harness selected --advanced and left iamAction empty, which made
    // the CLI create only the domain and then fail deep in OSIS pipeline creation
    // with an empty PipelineRoleArn ("Cross-account pass role is not allowed").
    const { parseCli, applyQuickDefaults, validateConfig } = await import('../../src/cli.mjs');
    for (const name of ['managed-public-nodemo', 'serverless-public-nodemo', 'managed-public-demo']) {
      const args = buildCreateArgs(getScenario(name), base);
      const cfg = parseCli(['node', 'cli', ...args]);
      if (cfg.mode === 'quick') applyQuickDefaults(cfg);
      assert.deepEqual(validateConfig(cfg), [], `${name} should validate`);
      // The OSI pipeline role must be resolved to "create" with a name, or the
      // pipeline gets an empty role ARN.
      assert.equal(cfg.iamAction, 'create', `${name} must create an OSI role`);
      assert.ok(cfg.iamRoleName, `${name} must have an OSI role name`);
      assert.equal(cfg.apsAction, 'create', `${name} must create an APS workspace`);
      assert.ok(cfg.appName, `${name} must have an OpenSearch Application name`);
    }
  });

  it('VPC scenario args also resolve a full stack (quick mode + VPC flags)', async () => {
    const { parseCli, applyQuickDefaults, validateConfig } = await import('../../src/cli.mjs');
    const args = buildCreateArgs(getScenario('managed-vpc-nodemo'), {
      ...base, vpc: { vpcId: 'vpc-1', subnetIds: ['subnet-a', 'subnet-b'], securityGroupIds: ['sg-1'] },
    });
    const cfg = parseCli(['node', 'cli', ...args]);
    if (cfg.mode === 'quick') applyQuickDefaults(cfg);
    assert.deepEqual(validateConfig(cfg), []);
    assert.equal(cfg.iamAction, 'create');
    assert.equal(cfg.vpcId, 'vpc-1');
    assert.equal(cfg.osAction, 'create');
  });
});

describe('buildDestroyArgs', () => {
  it('builds a destroy invocation with pipeline + region', () => {
    const args = buildDestroyArgs(getScenario('managed-public-demo'), { pipelineName: 'p', region: 'us-east-1' });
    assert.equal(args[0], 'destroy');
    assert.ok(args.includes('--pipeline-name'));
    assert.ok(args.includes('--region'));
  });
  it('serverless destroy passes the collection name', () => {
    const args = buildDestroyArgs(getScenario('serverless-public-nodemo'), { pipelineName: 'p', region: 'us-east-1' });
    assert.ok(args.includes('--aoss-collection-name'));
  });
});

describe('AWS profile selection', () => {
  it('parses --profile for create', async () => {
    const { parseCli } = await import('../../src/cli.mjs');
    const cfg = parseCli([
      'node', 'cli', '--managed', '--pipeline-name', 'profile-test',
      '--region', 'us-east-1', '--profile', 'my-sandbox',
    ]);
    assert.equal(cfg.profile, 'my-sandbox');
  });

  it('parses --profile for destroy', async () => {
    const { parseCli } = await import('../../src/cli.mjs');
    const cfg = parseCli([
      'node', 'cli', 'destroy', '--pipeline-name', 'profile-test',
      '--region', 'us-east-1', '--profile', 'my-sandbox',
    ]);
    assert.equal(cfg.profile, 'my-sandbox');
  });

  it('configures AWS_PROFILE for the SDK credential chain', async () => {
    const previous = process.env.AWS_PROFILE;
    const { configureAwsProfile } = await import('../../src/aws-profile.mjs');
    try {
      assert.equal(configureAwsProfile('  my-sandbox  '), 'my-sandbox');
      assert.equal(process.env.AWS_PROFILE, 'my-sandbox');
    } finally {
      if (previous === undefined) delete process.env.AWS_PROFILE;
      else process.env.AWS_PROFILE = previous;
    }
  });
});

// ── count evaluation ──────────────────────────────────────────────────────────

describe('evaluateCounts', () => {
  const full = { 'logs-otel-v1': 5, 'otel-v1-apm-span': 12, 'otel-v2-apm-service-map': 3 };

  it('passes when every expected index has data', () => {
    const r = evaluateCounts(full);
    assert.equal(r.ok, true);
    assert.equal(r.results.length, EXPECTED_INDICES.length);
  });

  it('fails when a required index is empty', () => {
    const r = evaluateCounts({ ...full, 'logs-otel-v1': 0 });
    assert.equal(r.ok, false);
    assert.equal(r.results.find((x) => x.pattern === 'logs-otel-v1').ok, false);
  });

  it('treats non-required signals as optional (service-map for synthetic push)', () => {
    const r = evaluateCounts(
      { 'logs-otel-v1': 2, 'otel-v1-apm-span': 2, 'otel-v2-apm-service-map': 0 },
      { requireSignals: ['logs', 'traces'] },
    );
    assert.equal(r.ok, true);
    assert.equal(r.results.find((x) => x.pattern === 'otel-v2-apm-service-map').ok, true);
  });

  it('missing keys count as zero', () => {
    const r = evaluateCounts({});
    assert.equal(r.ok, false);
  });
});

describe('parseCount', () => {
  it('reads count from an object', () => assert.equal(parseCount({ count: 42 }), 42));
  it('reads count from a JSON string', () => assert.equal(parseCount('{"count":7}'), 7));
  it('returns 0 on garbage', () => assert.equal(parseCount('not json'), 0));
  it('returns 0 when count is missing', () => assert.equal(parseCount({ hits: 1 }), 0));
});

// ── synthetic OTLP ────────────────────────────────────────────────────────────

describe('buildOtlpPayload', () => {
  it('builds a logs payload with service.name and a timestamp', () => {
    const p = buildOtlpPayload('logs', { nowNanos: '1700000000000000000', serviceName: 'svc' });
    const rl = p.resourceLogs[0];
    assert.equal(rl.resource.attributes[0].value.stringValue, 'svc');
    assert.equal(rl.scopeLogs[0].logRecords[0].timeUnixNano, '1700000000000000000');
  });

  it('builds a traces payload with a server span and derived endTime', () => {
    const p = buildOtlpPayload('traces', { nowNanos: '1000', serviceName: 'svc' });
    const span = p.resourceSpans[0].scopeSpans[0].spans[0];
    assert.equal(span.startTimeUnixNano, '1000');
    assert.equal(span.endTimeUnixNano, '1001000'); // start + 1_000_000
    assert.equal(span.kind, 2);
  });

  it('carries service.name on traces so service-map edges can be derived', () => {
    const p = buildOtlpPayload('traces', { serviceName: 'checkout' });
    assert.equal(p.resourceSpans[0].resource.attributes[0].value.stringValue, 'checkout');
  });

  it('throws on unsupported signals', () => {
    assert.throws(() => buildOtlpPayload('metrics'), /unsupported signal/);
  });
});

describe('otlpUrl', () => {
  it('builds the per-pipeline OTLP path and strips any scheme on the endpoint', () => {
    assert.equal(
      otlpUrl('https://abc.us-east-1.osis.amazonaws.com', 'my-pipe', 'logs'),
      'https://abc.us-east-1.osis.amazonaws.com/my-pipe/v1/logs',
    );
    assert.equal(
      otlpUrl('abc.us-east-1.osis.amazonaws.com', 'my-pipe', 'traces'),
      'https://abc.us-east-1.osis.amazonaws.com/my-pipe/v1/traces',
    );
  });
});
