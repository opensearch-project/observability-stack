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
} from './aws.mjs';
import {
  printError,
  printSuccess,
  printPanel,
  printBox,
  STAR,
  theme,
} from './ui.mjs';

export async function run() {
  try {
    // Parse CLI or run interactive REPL
    let cfg = parseCli(process.argv);
    if (!cfg) {
      const { startRepl } = await import('./repl.mjs');
      return startRepl();
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

  // Generate pipeline YAML
  const pipelineYaml = renderPipeline(cfg);

  if (cfg.outputFile) {
    writeFileSync(cfg.outputFile, pipelineYaml + '\n');
    printSuccess(`Pipeline YAML saved to ${cfg.outputFile}`);
    console.error();
  }

  // Create the OSI pipeline
  await createOsiPipeline(cfg, pipelineYaml);

  // ── Final summary ───────────────────────────────────────────────────
  console.error();
  printBox([
    '',
    `${theme.success.bold(`${STAR} OSI Pipeline Setup Complete! ${STAR}`)}`,
    '',
    `${theme.label('Pipeline:')}     ${cfg.pipelineName}`,
    `${theme.label('OpenSearch:')}   ${cfg.opensearchEndpoint}`,
    `${theme.label('IAM Role:')}     ${cfg.iamRoleArn}`,
    `${theme.label('Prometheus:')}   ${cfg.prometheusUrl}`,
    '',
  ], { color: 'primary', padding: 2 });

  console.error();
  printBox([
    '',
    `${theme.muted('# Check pipeline status')}`,
    `${theme.accentBold(`aws osis get-pipeline --pipeline-name ${cfg.pipelineName} --region ${cfg.region}`)}`,
    '',
    `${theme.muted('# Delete pipeline')}`,
    `${theme.accentBold(`aws osis delete-pipeline --pipeline-name ${cfg.pipelineName} --region ${cfg.region}`)}`,
    '',
  ], { title: 'Useful commands', color: 'dim', padding: 2 });
  console.error();
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
    ['', theme.accentBold('IAM Role')],
    ...iamEntries,
    ['', ''],
    ['', theme.accentBold('Amazon Managed Prometheus')],
    ...apsEntries,
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
