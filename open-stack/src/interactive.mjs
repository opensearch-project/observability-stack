import { select, input, confirm } from '@inquirer/prompts';
import {
  printHeader, printStep, printInfo, printSubStep, printKeyHint,
  createSpinner, theme, GoBack, withEscape,
} from './ui.mjs';
import { createDefaultConfig, DEFAULTS } from './config.mjs';
import { listDomains, listRoles, listWorkspaces } from './aws.mjs';

const CUSTOM_INPUT = Symbol('custom');

const eSelect = withEscape(select);
const eInput = withEscape(input);
const eConfirm = withEscape(confirm);

/**
 * Fetch resources with a spinner, returning [] on failure.
 */
async function fetchWithSpinner(label, fn) {
  const spinner = createSpinner(label);
  spinner.start();
  try {
    const result = await fn();
    spinner.succeed(`${label} (${result.length} found)`);
    return result;
  } catch (err) {
    spinner.warn(`Could not list resources: ${err.message}`);
    return [];
  }
}

// ── Step functions ────────────────────────────────────────────────────────────

async function stepMode(cfg) {
  printStep('Select mode');
  console.error();

  const mode = await eSelect({
    message: 'Mode',
    choices: [
      { name: `Simple   ${theme.muted('\u2014 just name + region; creates all resources with defaults')}`, value: 'simple' },
      { name: `Advanced ${theme.muted('\u2014 create new or reuse existing resources; tune pipeline settings')}`, value: 'advanced' },
    ],
    default: cfg.mode || 'simple',
  });
  if (mode === GoBack) return GoBack;
  cfg.mode = mode;
  console.error();
}

async function stepCore(cfg, session) {
  printStep('Core settings');
  console.error();

  const name = await eInput({
    message: 'Pipeline name',
    default: cfg.pipelineName || DEFAULTS.pipelineName,
    validate: (v) => v.trim().length > 0 || 'Pipeline name is required',
  });
  if (name === GoBack) return GoBack;
  cfg.pipelineName = name;

  if (session) {
    cfg.region = session.region;
    cfg.accountId = session.accountId;
    printSubStep(`Region: ${theme.accent(cfg.region)} (from session)`);
  } else {
    const region = await eInput({
      message: 'AWS region',
      default: cfg.region || 'us-east-1',
      validate: (v) => /^[a-z]{2}-[a-z]+-\d+$/.test(v) || 'Expected format: us-east-1',
    });
    if (region === GoBack) return GoBack;
    cfg.region = region;
  }

  // Simple mode: auto-derive all resources from pipeline name
  if (cfg.mode === 'simple') {
    cfg.osAction = 'create';
    cfg.osDomainName = cfg.pipelineName;
    cfg.serverless = true;
    cfg.iamAction = 'create';
    cfg.iamRoleName = `${cfg.pipelineName}-osi-role`;
    cfg.apsAction = 'create';
    cfg.apsWorkspaceAlias = cfg.pipelineName;
    console.error();
    printSubStep(
      `Will create: OpenSearch Serverless collection '${theme.accent(cfg.osDomainName)}', ` +
      `IAM role '${theme.accent(cfg.iamRoleName)}', APS workspace '${theme.accent(cfg.apsWorkspaceAlias)}'`
    );
  }
}

