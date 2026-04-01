import { runCreate } from './create.mjs';
import { runList } from './list.mjs';
import { runDescribe } from './describe.mjs';
import { listStacks } from '../aws.mjs';
import { createSpinner, theme } from '../ui.mjs';

/**
 * Load stacks with a spinner. Shared by describe and list commands.
 */
export async function loadStacks(region) {
  const spinner = createSpinner('Loading stacks...');
  spinner.start();
  try {
    const stacks = await listStacks(region);
    spinner.succeed(`${stacks.length} stack${stacks.length !== 1 ? 's' : ''} found`);
    return stacks;
  } catch (err) {
    spinner.fail('Failed to list stacks');
    throw err;
  }
}

export const COMMANDS = {
  create: runCreate,
  list: runList,
  describe: runDescribe,
};

export const COMMAND_CHOICES = [
  { name: `\u2728 Create    ${theme.muted('Create a new observability stack')}`, value: 'create' },
  { name: `\u2630 List      ${theme.muted('List existing stacks')}`, value: 'list' },
  { name: `\uD83D\uDD0D Describe  ${theme.muted('Show details of a stack')}`, value: 'describe' },
  { name: `\uD83D\uDEAA Quit      ${theme.muted('Exit')}`, value: 'quit' },
];
