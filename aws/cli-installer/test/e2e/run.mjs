#!/usr/bin/env node
/**
 * Local AWS end-to-end test runner for the observability-stack CLI.
 *
 * These tests hit real AWS resources, so they are NOT run in CI (GitHub has no
 * AWS credentials by policy). Developers run them locally against a sandbox
 * account to gain confidence that AWS-specific changes still create a working
 * stack end to end.
 *
 * For each selected scenario it:
 *   1. creates the stack via the real CLI (`bin/cli-installer.mjs`),
 *   2. drives telemetry in: the EC2 OTel-demo (demo scenarios) or a synthetic
 *      OTLP push (no-demo scenarios),
 *   3. verifies documents land in the expected OpenSearch indices by querying
 *      through the managed OpenSearch UI endpoint (works for VPC-private domains),
 *   4. tears the stack down, always, even on failure (unless --no-teardown).
 *
 * Usage:
 *   AWS_PROFILE=<sandbox> node test/e2e/run.mjs [options]
 *
 * Options:
 *   --region <r>          AWS region (default: $AWS_REGION or us-east-1)
 *   --scenario <name>     run only this scenario (repeatable)
 *   --all                 include opt-in scenarios (VPC) too
 *   --list                print the scenario matrix and exit
 *   --no-teardown         leave resources up after the run (for debugging)
 *   --data-timeout <min>  minutes to wait for data to land (default 20)
 *
 * VPC scenarios additionally need:
 *   E2E_VPC_ID, E2E_SUBNET_IDS (comma-sep), E2E_SECURITY_GROUP_IDS (comma-sep)
 *
 * SAFETY: intended for a disposable sandbox account. It creates and DELETES
 * OpenSearch domains, OSIS pipelines, IAM roles, EC2 instances, and AMP
 * workspaces prefixed `e2e-`. Never point it at a production account.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { OSISClient, GetPipelineCommand } from '@aws-sdk/client-osis';
import { OpenSearchClient, ListApplicationsCommand, GetApplicationCommand } from '@aws-sdk/client-opensearch';
import { selectScenarios, envToVpc, buildPipelineName, buildCreateArgs, buildDestroyArgs, SCENARIOS } from './scenarios.mjs';
import { findDataSourceId, waitForData, pushOtlp, buildOtlpPayload } from './verify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', '..', 'bin', 'cli-installer.mjs');

// ── arg parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { scenarios: [], all: false, list: false, teardown: true, region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1', dataTimeoutMin: 20 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--list') out.list = true;
    else if (a === '--no-teardown') out.teardown = false;
    else if (a === '--scenario') out.scenarios.push(argv[++i]);
    else if (a === '--region') out.region = argv[++i];
    else if (a === '--data-timeout') out.dataTimeoutMin = Number(argv[++i]);
    else { console.error(`Unknown option: ${a}`); process.exit(2); }
  }
  return out;
}

function log(scenario, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${scenario}] ${msg}`);
}

/** Run the CLI as a subprocess, streaming output. Resolves with exit code. */
function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI, ...args], { stdio: 'inherit', env: process.env });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/** Short run id from the current time; collision-avoidance suffix for names. */
function runSuffix() {
  return Math.floor(Date.now() / 1000).toString(36).slice(-5);
}

async function verifyScenario(scenario, { pipelineName, region, dataTimeoutMs }) {
  // Resolve the Application endpoint + ingest endpoint from live resources.
  const os = new OpenSearchClient({ region });
  const { ApplicationSummaries } = await os.send(new ListApplicationsCommand({}));
  const app = (ApplicationSummaries || []).find((a) => a.name === pipelineName);
  if (!app) throw new Error('OpenSearch Application not found; cannot verify data flow');
  const { endpoint: appEndpoint } = await os.send(new GetApplicationCommand({ id: app.id }));
  if (!appEndpoint) throw new Error('OpenSearch Application endpoint not populated');
  log(scenario.name, `app endpoint: ${appEndpoint}`);

  const dataSourceId = await findDataSourceId({ appEndpoint, region });
  log(scenario.name, `data source id: ${dataSourceId || '(none)'}`);

  // No-demo scenarios: push synthetic telemetry so there is something to verify.
  let requireSignals;
  if (!scenario.demo) {
    const osis = new OSISClient({ region });
    const { Pipeline } = await osis.send(new GetPipelineCommand({ PipelineName: pipelineName }));
    const ingest = Pipeline?.IngestEndpointUrls?.[0];
    if (!ingest) throw new Error('OSIS ingest endpoint not available for synthetic push');
    requireSignals = ['logs', 'traces']; // service-map is derived async; treat as optional
    await pushSynthetic({ scenario, ingestEndpoint: ingest, pipelineName, region });
  }

  const result = await waitForData({
    appEndpoint, region, dataSourceId, requireSignals,
    timeoutMs: dataTimeoutMs, log: (m) => log(scenario.name, m),
  });
  return result;
}

