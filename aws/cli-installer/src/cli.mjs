import { Command } from 'commander';
import { DEFAULTS } from './config.mjs';

/**
 * Parse CLI arguments into a config object.
 * Returns null when no flags were given (triggers interactive mode).
 */
export function parseCli(argv) {
  // No args → interactive REPL
  if (argv.length <= 2) return null;

  // Demo subcommand — separate parser to avoid option conflicts
  if (argv[2] === 'destroy') return parseDestroyArgs(argv);

  const program = new Command()
    .name('observability-stack-aws-cli')
    .description(
      'Create and manage your observability stack on AWS:\n' +
      'OpenSearch, Prometheus, IAM roles, and ingestion pipelines.'
    )
    .version('1.0.0');

  // Mode
  program
    .option('--simple', 'Minimal input — auto-creates all resources with defaults')
    .option('--advanced', 'More options — create new or reuse existing resources');

  // Core
  program
    .option('--pipeline-name <name>', 'Pipeline name and resource prefix', DEFAULTS.pipelineName)
    .option('--region <region>', 'AWS region (e.g. us-east-1)');

  // OpenSearch — reuse
  program
    .option('--opensearch-endpoint <url>', 'Reuse an existing OpenSearch endpoint')
    .option('--opensearch-user <user>', 'OpenSearch master username', 'admin')
    .option('--opensearch-password <password>', 'Master password for existing OpenSearch domain (for FGAC mapping)');
  // OpenSearch — create
  program
    .option('--os-domain-name <name>', 'Domain name for new OpenSearch domain')
    .option('--os-instance-type <type>', 'Instance type', DEFAULTS.osInstanceType)
    .option('--os-instance-count <n>', 'Number of data nodes', DEFAULTS.osInstanceCount)
    .option('--os-volume-size <gb>', 'EBS volume size in GB', DEFAULTS.osVolumeSize)
    .option('--os-engine-version <ver>', 'Engine version', DEFAULTS.osEngineVersion)
    .option('--managed', 'Target is OpenSearch managed domain');

  // IAM
  program
    .option('--iam-role-arn <arn>', 'Reuse an existing IAM role')
    .option('--iam-role-name <name>', 'Name for new IAM role');

  // APS
  program
    .option('--prometheus-url <url>', 'Reuse an existing APS remote-write URL')
    .option('--aps-workspace-alias <name>', 'Alias for new APS workspace');

  // Dashboards
  program
    .option('--dashboards-url <url>', 'Reuse an existing OpenSearch UI URL');

  // Pipeline tuning
  program
    .option('--min-ocu <n>', 'Minimum OCUs', DEFAULTS.minOcu)
    .option('--max-ocu <n>', 'Maximum OCUs', DEFAULTS.maxOcu)
    .option('--service-map-window <dur>', 'Service-map window duration', DEFAULTS.serviceMapWindow);

  // Output
  program
    .option('-o, --output <file>', 'Write pipeline YAML to file instead of stdout')
    .option('--dry-run', 'Generate config only; do not create AWS resources')
    .option('--skip-demo', 'Skip launching EC2 demo workloads');

  program.parse(argv);

  return optsToConfig(program.opts());
}

function parseDestroyArgs(argv) {
  const program = new Command()
    .name('observability-stack-aws-cli destroy')
    .description('Tear down all AWS resources created by the CLI for a given pipeline name')
    .requiredOption('--pipeline-name <name>', 'Pipeline name used during creation')
    .option('--region <region>', 'AWS region', process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION);

  program.parse(argv.slice(1));
  return { _command: 'destroy', ...program.opts() };
}

/**
 * Convert commander opts to our normalized config shape.
 */
function optsToConfig(opts) {
  const mode = opts.advanced ? 'advanced' : 'simple';

  // Determine actions based on which flags were provided
  let osAction = '';
  if (opts.opensearchEndpoint) osAction = 'reuse';
  else if (opts.osDomainName) osAction = 'create';

  let iamAction = '';
  if (opts.iamRoleArn) iamAction = 'reuse';
  else if (opts.iamRoleName) iamAction = 'create';

  let apsAction = '';
  if (opts.prometheusUrl) apsAction = 'reuse';
  else if (opts.apsWorkspaceAlias) apsAction = 'create';

  let dashboardsAction = '';
  if (opts.dashboardsUrl) dashboardsAction = 'reuse';
  else dashboardsAction = 'create';

  return {
    mode,
    pipelineName: opts.pipelineName,
    region: opts.region || '',
    osAction,
    opensearchEndpoint: opts.opensearchEndpoint || '',
    opensearchUser: opts.opensearchUser || 'admin',
    opensearchPassword: opts.opensearchPassword || '',
    osDomainName: opts.osDomainName || '',
    osInstanceType: opts.osInstanceType,
    osInstanceCount: Number(opts.osInstanceCount),
    osVolumeSize: Number(opts.osVolumeSize),
    osEngineVersion: opts.osEngineVersion,
    iamAction,
    iamRoleArn: opts.iamRoleArn || '',
    iamRoleName: opts.iamRoleName || '',
    apsAction,
    prometheusUrl: opts.prometheusUrl || '',
    apsWorkspaceAlias: opts.apsWorkspaceAlias || '',
    apsWorkspaceId: '',
    minOcu: Number(opts.minOcu),
    maxOcu: Number(opts.maxOcu),
    serviceMapWindow: opts.serviceMapWindow,
    dashboardsAction,
    dashboardsUrl: opts.dashboardsUrl || '',
    dqsRoleName: '',
    dqsRoleArn: '',
    dqsDataSourceName: '',
    dqsDataSourceArn: '',
    appName: '',
    appId: '',
    appEndpoint: '',
    outputFile: opts.output || '',
    dryRun: opts.dryRun || false,
    skipDemo: opts.skipDemo || false,
    accountId: '',
  };
}

