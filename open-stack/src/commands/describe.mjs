import { select } from '@inquirer/prompts';
import { getPipeline } from '../aws.mjs';
import { printInfo, printPanel, printBox, createSpinner, colorStatus, formatDate, theme } from '../ui.mjs';
import { loadPipelines } from './index.mjs';

export async function runDescribe(session) {
  console.error();

  const pipelines = await loadPipelines(session.region);

  if (pipelines.length === 0) {
    printInfo('No OSI pipelines found in this region.');
    console.error();
    return;
  }

  // Select a pipeline
  const choices = pipelines.map((p) => ({
    name: `${p.name}  ${theme.muted(`(${p.status})`)}`,
    value: p.name,
  }));

  const pipelineName = await select({
    message: 'Select pipeline',
    choices,
  });

  // Fetch full details
  const detailSpinner = createSpinner(`Loading ${pipelineName}...`);
  detailSpinner.start();

  let pipeline;
  try {
    pipeline = await getPipeline(session.region, pipelineName);
    detailSpinner.succeed(`Pipeline: ${pipelineName}`);
  } catch (err) {
    detailSpinner.fail('Failed to get pipeline details');
    throw err;
  }

  // Display details in a panel
  console.error();
  const entries = [
    ['Name', pipeline.name],
    ['ARN', theme.muted(pipeline.arn)],
    ['Status', colorStatus(pipeline.status)],
  ];
  if (pipeline.statusReason) {
    entries.push(['Status Reason', pipeline.statusReason]);
  }
  entries.push(
    ['Min OCUs', String(pipeline.minUnits)],
    ['Max OCUs', String(pipeline.maxUnits)],
    ['Created', formatDate(pipeline.createdAt)],
    ['Last Updated', formatDate(pipeline.lastUpdatedAt)],
  );
  printPanel(pipelineName, entries);

  if (pipeline.ingestEndpoints.length > 0) {
    console.error();
    const epLines = pipeline.ingestEndpoints.map((ep) => theme.accent(ep));
    printBox(['', ...epLines, ''], { title: 'Ingestion Endpoints', color: 'dim', padding: 2 });
  }

  if (pipeline.pipelineConfigurationBody) {
    console.error();
    const configLines = pipeline.pipelineConfigurationBody.split('\n').map((l) => theme.muted(l));
    printBox(['', ...configLines, ''], { title: 'Pipeline Configuration', color: 'dim', padding: 1 });
  }

  console.error();
}
