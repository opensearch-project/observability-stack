import {
  printStep, printInfo, printBox, printWarning,
  theme, GoBack, STAR, eSelect, eInput, eConfirm, createSpinner,
} from '../ui.mjs';
import { listPipelines, getPipelineEndpoint } from '../aws.mjs';
import { checkDemoPrerequisites, createEksCluster, installHelmChart, installOtelDemo } from '../eks.mjs';

const DEMO_DEFAULTS = {
  clusterName: 'open-stack-demo',
  nodeCount: 3,
  instanceType: 'm8i.large',
};

/**
 * Prompt user to select an OSI pipeline. Returns { pipelineName, otlpEndpoint } or GoBack.
 */
async function selectPipeline(region) {
  const spinner = createSpinner('Loading pipelines...');
  spinner.start();

  let pipelines;
  try {
    pipelines = await listPipelines(region);
    spinner.succeed(`${pipelines.length} pipeline${pipelines.length !== 1 ? 's' : ''} found`);
  } catch (err) {
    spinner.fail('Failed to list pipelines');
    throw err;
  }

  const active = pipelines.filter((p) => p.status === 'ACTIVE');
  if (active.length === 0) {
    printWarning('No active OSI pipelines found. Create one first.');
    return null;
  }

  const choice = await eSelect({
    message: 'Select OSI pipeline to connect',
    choices: active.map((p) => ({
      name: `${theme.accent(p.name)}  ${theme.muted(p.status)}`,
      value: p.name,
    })),
  });
  if (choice === GoBack) return GoBack;

  const endpointSpinner = createSpinner('Getting pipeline endpoint...');
  endpointSpinner.start();
  try {
    const endpoint = await getPipelineEndpoint(region, choice);
    endpointSpinner.succeed(`Endpoint: ${endpoint}`);
    return { pipelineName: choice, otlpEndpoint: endpoint };
  } catch (err) {
    endpointSpinner.fail('Failed to get pipeline endpoint');
    throw err;
  }
}

/**
 * Run the demo services command — creates an EKS cluster and installs
 * the observability stack Helm chart with demo applications.
 */
export async function runDemo(session) {
  console.error();
  printStep('Install Demo');
  printInfo('Creates an EKS cluster and installs the observability stack Helm chart with demo applications');
  printInfo(`Default config: ${DEMO_DEFAULTS.nodeCount} x ${DEMO_DEFAULTS.instanceType} nodes`);
  console.error();

  // Collect cluster name
  const clusterName = await eInput({
    message: 'EKS cluster name',
    default: DEMO_DEFAULTS.clusterName,
    validate: (v) => v.trim().length > 0 || 'Cluster name is required',
  });
  if (clusterName === GoBack) return GoBack;

  // Select OSI pipeline to connect
  const pipeline = await selectPipeline(session.region);
  if (pipeline === GoBack) return GoBack;
  if (!pipeline) return;

  const { nodeCount, instanceType } = DEMO_DEFAULTS;

  // Confirm
  console.error();
  printInfo(`Cluster: ${theme.accent(clusterName)} | Nodes: ${theme.accent(String(nodeCount))} x ${theme.accent(instanceType)} | Region: ${theme.accent(session.region)}`);
  printInfo(`Pipeline: ${theme.accent(pipeline.pipelineName)}`);
  console.error();

  const proceed = await eConfirm({
    message: 'Create EKS cluster and install demo services?',
    default: true,
  });
  if (proceed === GoBack || !proceed) {
    console.error(`  ${theme.muted('Cancelled.')}`);
    console.error();
    return;
  }

  // Execute
  console.error();
  checkDemoPrerequisites();
  await createEksCluster({
    clusterName,
    region: session.region,
    nodeCount,
    instanceType,
    stackName: pipeline.pipelineName,
    accountId: session.accountId,
  });
  console.error();
  await installHelmChart({ otlpEndpoint: pipeline.otlpEndpoint });
  console.error();
  await installOtelDemo({ otlpEndpoint: pipeline.otlpEndpoint });
  console.error();

  printBox([
    '',
    `${theme.success.bold(`${STAR} Demo Services Deployed! ${STAR}`)}`,
    '',
    `${theme.label('Cluster:')}    ${clusterName}`,
    `${theme.label('Region:')}     ${session.region}`,
    `${theme.label('Nodes:')}      ${nodeCount} x ${instanceType}`,
    `${theme.label('Pipeline:')}   ${pipeline.pipelineName}`,
    `${theme.label('Namespace:')}  observability`,
    `${theme.label('Release:')}    obs-stack`,
    '',
    `${theme.muted('Check pods:')}      kubectl get pods -n observability`,
    `${theme.muted('OTel Demo pods:')}  kubectl get pods -n otel-demo`,
    `${theme.muted('Dashboards:')}      kubectl port-forward svc/obs-stack-opensearch-dashboards 5601:5601 -n observability`,
    `${theme.muted('Demo Frontend:')}   kubectl port-forward svc/otel-demo-frontend-proxy 8080:8080 -n otel-demo`,
    '',
  ], { color: 'primary', padding: 2 });
}

/**
 * Prompt the user to optionally create demo EKS services after stack creation.
 * When called from the create flow, pipelineName is the pipeline just created.
 * Returns true if demo was created, false if skipped.
 */
export async function promptDemoAfterCreate(session, pipelineName) {
  console.error();
  const wantDemo = await eConfirm({
    message: 'Would you like to install demo EKS services?',
    default: false,
  });

  if (wantDemo === GoBack || !wantDemo) return false;

  console.error();
  const clusterName = await eInput({
    message: 'EKS cluster name',
    default: DEMO_DEFAULTS.clusterName,
    validate: (v) => v.trim().length > 0 || 'Cluster name is required',
  });
  if (clusterName === GoBack) return false;

  console.error();
  checkDemoPrerequisites();

  // Get the OTLP endpoint for the just-created pipeline
  let otlpEndpoint;
  try {
    otlpEndpoint = await getPipelineEndpoint(session.region, pipelineName);
    if (otlpEndpoint) {
      printInfo(`Using pipeline: ${theme.accent(pipelineName)}`);
      printInfo(`OTLP endpoint: ${theme.accent(otlpEndpoint)}`);
    }
  } catch {
    printWarning('Could not get pipeline endpoint — Helm chart will use default config');
  }

  const { nodeCount, instanceType } = DEMO_DEFAULTS;

  console.error();
  await createEksCluster({
    clusterName,
    region: session.region,
    nodeCount,
    instanceType,
    stackName: pipelineName,
    accountId: session.accountId,
  });
  console.error();
  await installHelmChart({ otlpEndpoint });
  console.error();
  await installOtelDemo({ otlpEndpoint });
  console.error();

  printInfo(`Demo services deployed. Check: kubectl get pods -n observability`);
  printInfo(`OTel Demo pods: kubectl get pods -n otel-demo`);
  printInfo(`Demo Frontend: kubectl port-forward svc/otel-demo-frontend-proxy 8080:8080 -n otel-demo`);
  return true;
}
