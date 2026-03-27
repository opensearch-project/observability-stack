import { select, input, confirm } from '@inquirer/prompts';
import { getPipeline, updatePipeline } from '../aws.mjs';
import { printInfo, printPanel, createSpinner, theme, ARROW } from '../ui.mjs';
import { loadPipelines } from './index.mjs';

/**
 * Extract known configurable values from pipeline YAML by regex.
 */
function parseConfigValues(yaml) {
  if (!yaml) return {};

  const vals = {};

  // OpenSearch hosts (first occurrence)
  const hostsMatch = yaml.match(/hosts:\s*\n\s*-\s*'([^']+)'/);
  if (hostsMatch) vals.opensearchEndpoint = hostsMatch[1];

  // IAM role ARN (sts_role_arn)
  const roleMatch = yaml.match(/sts_role_arn:\s*"([^"]+)"/);
  if (roleMatch) vals.iamRoleArn = roleMatch[1];

  // Prometheus URL
  const promMatch = yaml.match(/url:\s*'([^']*prometheus[^']*)'/i)
    || yaml.match(/url:\s*'([^']*aps-workspaces[^']*)'/i);
  if (promMatch) vals.prometheusUrl = promMatch[1];

  // Service map window duration
  const windowMatch = yaml.match(/window_duration:\s*(\S+)/);
  if (windowMatch) vals.serviceMapWindow = windowMatch[1];

  // Serverless flag
  vals.serverless = /serverless:\s*true/i.test(yaml);

  return vals;
}

/**
 * Replace known config values in pipeline YAML.
 */
function patchConfigYaml(yaml, updates) {
  let patched = yaml;

  if (updates.opensearchEndpoint) {
    patched = patched.replace(
      /(hosts:\s*\n\s*-\s*')([^']+)(')/g,
      `$1${updates.opensearchEndpoint}$3`,
    );
  }

  if (updates.iamRoleArn) {
    patched = patched.replace(
      /(sts_role_arn:\s*")([^"]+)(")/g,
      `$1${updates.iamRoleArn}$3`,
    );
  }

  if (updates.prometheusUrl) {
    patched = patched.replace(
      /(url:\s*')([^']*(?:prometheus|aps-workspaces)[^']*)(')/gi,
      `$1${updates.prometheusUrl}$3`,
    );
  }

  if (updates.serviceMapWindow) {
    patched = patched.replace(
      /(window_duration:\s*)\S+/,
      `$1${updates.serviceMapWindow}`,
    );
  }

  return patched;
}

