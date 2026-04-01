import { writeFileSync } from 'node:fs';
import { parseCli, applySimpleDefaults, validateConfig, fillDryRunPlaceholders } from './cli.mjs';
import { renderPipeline } from './render.mjs';
import {
  checkRequirements,
  createOpenSearch,
  createIamRole,
  createApsWorkspace,
  createOsiPipeline,
  mapOsiRoleInDomain,
  setupDashboards,
  createDqsPrometheusRole,
  createDirectQueryDataSource,
  createOpenSearchApplication,
} from './aws.mjs';
import {
  printError,
  printSuccess,
  printPanel,
  printBox,
  STAR,
  theme,
} from './ui.mjs';

async function runDemoCommand(cfg) {
  const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
  const { checkDemoPrerequisites, createEksCluster, installHelmChart, installOtelDemo } = await import('./eks.mjs');
  const { getPipelineEndpoint } = await import('./aws.mjs');

  if (!cfg.region) throw new Error('--region is required (or set AWS_REGION)');
  if (!cfg.pipeline) throw new Error('--pipeline is required');

  const sts = new STSClient({ region: cfg.region });
  const identity = await sts.send(new GetCallerIdentityCommand({}));

  checkDemoPrerequisites();

  const otlpEndpoint = await getPipelineEndpoint(cfg.region, cfg.pipeline);
  if (!otlpEndpoint) throw new Error(`No OTLP endpoint found for pipeline: ${cfg.pipeline}`);
  printSuccess(`Pipeline endpoint: ${otlpEndpoint}`);

  await createEksCluster({
    clusterName: cfg.clusterName,
    region: cfg.region,
    nodeCount: cfg.nodeCount,
    instanceType: cfg.instanceType,
    stackName: cfg.pipeline,
    accountId: identity.Account,
  });

  console.error();
  await installHelmChart({ otlpEndpoint });

  if (!cfg.skipOtelDemo) {
    console.error();
    await installOtelDemo({ otlpEndpoint });
  }

  console.error();
  printBox([
    '',
    `${theme.success.bold(`${STAR} Demo Services Deployed! ${STAR}`)}`,
    '',
    `${theme.label('Cluster:')}    ${cfg.clusterName}`,
    `${theme.label('Region:')}     ${cfg.region}`,
    `${theme.label('Pipeline:')}   ${cfg.pipeline}`,
    '',
  ], { color: 'primary', padding: 2 });
}

export async function run() {
  try {
    // Parse CLI or run interactive REPL
    let cfg = parseCli(process.argv);
    if (!cfg) {
      const { startRepl } = await import('./repl.mjs');
      return startRepl();
    }

    // Demo subcommand
    if (cfg._command === 'demo') {
      await runDemoCommand(cfg);
      return;
    }

    // Destroy subcommand
    if (cfg._command === 'destroy') {
      const { destroy } = await import('./destroy.mjs');
      await destroy(cfg);
      return;
    }

    // Apply simple-mode defaults for anything not explicitly set
    if (!cfg.mode) cfg.mode = 'simple';
    if (cfg.mode === 'simple') applySimpleDefaults(cfg);

    // Validate
    const errors = validateConfig(cfg);
    if (errors.length) {
      for (const e of errors) printError(e);
      console.error('Run with --help for usage information.');
      process.exit(1);
    }

    // ── Dry-run path ──────────────────────────────────────────────────────
    if (cfg.dryRun) {
      printSummary(cfg);
      fillDryRunPlaceholders(cfg);

      const yaml = renderPipeline(cfg);

      if (cfg.outputFile) {
        writeFileSync(cfg.outputFile, yaml + '\n');
        printSuccess(`Pipeline YAML written to ${cfg.outputFile}`);
      } else {
        if (process.stdout.isTTY) {
          console.error(`  ${theme.muted('\u2500'.repeat(43))}`);
        }
        process.stdout.write(yaml);
      }
      process.exit(0);
    }

    // ── Live path ─────────────────────────────────────────────────────────
    await executePipeline(cfg);

  } catch (err) {
    if (err.name === 'ExitPromptError') {
      // User pressed Ctrl+C during a prompt
      console.error();
      process.exit(130);
    }
    printError(err.message);
    process.exit(1);
  }
}

