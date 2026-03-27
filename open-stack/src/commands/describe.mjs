import { getStackResources, arnToName } from '../aws.mjs';
import { printInfo, printPanel, createSpinner, theme, GoBack, eSelect } from '../ui.mjs';
import { loadStacks } from './index.mjs';

export async function runDescribe(session) {
  console.error();

  const stacks = await loadStacks(session.region);

  if (stacks.length === 0) {
    printInfo('No open-stack stacks found in this region.');
    console.error();
    return;
  }

  // Select a stack
  const choices = stacks.map((s) => ({
    name: `${s.name}  ${theme.muted(`(${s.resources.length} resources)`)}`,
    value: s.name,
  }));

  const stackName = await eSelect({
    message: 'Select stack',
    choices,
  });
  if (stackName === GoBack) return GoBack;

  // Fetch full resource list
  const detailSpinner = createSpinner(`Loading ${stackName}...`);
  detailSpinner.start();

  let resources;
  try {
    resources = await getStackResources(session.region, stackName);
    detailSpinner.succeed(`Stack: ${stackName} (${resources.length} resources)`);
  } catch (err) {
    detailSpinner.fail('Failed to get stack details');
    throw err;
  }

  // Group resources by type
  const grouped = new Map();
  for (const r of resources) {
    if (!grouped.has(r.type)) grouped.set(r.type, []);
    grouped.get(r.type).push(r);
  }

  // Display resources
  console.error();
  const entries = [];
  for (const [type, items] of grouped) {
    entries.push(['', theme.accentBold(type)]);
    for (const item of items) {
      entries.push([arnToName(item.arn), theme.muted(item.arn)]);
    }
    entries.push(['', '']);
  }

  printPanel(`${stackName}`, entries);
  console.error();
}
