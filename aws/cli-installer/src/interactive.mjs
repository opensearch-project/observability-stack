import {
  printHeader, printStep, printInfo, printSubStep,
  createSpinner, theme, GoBack, eSelect, eInput,
  saveCursor, clearFromCursor,
} from './ui.mjs';
import { createDefaultConfig, DEFAULTS } from './config.mjs';
import { listDomains, listWorkspaces, listApplications } from './aws.mjs';

const CUSTOM_INPUT = Symbol('custom');

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
      { name: `Quick    ${theme.muted('\u2014 creates all resources with defaults')}`, value: 'quick' },
      { name: `Advanced ${theme.muted('\u2014 create new or reuse existing resources; tune pipeline settings')}`, value: 'advanced' },
    ],
    default: cfg.mode || 'quick',
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

  // Quick mode: auto-derive all resources from pipeline name
  if (cfg.mode === 'quick') {
    cfg.osAction = 'create';
    cfg.osDomainName = cfg.pipelineName;
    cfg.iamAction = 'create';
    cfg.iamRoleName = `${cfg.pipelineName}-osi-role`;
    cfg.apsAction = 'create';
    cfg.apsWorkspaceAlias = cfg.pipelineName;
    cfg.dashboardsAction = 'create';
    cfg.connectedDataSourceRoleName = `${cfg.pipelineName}-connected-data-source-prometheus-role`;
    cfg.connectedDataSourceName = `${cfg.pipelineName.replace(/-/g, '_')}_prometheus`;
    cfg.appName = cfg.pipelineName;
    console.error();
    printInfo(`Will create:`);
    printSubStep(`OpenSearch domain: ${theme.accent(cfg.osDomainName)}`);
    printSubStep(`IAM role: ${theme.accent(cfg.iamRoleName)}`);
    printSubStep(`APS workspace: ${theme.accent(cfg.apsWorkspaceAlias)}`);
    printSubStep(`Connected Data Source role: ${theme.accent(cfg.connectedDataSourceRoleName)}`);
    printSubStep(`Connected Data Source: ${theme.accent(cfg.connectedDataSourceName)}`);
    printSubStep(`OpenSearch Application: ${theme.accent(cfg.appName)}`);
  }
}

async function stepOpenSearch(cfg) {
  if (cfg.mode !== 'advanced') return 'skip';

  printStep('OpenSearch');
  console.error();

  while (true) {
    saveCursor();
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
        'Loading OpenSearch domains',
        () => listDomains(cfg.region),
      );

      if (domains.length > 0) {
        const choices = domains.map((d) => ({
          name: d.endpoint
            ? `${d.name} ${theme.muted(`\u2014 ${d.endpoint} (${d.engineVersion})`)}`
            : `${d.name} ${theme.muted(`\u2014 provisioning... (${d.engineVersion})`)}`,
          value: { endpoint: d.endpoint },
          disabled: !d.endpoint ? '(no endpoint yet)' : false,
        }));
        choices.push({ name: theme.accent('Enter manually...'), value: CUSTOM_INPUT });

        const selected = await eSelect({ message: 'Select domain', choices });
        if (selected === GoBack) { clearFromCursor(); continue; }
        if (selected === CUSTOM_INPUT) {
          const ep = await promptEndpoint();
          if (ep === GoBack) { clearFromCursor(); continue; }
          cfg.opensearchEndpoint = ep;
        } else {
          cfg.opensearchEndpoint = selected.endpoint;
        }
      } else {
        printInfo('No domains found \u2014 enter endpoint manually');
        const ep = await promptEndpoint();
        if (ep === GoBack) { clearFromCursor(); continue; }
        cfg.opensearchEndpoint = ep;
      }

      // Try Secrets Manager first — skip prompts if password already stored
      let smPass;
      try { smPass = await getMasterPassword(cfg.region, cfg.pipelineName); } catch {}
      if (smPass) {
        cfg.opensearchUser = cfg.opensearchUser || 'admin';
        cfg.opensearchPassword = smPass;
        printInfo('Master password found in Secrets Manager — skipping credential prompts');
      } else {
        const user = await eInput({
          message: 'OpenSearch master username',
          default: cfg.opensearchUser || 'admin',
        });
        if (user === GoBack) { clearFromCursor(); continue; }
        cfg.opensearchUser = user;

        const pass = await eInput({
          message: 'OpenSearch master password (for FGAC role mapping)',
          validate: (v) => v.trim().length > 0 || 'Password is required to configure access',
        });
        if (pass === GoBack) { clearFromCursor(); continue; }
        cfg.opensearchPassword = pass;
      }
    } else {
      cfg.osAction = 'create';

      const domainName = await eInput({ message: 'Domain name', default: cfg.osDomainName || cfg.pipelineName });
      if (domainName === GoBack) { clearFromCursor(); continue; }
      cfg.osDomainName = domainName;

      const instType = await eInput({ message: 'Instance type', default: cfg.osInstanceType || DEFAULTS.osInstanceType });
      if (instType === GoBack) { clearFromCursor(); continue; }
      cfg.osInstanceType = instType;

      const instCount = await eInput({
        message: 'Instance count',
        default: String(cfg.osInstanceCount || DEFAULTS.osInstanceCount),
        validate: (v) => /^\d+$/.test(v.trim()) && Number(v) >= 1 || 'Must be a positive integer',
      });
      if (instCount === GoBack) { clearFromCursor(); continue; }
      cfg.osInstanceCount = Number(instCount);

      const volSize = await eInput({
        message: 'EBS volume size (GB)',
        default: String(cfg.osVolumeSize || DEFAULTS.osVolumeSize),
        validate: (v) => /^\d+$/.test(v.trim()) && Number(v) >= 10 || 'Must be at least 10 GB',
      });
      if (volSize === GoBack) { clearFromCursor(); continue; }
      cfg.osVolumeSize = Number(volSize);

      const engineVer = await eInput({ message: 'Engine version', default: cfg.osEngineVersion || DEFAULTS.osEngineVersion });
      if (engineVer === GoBack) { clearFromCursor(); continue; }
      cfg.osEngineVersion = engineVer;
    }
    return;
  }
}

