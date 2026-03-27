import { runCreate } from './create.mjs';
import { runList } from './list.mjs';
import { runDescribe } from './describe.mjs';
import { runUpdate } from './update.mjs';
import { runHelp } from './help.mjs';
import { listPipelines } from '../aws.mjs';
import { createSpinner, theme } from '../ui.mjs';

/**
 * Load pipelines with a spinner. Shared by describe, list, and update commands.
 */
export async function loadPipelines(region) {
  const spinner = createSpinner('Loading pipelines...');
  spinner.start();
  try {
    const pipelines = await listPipelines(region);
    spinner.succeed(`${pipelines.length} pipeline${pipelines.length !== 1 ? 's' : ''} found`);
    return pipelines;
  } catch (err) {
    spinner.fail('Failed to list pipelines');
    throw err;
  }
}

export const COMMANDS = {
  create: runCreate,
  list: runList,
  describe: runDescribe,
  update: runUpdate,
  help: runHelp,
};

export const COMMAND_CHOICES = [
  { name: `\u2728 Create    ${theme.muted('Create a new OSI pipeline')}`, value: 'create' },
  { name: `\u2630  List      ${theme.muted('List existing pipelines')}`, value: 'list' },
  { name: `\uD83D\uDD0D Describe  ${theme.muted('Show details of a pipeline')}`, value: 'describe' },
  { name: `\u270E  Update    ${theme.muted('Update a pipeline')}`, value: 'update' },
  { name: `\u2753 Help      ${theme.muted('Show available commands')}`, value: 'help' },
  { name: `\uD83D\uDEAA Quit      ${theme.muted('Exit')}`, value: 'quit' },
];
