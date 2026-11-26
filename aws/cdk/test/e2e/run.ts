/**
 * End-to-end test of an exported template in a real AWS account: creates the stack, sends OTLP logs, spans and a
 * metric to its pipeline, checks that they arrive, then deletes the stack and checks nothing is left behind.
 *
 *   npx ts-node test/e2e/run.ts --variant <domain|optimized|serverless|serverless-easy> --templates <dir>
 *     [--name <stack display name>] [--keep]
 *
 * <dir> holds the output of `npm run export-templates`. Needs the AWS CLI and credentials; the Region is AWS_REGION.
 * The template is uploaded to obs-stack-e2e-<account>-<region>, which the script creates if it doesn't exist.
 * The caller's role becomes the stack's AdminRoleArns, so the checks can read the data.
 */
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { otlpLogs, otlpMetrics, otlpSpans, SPANS } from './otlp';
import { signedFetch } from './sign';

type Variant = 'domain' | 'optimized' | 'serverless' | 'serverless-easy';
const SHORT: Record<Variant, string> = { domain: 'dom', optimized: 'opt', serverless: 'srv', 'serverless-easy': 'eas' };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const variant = arg('variant') as Variant;
if (!(variant in SHORT)) throw new Error('--variant must be domain, optimized, serverless or serverless-easy');
const templates = path.resolve(arg('templates') ?? 'dist/templates');
const name = arg('name') ?? `e2e-${SHORT[variant]}-${randomBytes(3).toString('hex')}`;
const keep = process.argv.includes('--keep');
const region = process.env.AWS_REGION;
if (!region) throw new Error('Set AWS_REGION');
const stackName = `ObsStack-${name}`;
const serverless = variant.startsWith('serverless');
const service = `e2e-${name}`;

