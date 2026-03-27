import {
  printStep, printInfo, printBox,
  theme, GoBack, STAR, eInput, eConfirm,
} from '../ui.mjs';
import { checkDemoPrerequisites, createEksCluster, installHelmChart } from '../eks.mjs';

const DEMO_DEFAULTS = {
  clusterName: 'open-stack-demo',
  nodeCount: 3,
  instanceType: 'm5.xlarge',
};

/**
 * Run the demo services command — creates an EKS cluster and installs
 * the observability stack Helm chart with demo applications.
 */
export async function runDemo(session) {
  console.error();
  printStep('Create Demo Services');
  printInfo('Creates an EKS cluster and installs the observability stack Helm chart with demo applications');
  console.error();

  // Collect configuration
  const clusterName = await eInput({
    message: 'EKS cluster name',
    default: DEMO_DEFAULTS.clusterName,
    validate: (v) => v.trim().length > 0 || 'Cluster name is required',
  });
  if (clusterName === GoBack) return GoBack;

  const instanceType = await eInput({
    message: 'Node instance type',
    default: DEMO_DEFAULTS.instanceType,
  });
  if (instanceType === GoBack) return GoBack;

  const nodeCountStr = await eInput({
    message: 'Number of nodes',
    default: String(DEMO_DEFAULTS.nodeCount),
    validate: (v) => /^\d+$/.test(v.trim()) && Number(v) >= 1 || 'Must be a positive integer',
  });
  if (nodeCountStr === GoBack) return GoBack;
  const nodeCount = Number(nodeCountStr);

  // Confirm
  console.error();
  printInfo(`Cluster: ${theme.accent(clusterName)} | Nodes: ${theme.accent(String(nodeCount))} x ${theme.accent(instanceType)} | Region: ${theme.accent(session.region)}`);
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
  await createEksCluster({ clusterName, region: session.region, nodeCount, instanceType });
  console.error();
  await installHelmChart({});
  console.error();

  printBox([
    '',
    `${theme.success.bold(`${STAR} Demo Services Deployed! ${STAR}`)}`,
    '',
    `${theme.label('Cluster:')}    ${clusterName}`,
    `${theme.label('Region:')}     ${session.region}`,
    `${theme.label('Nodes:')}      ${nodeCount} x ${instanceType}`,
    `${theme.label('Namespace:')}  observability`,
    `${theme.label('Release:')}    obs-stack`,
    '',
    `${theme.muted('Check pods:')}  kubectl get pods -n observability`,
    `${theme.muted('Dashboards:')} kubectl port-forward svc/obs-stack-opensearch-dashboards 5601:5601 -n observability`,
    '',
  ], { color: 'primary', padding: 2 });
}

/**
 * Prompt the user to optionally create demo EKS services after stack creation.
 * Returns true if demo was created, false if skipped.
 */
export async function promptDemoAfterCreate(session) {
  console.error();
  const wantDemo = await eConfirm({
    message: 'Would you like to create demo EKS services?',
    default: false,
  });

  if (wantDemo === GoBack || !wantDemo) return false;

  console.error();
  printInfo('Setting up demo services with default configuration...');
  console.error();

  const clusterName = await eInput({
    message: 'EKS cluster name',
    default: DEMO_DEFAULTS.clusterName,
    validate: (v) => v.trim().length > 0 || 'Cluster name is required',
  });
  if (clusterName === GoBack) return false;

  const instanceType = await eInput({
    message: 'Node instance type',
    default: DEMO_DEFAULTS.instanceType,
  });
  if (instanceType === GoBack) return false;

  const nodeCountStr = await eInput({
    message: 'Number of nodes',
    default: String(DEMO_DEFAULTS.nodeCount),
    validate: (v) => /^\d+$/.test(v.trim()) && Number(v) >= 1 || 'Must be a positive integer',
  });
  if (nodeCountStr === GoBack) return false;
  const nodeCount = Number(nodeCountStr);

  console.error();
  checkDemoPrerequisites();
  await createEksCluster({ clusterName, region: session.region, nodeCount, instanceType });
  console.error();
  await installHelmChart({});
  console.error();

  printInfo(`Demo services deployed. Check: kubectl get pods -n observability`);
  return true;
}