async function stepOpenSearch(cfg) {
  if (cfg.mode !== 'advanced') return 'skip';

  printStep('OpenSearch domain');
  console.error();

  const osChoice = await eSelect({
    message: 'Create new or reuse existing?',
    choices: [
      { name: 'Create new', value: 'create' },
      { name: 'Reuse existing', value: 'reuse' },
    ],
    default: cfg.osAction || 'create',
  });
  if (osChoice === GoBack) return GoBack;

  if (osChoice === 'reuse') {
    cfg.osAction = 'reuse';

    const domains = await fetchWithSpinner(
      'Loading OpenSearch domains & collections',
      () => listDomains(cfg.region),
    );

    if (domains.length > 0) {
      const choices = domains.map((d) => ({
        name: d.endpoint
          ? `${d.name} ${theme.muted(`\u2014 ${d.endpoint} (${d.engineVersion})`)}`
          : `${d.name} ${theme.muted(`\u2014 provisioning... (${d.engineVersion})`)}`,
        value: { endpoint: d.endpoint, serverless: d.serverless },
        disabled: !d.endpoint ? '(no endpoint yet)' : false,
      }));
      choices.push({ name: theme.accent('Enter manually...'), value: CUSTOM_INPUT });

      const selected = await eSelect({ message: 'Select domain or collection', choices });
      if (selected === GoBack) return GoBack;
      if (selected === CUSTOM_INPUT) {
        const ep = await promptEndpoint();
        if (ep === GoBack) return GoBack;
        cfg.opensearchEndpoint = ep;
        cfg.serverless = isServerlessEndpoint(ep);
      } else {
        cfg.opensearchEndpoint = selected.endpoint;
        cfg.serverless = selected.serverless;
      }
    } else {
      printInfo('No domains or collections found \u2014 enter endpoint manually');
      const ep = await promptEndpoint();
      if (ep === GoBack) return GoBack;
      cfg.opensearchEndpoint = ep;
      cfg.serverless = isServerlessEndpoint(ep);
    }

    printSubStep(`Detected type: ${cfg.serverless ? theme.accent('OpenSearch Serverless') : theme.accent('Managed OpenSearch domain')}`);
  } else {
    cfg.osAction = 'create';

    const domainName = await eInput({ message: 'Domain name', default: cfg.osDomainName || cfg.pipelineName });
    if (domainName === GoBack) return GoBack;
    cfg.osDomainName = domainName;

    const instType = await eInput({ message: 'Instance type', default: cfg.osInstanceType || DEFAULTS.osInstanceType });
    if (instType === GoBack) return GoBack;
    cfg.osInstanceType = instType;

    const instCount = await eInput({
      message: 'Instance count',
      default: String(cfg.osInstanceCount || DEFAULTS.osInstanceCount),
      validate: (v) => /^\d+$/.test(v.trim()) && Number(v) >= 1 || 'Must be a positive integer',
    });
    if (instCount === GoBack) return GoBack;
    cfg.osInstanceCount = Number(instCount);

    const volSize = await eInput({
      message: 'EBS volume size (GB)',
      default: String(cfg.osVolumeSize || DEFAULTS.osVolumeSize),
      validate: (v) => /^\d+$/.test(v.trim()) && Number(v) >= 10 || 'Must be at least 10 GB',
    });
    if (volSize === GoBack) return GoBack;
    cfg.osVolumeSize = Number(volSize);

    const engineVer = await eInput({ message: 'Engine version', default: cfg.osEngineVersion || DEFAULTS.osEngineVersion });
    if (engineVer === GoBack) return GoBack;
    cfg.osEngineVersion = engineVer;
  }
}

async function stepIam(cfg) {
  if (cfg.mode !== 'advanced') return 'skip';

  printStep('IAM role for OSI pipeline');
  console.error();

  const iamChoice = await eSelect({
    message: 'Create new or reuse existing?',
    choices: [
      { name: 'Create new', value: 'create' },
      { name: 'Reuse existing', value: 'reuse' },
    ],
    default: cfg.iamAction || 'create',
  });
  if (iamChoice === GoBack) return GoBack;

  if (iamChoice === 'reuse') {
    cfg.iamAction = 'reuse';

    const roles = await fetchWithSpinner(
      'Loading IAM roles',
      () => listRoles(cfg.region),
    );

    if (roles.length > 0) {
      const osiRoles = [];
      const otherRoles = [];
      for (const r of roles) {
        (/osi|pipeline|ingestion/i.test(r.name) ? osiRoles : otherRoles).push(r);
      }
      const sorted = [...osiRoles, ...otherRoles];

      const choices = sorted.map((r) => ({
        name: `${r.name} ${theme.muted(`\u2014 ${r.arn}`)}`,
        value: r.arn,
      }));
      choices.push({ name: theme.accent('Enter ARN manually...'), value: CUSTOM_INPUT });

      const selected = await eSelect({ message: 'Select role', choices });
      if (selected === GoBack) return GoBack;
      if (selected === CUSTOM_INPUT) {
        const arn = await promptArn();
        if (arn === GoBack) return GoBack;
        cfg.iamRoleArn = arn;
      } else {
        cfg.iamRoleArn = selected;
      }
    } else {
      printInfo('No roles found \u2014 enter ARN manually');
      const arn = await promptArn();
      if (arn === GoBack) return GoBack;
      cfg.iamRoleArn = arn;
    }
  } else {
    cfg.iamAction = 'create';
    const roleName = await eInput({ message: 'Role name', default: cfg.iamRoleName || `${cfg.pipelineName}-osi-role` });
    if (roleName === GoBack) return GoBack;
    cfg.iamRoleName = roleName;
  }
}

async function stepAps(cfg) {
  if (cfg.mode !== 'advanced') return 'skip';

  printStep('Amazon Managed Prometheus (APS) workspace');
  console.error();

  const apsChoice = await eSelect({
    message: 'Create new or reuse existing?',
    choices: [
      { name: 'Create new', value: 'create' },
      { name: 'Reuse existing', value: 'reuse' },
    ],
    default: cfg.apsAction || 'create',
  });
  if (apsChoice === GoBack) return GoBack;

  if (apsChoice === 'reuse') {
    cfg.apsAction = 'reuse';

    const workspaces = await fetchWithSpinner(
      'Loading APS workspaces',
      () => listWorkspaces(cfg.region),
    );

    if (workspaces.length > 0) {
      const choices = workspaces.map((w) => ({
        name: w.alias
          ? `${w.alias} ${theme.muted(`\u2014 ${w.id}`)}`
          : `${w.id} ${theme.muted('(no alias)')}`,
        value: w.url,
      }));
      choices.push({ name: theme.accent('Enter URL manually...'), value: CUSTOM_INPUT });

      const selected = await eSelect({ message: 'Select workspace', choices });
      if (selected === GoBack) return GoBack;
      if (selected === CUSTOM_INPUT) {
        const url = await promptUrl('Prometheus remote-write URL');
        if (url === GoBack) return GoBack;
        cfg.prometheusUrl = url;
      } else {
        cfg.prometheusUrl = selected;
      }
    } else {
      printInfo('No workspaces found \u2014 enter URL manually');
      const url = await promptUrl('Prometheus remote-write URL');
      if (url === GoBack) return GoBack;
      cfg.prometheusUrl = url;
    }
  } else {
    cfg.apsAction = 'create';
    const alias = await eInput({ message: 'Workspace alias', default: cfg.apsWorkspaceAlias || cfg.pipelineName });
    if (alias === GoBack) return GoBack;
    cfg.apsWorkspaceAlias = alias;
  }
}