function aws(...args: string[]): any {
  const out = execFileSync('aws', [...args, '--region', region!, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  return out.trim() ? JSON.parse(out) : {};
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${variant}: ${msg}`);

interface Check { name: string; ok: boolean; detail: string }
const checks: Check[] = [];
function check(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}

async function waitForStack(target: 'create' | 'delete', timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let status: string;
    try {
      status = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0].StackStatus;
    } catch (e: any) {
      if (target === 'delete' && String(e.stderr ?? e.message).includes('does not exist')) return 'DELETE_COMPLETE';
      throw e;
    }
    if (!status.endsWith('_IN_PROGRESS')) return status;
    if (Date.now() > deadline) return `${status} (timed out)`;
    await sleep(30_000);
  }
}

function failedEvents(): string {
  const events = aws('cloudformation', 'describe-stack-events', '--stack-name', stackName, '--max-items', '200').StackEvents as any[];
  return events.filter((e) => e.ResourceStatus.endsWith('FAILED') && e.ResourceStatusReason)
    .slice(0, 5).map((e) => `${e.LogicalResourceId}: ${e.ResourceStatusReason}`).join('\n');
}

async function poll<T>(what: string, fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn().catch((e: Error) => e as unknown as T);
    if (!(v instanceof Error) && done(v)) return v;
    if (Date.now() > deadline) return v;
    log(`waiting for ${what}: ${v instanceof Error ? v.message : JSON.stringify(v)}`);
    await sleep(30_000);
  }
}

/** Runs a PPL query against the stack's domain or collection and returns its rows. */
async function ppl(endpoint: string, query: string): Promise<any[][]> {
  const svc = serverless ? 'aoss' : 'es';
  const r = await signedFetch({ method: 'POST', url: `${endpoint}/_plugins/_ppl`, body: JSON.stringify({ query }), service: svc, region: region! });
  if (r.status !== 200) throw new Error(`PPL ${r.status}: ${String(r.text).slice(0, 200)}`);
  return JSON.parse(r.text).datarows;
}

async function main() {
  const identity = aws('sts', 'get-caller-identity');
  const account: string = identity.Account;
  // arn:aws:sts::<account>:assumed-role/<role>/<session> → the role's ARN.
  const role = identity.Arn.match(/:assumed-role\/([^/]+)\//)?.[1];
  if (!role) throw new Error(`Run as an assumed role, not ${identity.Arn}`);
  const adminRoleArn = aws('iam', 'get-role', '--role-name', role).Role.Arn;
  log(`account ${account}, region ${region}, stack ${stackName}`);

  const bucket = `obs-stack-e2e-${account}-${region}`;
  try {
    aws('s3api', 'head-bucket', '--bucket', bucket);
  } catch {
    aws('s3api', 'create-bucket', '--bucket', bucket, ...(region === 'us-east-1' ? [] : ['--create-bucket-configuration', `LocationConstraint=${region}`]));
    aws('s3api', 'put-public-access-block', '--bucket', bucket, '--public-access-block-configuration',
      'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true');
  }
  const key = `${name}/observability-stack-${variant}.json`;
  aws('s3', 'cp', path.join(templates, `observability-stack-${variant}.json`), `s3://${bucket}/${key}`, '--only-show-errors');
  const templateUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  const params = [`ParameterKey=StackDisplayName,ParameterValue=${name}`, `ParameterKey=AdminRoleArns,ParameterValue=${adminRoleArn}`];
  if (variant !== 'serverless-easy') params.push('ParameterKey=DeployDemoWorkload,ParameterValue=false');
  try {
    aws('cloudformation', 'create-stack', '--stack-name', stackName, '--template-url', templateUrl,
      // No rollback on a failed create, so the pipeline's status reason can still be read; teardown deletes the stack.
      '--capabilities', 'CAPABILITY_IAM', '--on-failure', 'DO_NOTHING', '--parameters', ...params, '--tags', 'Key=obs-stack-e2e,Value=true');
    const started = Date.now();
    const status = await waitForStack('create', 75 * 60_000);
    check('stack created', status === 'CREATE_COMPLETE', `${status} in ${Math.round((Date.now() - started) / 60_000)} min`);
    if (status !== 'CREATE_COMPLETE') {
      log(failedEvents());
      try {
        const p = aws('osis', 'get-pipeline', '--pipeline-name', `obs-${name}-ingest`).Pipeline;
        log(`pipeline ${p.Status}: ${p.StatusReason?.Description ?? 'no reason given'}`);
      } catch (e: any) {
        log(`pipeline not found: ${String(e.stderr ?? e.message).trim()}`);
      }
      return;
    }
    await verify();
  } finally {
    if (keep) {
      log(`--keep: leaving ${stackName}`);
    } else {
      await teardown(bucket, key);
    }
  }
}

async function verify() {
  const stack = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0];
  const out = Object.fromEntries((stack.Outputs as any[]).map((o) => [o.OutputKey, o.OutputValue]));
  const marker = { domain: 'aos-domain', optimized: 'aos-optimized', serverless: 'aossv2', 'serverless-easy': 'aossv2 easy' }[variant];
  check('description marker', String(stack.Description).includes(`[obs-stack v2 ${marker}]`), String(stack.Description).slice(-40));
  check('FieldsReady', out.FieldsReady === 'true', String(out.FieldsReady));
  // Collections have no cluster health API, so serverless skips that monitor; a domain creates it.
  const monitors = String(out.AlertMonitors);
  const health = monitors.match(/Cluster Health Red: (\w+)/)?.[1];
  check('alerting monitors', !monitors.startsWith('failed') && health === (serverless ? 'skipped' : 'created'),
    monitors.slice(0, 160));

  const ingest = String(out.OSISEndpoint).replace(/\/$/, '');
  const pipeline = String(out.OSISPipelineArn).split('/').pop()!;
  const send = async (signal: string, body: unknown) => {
    const r = await signedFetch({ method: 'POST', url: `${ingest}/${pipeline}/v1/${signal}`, body: JSON.stringify(body), service: 'osis', region: region! });
    check(`OTLP ${signal} accepted`, r.status === 200, String(r.status));
  };
  const now = BigInt(Date.now()) * 1_000_000n;
  await send('logs', otlpLogs(service, now));
  await send('traces', otlpSpans(service, now));
  await send('metrics', otlpMetrics(service, now));

  const endpoint = String(out.OpenSearchEndpoint).replace(/\/$/, '').replace(/^(?!https:\/\/)/, 'https://');
  const spanIndex = variant === 'optimized' ? 'otel-v2-apm-span' : 'otel-v1-apm-span';
  const countSpans = async () => (await ppl(endpoint, `source=${spanIndex} | where serviceName='${service}' | stats count() as n`))[0][0];
  const spans = await poll('spans', countSpans, (n) => n === SPANS, 15 * 60_000);
  check('spans indexed', spans === SPANS, `${spans} of ${SPANS}`);
  if (variant === 'optimized') {
    const rows = await ppl(endpoint, `source=${spanIndex} | where serviceName='${service}' and name='e2e-op-0' | fields events`);
    const events = String(rows[0]?.[0] ?? '');
    check('span events kept as JSON', events.startsWith('[') && events.includes('exception'), `${events.length} chars`);
  }
  const logsIndex = serverless ? 'logs-otel-v1' : 'logs-otel-v1*';
  // The stack is new, so every log whose body starts with "e2e log" is one this run sent.
  const countLogs = async () => (await ppl(endpoint, `source=${logsIndex} | where like(body, 'e2e log%') | stats count() as n`))[0][0];
  const logs = await poll('logs', countLogs, (n) => n === SPANS, 15 * 60_000);
  check('logs indexed', logs === SPANS, `${logs} of ${SPANS}`);

  // The metric names in the workspace; an instant query misses a sample older than the 5-minute lookback.
  const ampNames = `https://aps-workspaces.${region}.amazonaws.com/workspaces/${out.PrometheusWorkspaceId}/api/v1/label/__name__/values`;
  const names = await poll('metric', async () => {
    const r = await signedFetch({ method: 'GET', url: ampNames, service: 'aps', region: region! });
    return (JSON.parse(r.text).data as string[]).filter((n) => n.startsWith('e2e_check_value'));
  }, (n) => n.length > 0, 10 * 60_000);
  check('metric in Prometheus', names.length > 0, names.join(', ') || 'none');

  if (serverless) {
    const r = await signedFetch({ method: 'GET', url: `${endpoint}/logs-otel-v1/_settings`, service: 'aoss', region: region! });
    check('log retention set', r.text.includes('"30d"'), r.text.match(/"retention"[^}]*/)?.[0] ?? String(r.status));
  }
}

async function teardown(bucket: string, key: string) {
  log('deleting the stack');
  aws('cloudformation', 'delete-stack', '--stack-name', stackName);
  const status = await waitForStack('delete', 45 * 60_000);
  check('stack deleted', status === 'DELETE_COMPLETE', status);
  const groups = aws('logs', 'describe-log-groups', '--log-group-name-prefix', `/aws/lambda/${stackName}`).logGroups as any[];
  check('no log groups left', groups.length === 0, groups.map((g) => g.logGroupName).join(', ') || 'none');
  aws('s3', 'rm', `s3://${bucket}/${key}`, '--only-show-errors');
}

main()
  .catch((e) => check('run', false, e instanceof Error ? e.message : String(e)))
  .finally(() => {
    const failed = checks.filter((c) => !c.ok);
    const table = ['| Check | Result |', '|---|---|', ...checks.map((c) => `| ${c.name} | ${c.ok ? 'pass' : '**fail**'}: ${c.detail.replace(/\|/g, '\\|')} |`)];
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${variant} (${stackName})\n\n${table.join('\n')}\n\n`);
    console.log(table.join('\n'));
    process.exitCode = failed.length ? 1 : 0;
  });