/** Push a few synthetic OTLP records repeatedly so counts clear zero. */
async function pushSynthetic({ scenario, ingestEndpoint, pipelineName, region }) {
  log(scenario.name, `pushing synthetic OTLP to ${ingestEndpoint}`);
  // OSIS ingest for a fresh (esp. VPC) pipeline can warm up for ~10-15 min;
  // retry pushes until at least one is accepted.
  for (let attempt = 0; attempt < 30; attempt++) {
    const nowNanos = String(BigInt(Date.now()) * 1_000_000n);
    let accepted = 0;
    for (const signal of ['logs', 'traces']) {
      const payload = buildOtlpPayload(signal, { nowNanos, serviceName: `e2e-${scenario.name}` });
      try {
        const { status } = await pushOtlp({ ingestEndpoint, pipelineName, region, signal, payload });
        if (status >= 200 && status < 300) accepted++;
        else log(scenario.name, `  ${signal} push -> HTTP ${status}`);
      } catch (e) {
        log(scenario.name, `  ${signal} push error: ${e.message}`);
      }
    }
    if (accepted === 2) {
      log(scenario.name, 'synthetic push accepted');
      return;
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  log(scenario.name, 'synthetic push was never accepted; the data check will likely time out');
}

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.list) {
    console.log('Available scenarios:\n');
    for (const s of SCENARIOS) {
      console.log(`  ${s.name.padEnd(26)} ${s.enabledByDefault ? '(default)' : '(opt-in) '} ${s.description}`);
    }
    console.log('\nVPC scenarios need E2E_VPC_ID / E2E_SUBNET_IDS / E2E_SECURITY_GROUP_IDS.');
    return;
  }

  // Confirm credentials up front and print the target account (safety).
  const sts = new STSClient({ region: opts.region });
  const id = await sts.send(new GetCallerIdentityCommand({}));
  console.log(`Target AWS account: ${id.Account}  (${id.Arn})`);
  console.log(`Region: ${opts.region}\n`);

  const selected = selectScenarios({ names: opts.scenarios, all: opts.all });
  const vpc = envToVpc();
  const suffix = runSuffix();
  const dataTimeoutMs = opts.dataTimeoutMin * 60_000;
  const summary = [];

  for (const scenario of selected) {
    if (scenario.vpc && !vpc) {
      log(scenario.name, 'SKIP: VPC env vars not set (E2E_VPC_ID / E2E_SUBNET_IDS / E2E_SECURITY_GROUP_IDS)');
      summary.push({ scenario: scenario.name, status: 'skipped', reason: 'no VPC env' });
      continue;
    }

    const pipelineName = buildPipelineName(scenario, suffix);
    const base = { pipelineName, region: opts.region, vpc };
    let status = 'unknown';
    let detail = '';

    log(scenario.name, `=== START (pipeline: ${pipelineName}) ===`);
    try {
      const createArgs = buildCreateArgs(scenario, base);
      log(scenario.name, `create: node cli-installer.mjs ${createArgs.join(' ')}`);
      const code = await runCli(createArgs);
      if (code !== 0) throw new Error(`CLI create exited ${code}`);

      if (scenario.verifyDataFlow === false) {
        // Data-flow verification isn't applicable (e.g. a VPC-private ingest
        // endpoint the runner host can't reach). A clean create (the CLI exits 0
        // only after every resource, including the pipeline reaching ACTIVE) plus
        // the teardown below is what this scenario proves.
        status = 'passed';
        detail = 'created (data-flow verification not applicable; teardown exercised)';
        log(scenario.name, 'skipping data-flow verification for this scenario (not applicable)');
      } else {
        const result = await verifyScenario(scenario, { pipelineName, region: opts.region, dataTimeoutMs });
        if (result.ok) {
          status = 'passed';
          detail = result.results.map((r) => `${r.pattern}=${r.count}`).join(' ');
        } else {
          status = 'failed';
          detail = `data not confirmed${result.timedOut ? ' (timeout)' : ''}: ` +
            result.results.map((r) => `${r.pattern}=${r.count}${r.ok ? '' : ' ✗'}`).join(' ');
        }
      }
    } catch (e) {
      status = 'error';
      detail = e.message;
      log(scenario.name, `ERROR: ${e.message}`);
    } finally {
      if (opts.teardown) {
        log(scenario.name, 'tearing down...');
        const code = await runCli(buildDestroyArgs(scenario, base));
        if (code !== 0) log(scenario.name, `WARNING: destroy exited ${code}; check for leftover resources`);
      } else {
        log(scenario.name, 'teardown skipped (--no-teardown); remember to destroy manually');
      }
    }

    log(scenario.name, `=== ${status.toUpperCase()}: ${detail} ===\n`);
    summary.push({ scenario: scenario.name, status, detail });
  }

  // ── Summary ──
  console.log('\n================ E2E SUMMARY ================');
  for (const s of summary) {
    console.log(`  ${s.status.toUpperCase().padEnd(8)} ${s.scenario.padEnd(26)} ${s.detail || s.reason || ''}`);
  }
  const failed = summary.filter((s) => s.status === 'failed' || s.status === 'error');
  console.log(`\n${summary.length} scenario(s): ${summary.filter(s => s.status === 'passed').length} passed, ` +
    `${failed.length} failed/errored, ${summary.filter(s => s.status === 'skipped').length} skipped`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