async function stepTuning(cfg) {
  if (cfg.mode !== 'advanced') return 'skip';

  printStep('Pipeline tuning');
  console.error();

  const minOcu = await eInput({
    message: 'Minimum OCUs',
    default: String(cfg.minOcu ?? DEFAULTS.minOcu),
    validate: (v) => /^\d+$/.test(v.trim()) && Number(v) >= 1 || 'Must be a positive integer',
  });
  if (minOcu === GoBack) return GoBack;
  cfg.minOcu = Number(minOcu);

  const maxOcu = await eInput({
    message: 'Maximum OCUs',
    default: String(cfg.maxOcu ?? DEFAULTS.maxOcu),
    validate: (v) => /^\d+$/.test(v.trim()) && Number(v) >= 1 || 'Must be a positive integer',
  });
  if (maxOcu === GoBack) return GoBack;
  cfg.maxOcu = Number(maxOcu);

  const window = await eInput({ message: 'Service-map window duration', default: cfg.serviceMapWindow || DEFAULTS.serviceMapWindow });
  if (window === GoBack) return GoBack;
  cfg.serviceMapWindow = window;
}

async function stepOutput(cfg) {
  printStep('Output');
  console.error();

  const outputFile = await eInput({ message: 'Output file for pipeline YAML (leave empty for stdout)', default: cfg.outputFile || '' });
  if (outputFile === GoBack) return GoBack;
  cfg.outputFile = outputFile;

  const dryRun = await eConfirm({
    message: 'Dry run only (generate config, skip resource creation)?',
    default: cfg.dryRun ?? true,
  });
  if (dryRun === GoBack) return GoBack;
  cfg.dryRun = dryRun;
}

// ── Main wizard ──────────────────────────────────────────────────────────────

/**
 * Run the interactive create wizard. Returns a fully populated config object.
 * Supports Escape to go back to the previous step.
 * @param {Object} [session] - Optional session with pre-filled { region, accountId }
 */
export async function runCreateWizard(session = null) {
  const cfg = createDefaultConfig();

  if (!session) printHeader();
  printKeyHint([['Esc', 'back'], ['Ctrl+C', 'cancel']]);
  console.error();

  const steps = [stepMode, stepCore, stepOpenSearch, stepIam, stepAps, stepTuning, stepOutput];
  const visited = [];
  let i = 0;

  while (i < steps.length) {
    const result = await steps[i](cfg, session);

    if (result === GoBack) {
      if (visited.length === 0) {
        // Escape at first step → cancel wizard (same as Ctrl+C)
        throw Object.assign(new Error('Cancelled'), { name: 'ExitPromptError' });
      }
      i = visited.pop();
    } else if (result === 'skip') {
      i++;
    } else {
      visited.push(i);
      i++;
    }
  }

  console.error();
  return cfg;
}

// ── Prompt helpers for manual input fallback ────────────────────────────────────

function promptEndpoint() {
  return eInput({
    message: 'OpenSearch endpoint URL',
    validate: (v) => {
      if (!v.trim()) return 'Endpoint is required';
      if (!/^https?:\/\//.test(v)) return 'Must start with http:// or https://';
      return true;
    },
  });
}

function promptArn() {
  return eInput({
    message: 'IAM role ARN',
    validate: (v) => {
      if (!v.trim()) return 'ARN is required';
      if (!v.startsWith('arn:aws:iam:')) return 'Must start with arn:aws:iam:';
      return true;
    },
  });
}

function promptUrl(message) {
  return eInput({
    message,
    validate: (v) => {
      if (!v.trim()) return 'URL is required';
      if (!/^https?:\/\//.test(v)) return 'Must start with http:// or https://';
      return true;
    },
  });
}

/**
 * Detect serverless from endpoint URL pattern.
 * Serverless endpoints: https://<id>.<region>.aoss.amazonaws.com
 * Managed endpoints:    https://search-<name>.<region>.es.amazonaws.com
 */
function isServerlessEndpoint(endpoint) {
  return /\.aoss\.amazonaws\.com/i.test(endpoint);
}
