import { printTable, printInfo, colorStatus, formatDate } from '../ui.mjs';
import { loadPipelines } from './index.mjs';

export async function runList(session) {
  console.error();

  const pipelines = await loadPipelines(session.region);

  if (pipelines.length === 0) {
    printInfo('No OSI pipelines found in this region.');
    console.error();
    return;
  }

  console.error();
  const headers = ['Name', 'Status', 'OCUs', 'Created', 'Updated'];
  const rows = pipelines.map((p) => [
    p.name,
    colorStatus(p.status),
    `${p.minUnits}\u2013${p.maxUnits}`,
    formatDate(p.createdAt),
    formatDate(p.lastUpdatedAt),
  ]);

  printTable(headers, rows);
}