/**
 * Execute the full pipeline creation flow.
 * Shared by the CLI path (main.mjs) and the REPL create command.
 */
export async function executePipeline(cfg) {
  await checkRequirements(cfg);
  printSummary(cfg);
  console.error();

  // Create resources — OpenSearch first (slow), then IAM & APS
  if (cfg.osAction === 'create') {
    await createOpenSearch(cfg);
    console.error();
  }

  if (cfg.iamAction === 'create') {
    await createIamRole(cfg);
    console.error();
  }

  if (cfg.apsAction === 'create') {
    await createApsWorkspace(cfg);
    console.error();
  }

  // Map OSI role in managed domain FGAC (no-op for serverless)
  if (!cfg.serverless && cfg.opensearchEndpoint && cfg.iamRoleArn) {
    await mapOsiRoleInDomain(cfg);
    console.error();
  }

  // Extract apsWorkspaceId from prometheusUrl if not already set
  if (!cfg.apsWorkspaceId && cfg.prometheusUrl) {
    const m = cfg.prometheusUrl.match(/\/workspaces\/(ws-[^/]+)\//);
    if (m) cfg.apsWorkspaceId = m[1];
  }

  // Create DQS Prometheus role and Direct Query data source (connects AMP to OpenSearch)
  if (cfg.apsWorkspaceId && cfg.dqsRoleName) {
    await createDqsPrometheusRole(cfg);
    console.error();

    await createDirectQueryDataSource(cfg);
    console.error();
  }

  // Create OpenSearch Application and associate data sources
  if (cfg.appName) {
    await createOpenSearchApplication(cfg);
    console.error();
  }

  // Generate pipeline YAML
  const pipelineYaml = renderPipeline(cfg);

  if (cfg.outputFile) {
    writeFileSync(cfg.outputFile, pipelineYaml + '\n');
    printSuccess(`Pipeline YAML saved to ${cfg.outputFile}`);
    console.error();
  }

  // Create the OSI pipeline
  await createOsiPipeline(cfg, pipelineYaml);
  console.error();

  // Set up OpenSearch UI and create Observability workspace
  await setupDashboards(cfg);

  // Initialize OpenSearch UI (workspaces, index patterns, correlations, dashboards)
  const { initOpenSearchUI } = await import('./opensearch-ui-init.mjs');
  await initOpenSearchUI(cfg);

  // Launch EC2 demo workloads (unless --skip-demo)
  if (!cfg.skipDemo && cfg.ingestEndpoints?.length) {
    const { launchDemoInstance } = await import('./ec2-demo.mjs');
    await launchDemoInstance(cfg);
  }

  // ── Final summary ───────────────────────────────────────────────────
  console.error();
  const pad = (l) => l.padEnd(35);
  printBox([
    '',
    `${theme.success.bold(`${STAR} Open Stack Setup Complete! ${STAR}`)}`,
    '',
    `${theme.label(pad('OSI Pipeline:'))} ${cfg.ingestEndpoints?.length ? `https://${cfg.ingestEndpoints[0]}` : cfg.pipelineName}`,
    `${theme.label(pad('OSI Pipeline Role:'))} ${cfg.iamRoleArn}`,
    `${theme.label(pad('OpenSearch:'))} ${cfg.opensearchEndpoint}`,
    `${theme.label(pad('OpenSearch UI:'))} ${cfg.dashboardsUrl}`,
    `${theme.label(pad('Prometheus:'))} ${cfg.prometheusUrl}`,
    `${theme.label(pad('Direct Query Service Datasource:'))} ${cfg.dqsDataSourceArn || 'n/a'}`,
    `${theme.label(pad('Direct Query Service Role:'))} ${cfg.dqsRoleArn || 'n/a'}`,
    ...(cfg.demoInstanceId ? [`${theme.label(pad('Demo EC2 Instance:'))} ${cfg.demoInstanceId}`] : []),
    '',
    `${theme.success.bold('→ Open your dashboards:')}`,
    `  ${cfg.dashboardsUrl}`,
    ...(cfg.demoInstanceId ? [``, `  ${theme.muted('Demo data may take 10-15 minutes to appear.')}`] : []),
    '',
  ], { color: 'primary', padding: 2 });

}

// ── Summary ─────────────────────────────────────────────────────────────────

function printSummary(cfg) {
  console.error();

  // Core info
  const coreEntries = [
    ['Mode', cfg.mode],
    ['Pipeline name', cfg.pipelineName],
    ['Region', cfg.region],
  ];

  // OpenSearch
  const osEntries = [];
  if (cfg.osAction === 'reuse') {
    osEntries.push(['Action', 'reuse existing']);
    osEntries.push(['Endpoint', cfg.opensearchEndpoint]);
    osEntries.push(['Type', cfg.serverless ? 'Serverless' : 'Managed domain']);
  } else if (cfg.serverless) {
    osEntries.push(['Action', 'create new Serverless collection']);
    osEntries.push(['Collection name', cfg.osDomainName]);
  } else {
    osEntries.push(['Action', 'create new managed domain']);
    osEntries.push(['Domain name', cfg.osDomainName]);
    osEntries.push(['Instance type', cfg.osInstanceType]);
    osEntries.push(['Instance count', String(cfg.osInstanceCount)]);
    osEntries.push(['Volume size', `${cfg.osVolumeSize} GB`]);
    osEntries.push(['Engine version', cfg.osEngineVersion]);
  }

  // IAM
  const iamEntries = [];
  if (cfg.iamAction === 'reuse') {
    iamEntries.push(['Action', 'reuse existing']);
    iamEntries.push(['ARN', cfg.iamRoleArn]);
  } else {
    iamEntries.push(['Action', 'create new']);
    iamEntries.push(['Role name', cfg.iamRoleName]);
  }

  // APS
  const apsEntries = [];
  if (cfg.apsAction === 'reuse') {
    apsEntries.push(['Action', 'reuse existing']);
    apsEntries.push(['Remote write URL', cfg.prometheusUrl]);
  } else {
    apsEntries.push(['Action', 'create new']);
    apsEntries.push(['Workspace alias', cfg.apsWorkspaceAlias]);
  }

  // Dashboards
  const dashEntries = [];
  if (cfg.dashboardsAction === 'reuse') {
    dashEntries.push(['Action', 'reuse existing']);
    dashEntries.push(['URL', cfg.dashboardsUrl]);
  } else {
    dashEntries.push(['Action', 'create new Observability workspace']);
  }

  // Direct Query & Application
  const dqEntries = [];
  if (cfg.dqsRoleName) dqEntries.push(['DQS role', cfg.dqsRoleName]);
  if (cfg.dqsDataSourceName) dqEntries.push(['Data source name', cfg.dqsDataSourceName]);
  if (cfg.appName) dqEntries.push(['Application name', cfg.appName]);

  // Pipeline settings
  const tuneEntries = [
    ['Min OCU', String(cfg.minOcu)],
    ['Max OCU', String(cfg.maxOcu)],
    ['Service-map window', cfg.serviceMapWindow],
  ];

  printPanel(`${STAR} Configuration Summary`, [
    ...coreEntries,
    ['', ''],
    ['', theme.accentBold('OpenSearch')],
    ...osEntries,
    ['', ''],
    ['', theme.accentBold('OpenSearch UI')],
    ...dashEntries,
    ['', ''],
    ['', theme.accentBold('IAM Role')],
    ...iamEntries,
    ['', ''],
    ['', theme.accentBold('Amazon Managed Prometheus')],
    ...apsEntries,
    ['', ''],
    ['', theme.accentBold('Direct Query & Application')],
    ...dqEntries,
    ['', ''],
    ['', theme.accentBold('Pipeline Settings')],
    ...tuneEntries,
  ]);

  if (cfg.dryRun) {
    console.error();
    console.error(`  ${theme.warn('DRY RUN')} ${theme.muted('\u2014 will generate config only, no AWS resources created')}`);
  }

  console.error();
}