async function stepIam(cfg) {
  if (cfg.mode !== 'advanced') return 'skip';

  printStep('IAM role for OSI pipeline');
  printInfo('This role allows the ingestion pipeline to write to OpenSearch and Prometheus');
  console.error();

  while (true) {
    saveCursor();
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
      const arn = await promptArn('IAM role ARN');
      if (arn === GoBack) { clearFromCursor(); continue; }
      cfg.iamRoleArn = arn;
    } else {
      cfg.iamAction = 'create';
      const roleName = await eInput({ message: 'Role name', default: cfg.iamRoleName || `${cfg.pipelineName}-osi-role` });
      if (roleName === GoBack) { clearFromCursor(); continue; }
      cfg.iamRoleName = roleName;
    }
    return;
  }
}

async function stepAps(cfg) {
  if (cfg.mode !== 'advanced') return 'skip';

  printStep('Amazon Managed Prometheus (APS) workspace');
  console.error();

  while (true) {
    saveCursor();
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
        if (selected === GoBack) { clearFromCursor(); continue; }
        if (selected === CUSTOM_INPUT) {
          const url = await promptUrl('Prometheus remote-write URL');
          if (url === GoBack) { clearFromCursor(); continue; }
          cfg.prometheusUrl = url;
        } else {
          cfg.prometheusUrl = selected;
        }
      } else {
        printInfo('No workspaces found \u2014 enter URL manually');
        const url = await promptUrl('Prometheus remote-write URL');
        if (url === GoBack) { clearFromCursor(); continue; }
        cfg.prometheusUrl = url;
      }
    } else {
      cfg.apsAction = 'create';
      const alias = await eInput({ message: 'Workspace alias', default: cfg.apsWorkspaceAlias || cfg.pipelineName });
      if (alias === GoBack) { clearFromCursor(); continue; }
      cfg.apsWorkspaceAlias = alias;
    }
    return;
  }
}

async function stepConnectedDataSourceRole(cfg) {
  if (cfg.mode !== 'advanced') return 'skip';

  printStep('Connected Data Source IAM role');
  printInfo('This role allows OpenSearch to query Prometheus metrics via Connected Data Source');
  console.error();

  while (true) {
    saveCursor();
    const choice = await eSelect({
      message: 'Create new or reuse existing?',
      choices: [
        { name: 'Create new', value: 'create' },
        { name: 'Reuse existing', value: 'reuse' },
      ],
      default: 'create',
    });
    if (choice === GoBack) return GoBack;

    if (choice === 'reuse') {
      const arn = await promptArn('Connected Data Source role ARN');
      if (arn === GoBack) { clearFromCursor(); continue; }
      cfg.connectedDataSourceRoleArn = arn;
      cfg.connectedDataSourceRoleName = '';
    } else {
      const roleName = await eInput({
        message: 'Connected Data Source role name',
        default: cfg.connectedDataSourceRoleName || `${cfg.pipelineName}-connected-data-source-prometheus-role`,
      });
      if (roleName === GoBack) { clearFromCursor(); continue; }
      cfg.connectedDataSourceRoleName = roleName;
    }
    return;
  }
}

