import { runCreateWizard } from '../interactive.mjs';
import { applySimpleDefaults, validateConfig, fillDryRunPlaceholders } from '../cli.mjs';
import { renderPipeline } from '../render.mjs';
import { executePipeline } from '../main.mjs';
import { printError, printSuccess, printDivider, theme } from '../ui.mjs';
import { writeFileSync } from 'node:fs';

export async function runCreate(session) {
  console.error();
  printDivider();

  const cfg = await runCreateWizard(session);

  // Apply simple-mode defaults
  if (!cfg.mode) cfg.mode = 'simple';
  if (cfg.mode === 'simple') applySimpleDefaults(cfg);

  // Validate
  const errors = validateConfig(cfg);
  if (errors.length) {
    for (const e of errors) printError(e);
    return;
  }

  // Dry-run path
  if (cfg.dryRun) {
    fillDryRunPlaceholders(cfg);
    const yaml = renderPipeline(cfg);

    if (cfg.outputFile) {
      writeFileSync(cfg.outputFile, yaml + '\n');
      printSuccess(`Pipeline YAML written to ${cfg.outputFile}`);
    } else {
      console.error(`  ${theme.muted('\u2500'.repeat(43))}`);
      process.stdout.write(yaml);
    }
    console.error();
    return;
  }

  // Live path
  await executePipeline(cfg);
}