/**
 * Apply simple-mode defaults: fill in blanks so every field has a value.
 */
export function applySimpleDefaults(cfg) {
  if (!cfg.osAction) cfg.osAction = 'create';
  if (!cfg.osDomainName) cfg.osDomainName = cfg.pipelineName;
  if (!cfg.iamAction) cfg.iamAction = 'create';
  if (!cfg.iamRoleName) cfg.iamRoleName = `${cfg.pipelineName}-osi-role`;
  if (!cfg.apsAction) cfg.apsAction = 'create';
  if (!cfg.apsWorkspaceAlias) cfg.apsWorkspaceAlias = cfg.pipelineName;
  if (!cfg.dashboardsAction) cfg.dashboardsAction = 'create';
  if (!cfg.dqsRoleName) cfg.dqsRoleName = `${cfg.pipelineName}-dqs-prometheus-role`;
  if (!cfg.dqsDataSourceName) cfg.dqsDataSourceName = `${cfg.pipelineName.replace(/-/g, '_')}_prometheus`;
  if (!cfg.appName) cfg.appName = cfg.pipelineName;
}

/**
 * Fill in placeholder values for resources that would be created in dry-run mode.
 */
export function fillDryRunPlaceholders(cfg) {
  if (cfg.osAction === 'create' && !cfg.opensearchEndpoint) {
    cfg.opensearchEndpoint = `https://search-${cfg.osDomainName}.${cfg.region}.es.amazonaws.com`;
  }
  if (cfg.iamAction === 'create' && !cfg.iamRoleArn) {
    cfg.iamRoleArn = `arn:aws:iam::${cfg.accountId || '123456789012'}:role/${cfg.iamRoleName}`;
  }
  if (cfg.apsAction === 'create' && !cfg.prometheusUrl) {
    cfg.prometheusUrl = `https://aps-workspaces.${cfg.region}.amazonaws.com/workspaces/<workspace-id>/api/v1/remote_write`;
  }
  if (!cfg.dqsRoleArn && cfg.dqsRoleName) {
    cfg.dqsRoleArn = `arn:aws:iam::${cfg.accountId || '123456789012'}:role/${cfg.dqsRoleName}`;
  }
  if (!cfg.dqsDataSourceArn && cfg.dqsDataSourceName) {
    cfg.dqsDataSourceArn = `arn:aws:opensearch:${cfg.region}:${cfg.accountId || '123456789012'}:datasource/${cfg.dqsDataSourceName}`;
  }
  if (!cfg.appEndpoint) {
    cfg.appEndpoint = `https://<app-id>.${cfg.region}.opensearch.amazonaws.com`;
  }
}

/**
 * Validate the config. Returns an array of error strings (empty = valid).
 */
export function validateConfig(cfg) {
  const errors = [];

  if (!cfg.pipelineName) errors.push('--pipeline-name is required');
  if (!cfg.region) errors.push('--region is required');

  if (cfg.osAction === 'reuse' && !cfg.opensearchEndpoint) {
    errors.push('--opensearch-endpoint required when reusing OpenSearch');
  }
  if (cfg.iamAction === 'reuse' && !cfg.iamRoleArn) {
    errors.push('--iam-role-arn required when reusing IAM role');
  }
  if (cfg.apsAction === 'reuse' && !cfg.prometheusUrl) {
    errors.push('--prometheus-url required when reusing APS workspace');
  }
  if (cfg.dashboardsAction === 'reuse' && !cfg.dashboardsUrl) {
    errors.push('--dashboards-url required when reusing OpenSearch UI');
  }

  // Format checks
  if (cfg.region && !/^[a-z]{2}-[a-z]+-\d+$/.test(cfg.region)) {
    errors.push(`Region format looks wrong: ${cfg.region} (expected e.g. us-east-1)`);
  }
  if (cfg.osAction === 'reuse' && cfg.opensearchEndpoint && !/^https?:\/\//.test(cfg.opensearchEndpoint)) {
    errors.push('OpenSearch endpoint must start with http:// or https://');
  }
  if (cfg.iamAction === 'reuse' && cfg.iamRoleArn && !cfg.iamRoleArn.startsWith('arn:aws:iam:')) {
    errors.push('IAM role ARN must start with arn:aws:iam:');
  }
  if (cfg.apsAction === 'reuse' && cfg.prometheusUrl && !/^https?:\/\//.test(cfg.prometheusUrl)) {
    errors.push('Prometheus URL must start with http:// or https://');
  }

  return errors;
}