async function stepConnectedDataSource(cfg) {
  if (cfg.mode !== 'advanced') return 'skip';
  // Skip if no Connected Data Source role was configured
  if (!cfg.connectedDataSourceRoleName && !cfg.connectedDataSourceRoleArn) return 'skip';

  printStep('Connected Data Source');
  printInfo('Connects OpenSearch to Prometheus so you can query metrics from OpenSearch UI');
  console.error();

  const dsName = await eInput({
    message: 'Data source name',
    default: cfg.connectedDataSourceName || `${cfg.pipelineName.replace(/-/g, '_')}_prometheus`,
    validate: (v) => /^[a-z][a-z0-9_]+$/.test(v.trim()) || 'Must match [a-z][a-z0-9_]+ (lowercase, underscores only)',
  });
  if (dsName === GoBack) return GoBack;
  cfg.connectedDataSourceName = dsName;
}

async function stepApp(cfg) {
  if (cfg.mode !== 'advanced') return 'skip';

  printStep('OpenSearch UI');
  printInfo('The OpenSearch Application provides a unified dashboard for your observability data');
  console.error();

  while (true) {
    saveCursor();
    const choice = await eSelect({
      message: 'Create new or reuse existing?',
      choices: [
        { name: `Create new ${theme.muted('\u2014 creates an OpenSearch Application with data sources')}`, value: 'create' },
        { name: 'Reuse existing', value: 'reuse' },
      ],
      default: cfg.dashboardsAction || 'create',
    });
    if (choice === GoBack) return GoBack;

    if (choice === 'reuse') {
      cfg.dashboardsAction = 'reuse';

      const apps = await fetchWithSpinner(
        'Loading OpenSearch Applications',
        () => listApplications(cfg.region),
      );

      if (apps.length > 0) {
        const choices = apps.map((a) => ({
          name: a.endpoint
            ? `${a.name} ${theme.muted(`\u2014 ${a.endpoint}`)}`
            : `${a.name} ${theme.muted(`(${a.id})`)}`,
          value: a.endpoint || a.id,
        }));
        choices.push({ name: theme.accent('Enter URL manually...'), value: CUSTOM_INPUT });

        const selected = await eSelect({ message: 'Select application', choices });
        if (selected === GoBack) { clearFromCursor(); continue; }
        if (selected === CUSTOM_INPUT) {
          const url = await promptUrl('OpenSearch UI URL');
          if (url === GoBack) { clearFromCursor(); continue; }
          cfg.dashboardsUrl = url;
        } else {
          cfg.dashboardsUrl = selected;
        }
      } else {
        printInfo('No applications found \u2014 enter URL manually');
        const url = await promptUrl('OpenSearch UI URL');
        if (url === GoBack) { clearFromCursor(); continue; }
        cfg.dashboardsUrl = url;
      }
      cfg.appName = '';
    } else {
      cfg.dashboardsAction = 'create';
      const appName = await eInput({
        message: 'Application name',
        default: cfg.appName || cfg.pipelineName,
      });
      if (appName === GoBack) { clearFromCursor(); continue; }
      cfg.appName = appName;
    }
    return;
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

// ── Main wizard ──────────────────────────────────────────────────────────────

/**
 * Run the interactive create wizard. Returns a fully populated config object.
 * Supports Escape to go back to the previous step.
 * @param {Object} [session] - Optional session with pre-filled { region, accountId }
 */
export async function runCreateWizard(session = null) {
  const cfg = createDefaultConfig();

  if (!session) printHeader();

  const steps = [stepMode, stepCore, stepOpenSearch, stepIam, stepAps, stepConnectedDataSourceRole, stepConnectedDataSource, stepApp, stepTuning];
  const visited = [];
  let i = 0;

  while (i < steps.length) {
    saveCursor();
    const result = await steps[i](cfg, session);

    if (result === GoBack) {
      clearFromCursor();
      if (visited.length === 0) {
        // Escape at first step → return to menu
        return GoBack;
      }
      i = visited.pop();
    } else if (result === 'skip') {
      i++;
    } else {
      visited.push(i);
      i++;
    }
  }

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

function promptArn(message) {
  return eInput({
    message,
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


