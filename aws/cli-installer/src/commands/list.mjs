import { printTable, printInfo, theme } from '../ui.mjs';
import { loadStacks } from './index.mjs';

export async function runList(session) {
  console.error();

  const stacks = await loadStacks(session.region);

  if (stacks.length === 0) {
    printInfo('No open-stack stacks found in this region.');
    console.error();
    return;
  }

  console.error();
  const headers = ['Stack', 'Resources', 'Types'];
  const rows = stacks.map((s) => {
    const types = [...new Set(s.resources.map((r) => r.type))];
    return [
      s.name,
      String(s.resources.length),
      types.join(theme.muted(', ')),
    ];
  });

  printTable(headers, rows);
}