export async function runUpdate(session) {
  console.error();

  const pipelines = await loadPipelines(session.region);

  // Filter to updatable pipelines
  const updatable = pipelines.filter((p) => p.status === 'ACTIVE');
  if (updatable.length === 0) {
    printInfo('No active pipelines available for update.');
    console.error();
    return;
  }

  // Select pipeline
  const choices = updatable.map((p) => ({
    name: `${p.name}  ${theme.muted(`(OCUs: ${p.minUnits}\u2013${p.maxUnits})`)}`,
    value: p.name,
  }));

  const pipelineName = await select({
    message: 'Select pipeline to update',
    choices,
  });

  // Get current details
  const detailSpinner = createSpinner(`Loading ${pipelineName}...`);
  detailSpinner.start();

  let pipeline;
  try {
    pipeline = await getPipeline(session.region, pipelineName);
    detailSpinner.succeed(`Loaded ${pipelineName}`);
  } catch (err) {
    detailSpinner.fail('Failed to get pipeline details');
    throw err;
  }

  // Parse current config values from YAML
  const current = parseConfigValues(pipeline.pipelineConfigurationBody);

  // Show current config summary in a panel
  console.error();
  const configEntries = [
    ['Min OCUs', String(pipeline.minUnits)],
    ['Max OCUs', String(pipeline.maxUnits)],
  ];
  if (current.opensearchEndpoint) {
    configEntries.push(['OpenSearch endpoint', current.opensearchEndpoint]);
  }
  if (current.iamRoleArn) {
    configEntries.push(['IAM role ARN', current.iamRoleArn]);
  }
  if (current.prometheusUrl) {
    configEntries.push(['Prometheus URL', current.prometheusUrl]);
  }
  if (current.serviceMapWindow) {
    configEntries.push(['Service map window', current.serviceMapWindow]);
  }

  const cwLogGroup = pipeline.logPublishingOptions?.CloudWatchLogDestination?.LogGroup;
  if (cwLogGroup) {
    configEntries.push(['CloudWatch log group', cwLogGroup]);
  }

  const persistentBuffering = pipeline.bufferOptions?.PersistentBufferEnabled;
  configEntries.push(['Persistent buffering', persistentBuffering ? 'enabled' : 'disabled']);

  printPanel('Current Configuration', configEntries);
  console.error();

  // ── Prompt for new values ──────────────────────────────────────────────

  const newMinOcu = Number(await input({
    message: 'Minimum OCUs',
    default: String(pipeline.minUnits),
    validate: (v) => /^\d+$/.test(v.trim()) && Number(v) >= 1 || 'Must be a positive integer',
  }));

  const newMaxOcu = Number(await input({
    message: 'Maximum OCUs',
    default: String(pipeline.maxUnits),
    validate: (v) => /^\d+$/.test(v.trim()) && Number(v) >= newMinOcu || `Must be >= min OCUs (${newMinOcu})`,
  }));

  // Pipeline config values
  const yamlUpdates = {};
  let configChanged = false;

  if (current.opensearchEndpoint) {
    const newEndpoint = await input({
      message: 'OpenSearch endpoint',
      default: current.opensearchEndpoint,
      validate: (v) => /^https?:\/\//.test(v.trim()) || 'Must start with http:// or https://',
    });
    if (newEndpoint !== current.opensearchEndpoint) {
      yamlUpdates.opensearchEndpoint = newEndpoint;
      configChanged = true;
    }
  }

  if (current.iamRoleArn) {
    const newRole = await input({
      message: 'IAM role ARN (sts_role_arn)',
      default: current.iamRoleArn,
      validate: (v) => v.trim().startsWith('arn:aws:iam:') || 'Must start with arn:aws:iam:',
    });
    if (newRole !== current.iamRoleArn) {
      yamlUpdates.iamRoleArn = newRole;
      configChanged = true;
    }
  }

  if (current.prometheusUrl) {
    const newProm = await input({
      message: 'Prometheus remote-write URL',
      default: current.prometheusUrl,
      validate: (v) => /^https?:\/\//.test(v.trim()) || 'Must start with http:// or https://',
    });
    if (newProm !== current.prometheusUrl) {
      yamlUpdates.prometheusUrl = newProm;
      configChanged = true;
    }
  }

  if (current.serviceMapWindow) {
    const newWindow = await input({
      message: 'Service map window duration',
      default: current.serviceMapWindow,
      validate: (v) => /^\d+[smh]$/.test(v.trim()) || 'Expected format: 10s, 5m, 1h',
    });
    if (newWindow !== current.serviceMapWindow) {
      yamlUpdates.serviceMapWindow = newWindow;
      configChanged = true;
    }
  }

  // Log publishing options
  const newLogGroup = await input({
    message: 'CloudWatch log group (leave empty to disable)',
    default: cwLogGroup || '',
  });

  const logPublishingChanged = (newLogGroup || '') !== (cwLogGroup || '');

  // Persistent buffering
  const newPersistentBuffer = await confirm({
    message: 'Enable persistent buffering?',
    default: !!persistentBuffering,
  });

  const bufferChanged = newPersistentBuffer !== !!persistentBuffering;

  // ── Check for changes ──────────────────────────────────────────────────

  const ocuChanged = newMinOcu !== pipeline.minUnits || newMaxOcu !== pipeline.maxUnits;

  if (!ocuChanged && !configChanged && !logPublishingChanged && !bufferChanged) {
    printInfo('No changes \u2014 all values are the same as current config.');
    console.error();
    return;
  }

  // ── Summary of changes ─────────────────────────────────────────────────

  console.error();
  const changeLines = [];
  if (ocuChanged) {
    changeLines.push(`OCUs: ${pipeline.minUnits}\u2013${pipeline.maxUnits} ${ARROW} ${newMinOcu}\u2013${newMaxOcu}`);
  }
  if (yamlUpdates.opensearchEndpoint) {
    changeLines.push(`OpenSearch: ${theme.muted(current.opensearchEndpoint)} ${ARROW} ${yamlUpdates.opensearchEndpoint}`);
  }
  if (yamlUpdates.iamRoleArn) {
    changeLines.push(`IAM role: ${theme.muted(current.iamRoleArn)} ${ARROW} ${yamlUpdates.iamRoleArn}`);
  }
  if (yamlUpdates.prometheusUrl) {
    changeLines.push(`Prometheus: ${theme.muted(current.prometheusUrl)} ${ARROW} ${yamlUpdates.prometheusUrl}`);
  }
  if (yamlUpdates.serviceMapWindow) {
    changeLines.push(`Service map window: ${current.serviceMapWindow} ${ARROW} ${yamlUpdates.serviceMapWindow}`);
  }
  if (logPublishingChanged) {
    const from = cwLogGroup || '(disabled)';
    const to = newLogGroup || '(disabled)';
    changeLines.push(`CloudWatch logging: ${from} ${ARROW} ${to}`);
  }
  if (bufferChanged) {
    changeLines.push(`Persistent buffering: ${persistentBuffering ? 'enabled' : 'disabled'} ${ARROW} ${newPersistentBuffer ? 'enabled' : 'disabled'}`);
  }

  printPanel('Pending Changes', changeLines.map((l) => ['', theme.warn('\u2022') + ' ' + l]));
  console.error();

  // Confirm
  const proceed = await confirm({
    message: `Apply these changes to ${pipelineName}?`,
    default: true,
  });

  if (!proceed) {
    printInfo('Update cancelled.');
    console.error();
    return;
  }

  // ── Build update params ────────────────────────────────────────────────

  const params = {};

  if (ocuChanged) {
    params.minUnits = newMinOcu;
    params.maxUnits = newMaxOcu;
  }

  if (configChanged) {
    params.pipelineConfigurationBody = patchConfigYaml(
      pipeline.pipelineConfigurationBody,
      yamlUpdates,
    );
  }

  if (logPublishingChanged) {
    params.logPublishingOptions = newLogGroup
      ? { IsLoggingEnabled: true, CloudWatchLogDestination: { LogGroup: newLogGroup } }
      : { IsLoggingEnabled: false };
  }

  if (bufferChanged) {
    params.bufferOptions = { PersistentBufferEnabled: newPersistentBuffer };
  }

  // Execute update
  console.error();
  await updatePipeline(session.region, pipelineName, params);
  console.error();
}
