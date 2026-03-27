import { select, input } from '@inquirer/prompts';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import {
  printBanner, printError, printInfo,
  printKeyHint, printPanel, theme,
} from './ui.mjs';
import { COMMANDS, COMMAND_CHOICES } from './commands/index.mjs';

/**
 * Initialize session — prompt for region and verify AWS credentials.
 */
async function initSession() {
  const region = await input({
    message: 'AWS region',
    default: 'us-east-1',
    validate: (v) => /^[a-z]{2}-[a-z]+-\d+$/.test(v) || 'Expected format: us-east-1',
  });

  console.error();
  const sts = new STSClient({ region });
  let identity;
  try {
    identity = await sts.send(new GetCallerIdentityCommand({}));
  } catch (err) {
    printError('AWS credentials are not configured or have expired');
    printInfo(err.message);
    printInfo('Run "aws configure" or "aws sso login" to set up credentials, then restart.');
    throw err;
  }

  printPanel('Session', [
    ['Account', identity.Account],
    ['Region', region],
    ['Identity', theme.muted(identity.Arn)],
  ]);

  return { region, accountId: identity.Account };
}

/**
 * Start the interactive REPL loop.
 */
export async function startRepl() {
  printBanner();

  let session;
  try {
    session = await initSession();
  } catch {
    process.exit(1);
  }

  console.error();
  printKeyHint([['Enter', 'select'], ['Esc', 'back'], ['Ctrl+C', 'exit']]);
  console.error();

  while (true) {
    let cmd;
    try {
      cmd = await select({
        message: theme.primary(`osi-pipeline [${session.region}]`),
        choices: COMMAND_CHOICES,
      });
    } catch (err) {
      // Ctrl+C at the menu level → exit
      if (err.name === 'ExitPromptError') break;
      throw err;
    }

    if (cmd === 'quit') break;

    try {
      await COMMANDS[cmd](session);
    } catch (err) {
      if (err.name === 'ExitPromptError') {
        // Ctrl+C during a command → return to menu
        console.error();
        printInfo('Cancelled.');
        console.error();
        continue;
      }
      console.error();
      printError(err.message);
      console.error();
    }
  }

  console.error();
  console.error(`  ${theme.muted('Goodbye.')}`);
  console.error();
}
