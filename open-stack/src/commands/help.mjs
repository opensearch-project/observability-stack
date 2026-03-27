import { printBox, printKeyHint, theme } from '../ui.mjs';

export async function runHelp() {
  console.error();
  const lines = [
    '',
    `${theme.accentBold('create')}      Create a new OSI pipeline (interactive wizard)`,
    `${theme.accentBold('list')}        List existing OSI pipelines`,
    `${theme.accentBold('describe')}    Show details of a specific pipeline`,
    `${theme.accentBold('update')}      Update an existing pipeline's settings`,
    `${theme.accentBold('help')}        Show this help message`,
    `${theme.accentBold('quit')}        Exit the pipeline manager`,
    '',
  ];
  printBox(lines, { title: 'Commands', color: 'dim', padding: 2 });
  console.error();
  printKeyHint([['Ctrl+C', 'cancel any operation and return to menu']]);
  console.error();
}
