import { input } from '@inquirer/prompts';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import {
  printBanner, printDivider, printError, printInfo,
  theme, GoBack, eSelect,
} from './ui.mjs';
import { COMMANDS, COMMAND_CHOICES } from './commands/index.mjs';

/**
 * Initialize session — prompt for region and verify AWS credentials.
 */
async function initSession() {
  const envRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const region = envRegion || await input({
    message: 'AWS region',
    default: 'us-east-1',
    validate: (v) => /^[a-z]{2}-[a-z]+-\d+$/.test(v) || 'Expected format: us-east-1',
  });

  const sts = new STSClient({ region });
  let identity;
  try {
    identity = await sts.send(new GetCallerIdentityCommand({}));
  } catch (err) {
    printError('AWS credentials are not configured or have expired');
    printInfo('Run "aws configure" or "aws sso login" to set up credentials, then restart.');
    printInfo('See documentation: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html#getting-started-quickstart-new-command.');
    throw err;
  }

  return { region, accountId: identity.Account, arn: identity.Arn };
}

/**
 * Start the interactive REPL loop.
 */
export async function startRepl() {
  let session;
  try {
    session = await initSession();
  } catch {
    process.exit(1);
  }

  process.stderr.write('\x1B[2J\x1B[H');
  printBanner({ account: session.accountId, region: session.region, arn: session.arn });

  console.error();

  while (true) {
    const cmd = await eSelect({
      message: theme.primary(`obs-stack [${session.region}]`),
      choices: COMMAND_CHOICES,
      clearPromptOnDone: true,
    });

    if (cmd === GoBack || cmd === 'quit') break;

    const result = await COMMANDS[cmd](session);
    printDivider();
    console.error();
    if (result === GoBack) continue;
  }

  console.error();
  console.error(`  ${theme.muted('Goodbye.')}`);
  console.error();
}
