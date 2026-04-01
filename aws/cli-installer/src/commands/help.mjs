import { printBox, printKeyHint, theme } from '../ui.mjs';

export async function runHelp() {
  console.error();
  const lines = [
    '',
    `${theme.accentBold('create')}      Create a new observability stack`,
    `${theme.accentBold('list')}        List existing stacks`,
    `${theme.accentBold('describe')}    Show details of a stack`,
    `${theme.accentBold('help')}        Show this help message`,
    `${theme.accentBold('quit')}        Exit Open Stack`,
    '',
  ];
  printBox(lines, { title: 'Commands', color: 'dim', padding: 2 });
  console.error();
  printKeyHint([['Ctrl+C', 'exit']]);
  console.error();
}
