import { getStackResources, arnToName, describeResource, enrichResourceNames } from '../aws.mjs';
import { printInfo, createSpinner, printPanel, theme, GoBack, eSelect } from '../ui.mjs';
import { loadStacks } from './index.mjs';

export async function runDescribe(session) {
  console.error();

  const stacks = await loadStacks(session.region);

  if (stacks.length === 0) {
    printInfo('No stacks found in this region.');
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
    await enrichResourceNames(session.region, resources);
    detailSpinner.succeed(`Stack: ${stackName} (${resources.length} resources)`);
  } catch (err) {
    detailSpinner.fail('Failed to get stack details');
    throw err;
  }

  const resName = (r) => r.displayName || arnToName(r.arn);

  // Resource selection loop
  while (true) {
    console.error();
    const resourceChoices = resources.map((r) => ({
      name: `${theme.accentBold(r.type)}  ${theme.muted(resName(r))}`,
      value: r,
    }));

    const selected = await eSelect({
      message: 'Select resource',
      choices: resourceChoices,
    });
    if (selected === GoBack) break;

    // Fetch and display resource details
    const resSpinner = createSpinner(`Loading ${selected.type}...`);
    resSpinner.start();

    let result;
    try {
      result = await describeResource(session.region, selected);
      resSpinner.succeed(`${selected.type}: ${resName(selected)}`);
    } catch (err) {
      resSpinner.fail(`Failed to describe ${selected.type}`);
      continue;
    }

    console.error();
    const panelEntries = result.entries.map(([label, value]) => [label, theme.muted(value)]);
    printPanel(resName(selected), panelEntries);

    if (result.rawConfig) {
      console.error();
      console.error(theme.muted(result.rawConfig));
    }
  }

  console.error();
}
