import { runCreateWizard } from '../interactive.mjs';
import { applySimpleDefaults, validateConfig, fillDryRunPlaceholders } from '../cli.mjs';
import { renderPipeline } from '../render.mjs';
import { executePipeline } from '../main.mjs';
import { promptDemoAfterCreate } from './demo.mjs';
import { printError, printStep, theme, GoBack, eConfirm } from '../ui.mjs';

// ── Architecture diagram ────────────────────────────────────────────────────

const strip = (s) => s.replace(/\x1B\[[0-9;]*m/g, '');

/**
 * Build a styled box. Returns { w, mid, inner, top, bot, botC, lines }.
 * All strings have correct visual width thanks to ANSI-aware padding.
 */
function box(texts, minInner = 0) {
  const m = theme.muted;
  const inner = Math.max(minInner, ...texts.map((t) => strip(t).length + 2));
  const w = inner + 2;
  const mid = Math.floor(w / 2);

  const padLine = (t) => {
    const gap = inner - strip(t).length - 1;
    return m('│') + ' ' + t + ' '.repeat(Math.max(0, gap)) + m('│');
  };

  return {
    w, mid, inner,
    top:  m('┌' + '─'.repeat(inner) + '┐'),
    bot:  m('└' + '─'.repeat(inner) + '┘'),
    botC: m('└' + '─'.repeat(mid - 1) + '┬' + '─'.repeat(inner - mid) + '┘'),
    lines: texts.map(padLine),
  };
}

/** Build a horizontal connector line in a char array, then wrap with muted style. */
function hline(width, from, to, specs) {
  const arr = Array(width).fill(' ');
  for (let i = from; i <= to; i++) arr[i] = '─';
  for (const [pos, ch] of specs) if (pos >= 0 && pos < width) arr[pos] = ch;
  return theme.muted(arr.join('').trimEnd());
}

/** Place single characters at given positions, everything else is a space. */
function connector(width, specs) {
  const arr = Array(width).fill(' ');
  for (const [pos, ch] of specs) if (pos >= 0 && pos < width) arr[pos] = ch;
  return theme.muted(arr.join('').trimEnd());
}

function renderArchitectureDiagram(cfg) {
  const osLabel = cfg.serverless ? 'OpenSearch Serverless' : 'OpenSearch';
  const pathLabel = `/${cfg.pipelineName}/v1/*`;
  const m = theme.muted;
  const a = theme.accent;
  const p = theme.primary;
  const h = theme.highlight;
  const sp = (n) => ' '.repeat(Math.max(0, n));

  // ── Define all boxes ──────────────────────────────────────────────────
  const otlp    = box([a('OTLP Endpoint'), m(pathLabel)], 21);
  const logs    = box([h('Logs')],    9);
  const traces  = box([h('Traces')],  9);
  const metrics = box([h('Metrics')], 9);
  const raw     = box([m('Raw'), m('Traces')],  9);
  const svc     = box([m('Service'), m('Map')], 9);
  const os      = box([p(osLabel), m('logs, traces, svc-map')]);
  const prom    = box([p('Prometheus'), m('metrics, svc-map')]);
  const dash    = box([p('OpenSearch UI'), m('Observability workspace')]);

  // ── Layout positions ──────────────────────────────────────────────────
  const sigGap  = 2;
  const subGap  = 1;
  const sinkGap = 1;

  // Signal row — three boxes side by side (column 0 origin)
  const C_LOGS    = logs.mid;
  const C_TRACES  = logs.w + sigGap + traces.mid;
  const C_METRICS = logs.w + sigGap + traces.w + sigGap + metrics.mid;
  const totalSigW = logs.w + sigGap + traces.w + sigGap + metrics.w;

  // Sub-stage row — centered under Traces
  const subTotalW = raw.w + subGap + svc.w;
  const subOff    = C_TRACES - Math.floor(subTotalW / 2);
  const C_RAW     = subOff + raw.mid;
  const C_SVC     = subOff + raw.w + subGap + svc.mid;

  // OTLP — centered above Traces column
  const otlpOff = Math.max(0, C_TRACES - otlp.mid);
  const C_OTLP  = otlpOff + otlp.mid;

  // Service-map split — symmetric fork, left into OS box, right into Prom box
  const C_SVC_L = C_SVC - 3;
  const C_SVC_R = C_SVC + 3;

  // Diagram width (widest row)
  const W = Math.max(totalSigW, os.w + sinkGap + prom.w);

  // ── Assemble lines ────────────────────────────────────────────────────
  const out = [''];

  // OTLP box
  out.push(sp(otlpOff) + otlp.top);
  for (const l of otlp.lines) out.push(sp(otlpOff) + l);
  out.push(sp(otlpOff) + otlp.botC);

  // Fan-out from OTLP to three signal columns
  out.push(hline(W, C_LOGS, C_METRICS, [
    [C_LOGS, '┌'], [C_OTLP, '┼'], [C_TRACES, C_TRACES === C_OTLP ? '┼' : '┬'], [C_METRICS, '┐'],
  ]));
  out.push(connector(W, [[C_LOGS, '▼'], [C_TRACES, '▼'], [C_METRICS, '▼']]));

  // Signal boxes
  out.push([logs, traces, metrics].map((b) => b.top).join(sp(sigGap)));
  const sigRows = Math.max(logs.lines.length, traces.lines.length, metrics.lines.length);
  for (let r = 0; r < sigRows; r++) {
    out.push([logs, traces, metrics].map((b) => b.lines[r] || sp(b.w)).join(sp(sigGap)));
  }
  out.push([logs, traces, metrics].map((b) => b.botC).join(sp(sigGap)));

  // Traces fans into Raw Traces + Service Map
  out.push(hline(W, C_RAW, C_SVC, [
    [C_LOGS, '│'], [C_RAW, '┌'], [C_TRACES, '┴'], [C_SVC, '┐'], [C_METRICS, '│'],
  ]));
  out.push(connector(W, [[C_LOGS, '│'], [C_RAW, '▼'], [C_SVC, '▼'], [C_METRICS, '│']]));

  // Sub-stage boxes with Logs/Metrics pipes on either side
  const subLine = (content) =>
    sp(C_LOGS) + m('│') + sp(subOff - C_LOGS - 1) + content + sp(C_METRICS - subOff - subTotalW) + m('│');

  out.push(subLine(raw.top  + sp(subGap) + svc.top));
  for (let r = 0; r < Math.max(raw.lines.length, svc.lines.length); r++) {
    out.push(subLine((raw.lines[r] || sp(raw.w)) + sp(subGap) + (svc.lines[r] || sp(svc.w))));
  }
  out.push(subLine(raw.botC + sp(subGap) + svc.botC));

  // Service-map split + merge toward sinks
  out.push(hline(W, C_SVC_L, C_SVC_R, [
    [C_LOGS, '│'], [C_RAW, '│'], [C_SVC_L, '┌'], [C_SVC, '┴'], [C_SVC_R, '┐'], [C_METRICS, '│'],
  ]));
  out.push(connector(W, [
    [C_LOGS, '▼'], [C_RAW, '▼'], [C_SVC_L, '▼'], [C_SVC_R, '▼'], [C_METRICS, '▼'],
  ]));

  // Sink boxes
  out.push(os.top  + sp(sinkGap) + prom.top);
  for (let r = 0; r < Math.max(os.lines.length, prom.lines.length); r++) {
    out.push((os.lines[r] || sp(os.w)) + sp(sinkGap) + (prom.lines[r] || sp(prom.w)));
  }
  out.push(os.botC + sp(sinkGap) + prom.bot);

  // Arrow from OpenSearch to Dashboards
  out.push(connector(os.w, [[os.mid, '│']]));
  out.push(connector(os.w, [[os.mid, '▼']]));

  // Dashboards box
  out.push(dash.top);
  for (const l of dash.lines) out.push(l);
  out.push(dash.bot);
  out.push('');

  return out;
}

export async function runCreate(session) {
  console.error();
  const cfg = await runCreateWizard(session);
  if (cfg === GoBack) return GoBack;

  // Apply simple-mode defaults
  if (!cfg.mode) cfg.mode = 'simple';
  if (cfg.mode === 'simple') applySimpleDefaults(cfg);

  // Validate
  const errors = validateConfig(cfg);
  if (errors.length) {
    for (const e of errors) printError(e);
    return;
  }

  // ── Show architecture diagram ──────────────────────────────────────────
  printStep('Architecture');
  const diagram = renderArchitectureDiagram(cfg);
  for (const line of diagram) console.error(`  ${line}`);

  // ── Show pipeline config preview (top-level keys only) ────────────────
  printStep('Pipeline config preview');
  console.error();

  const previewCfg = { ...cfg };
  fillDryRunPlaceholders(previewCfg);
  const yaml = renderPipeline(previewCfg);

  for (const line of yaml.split('\n')) {
    // Show only top-level keys (no leading whitespace) and comments before them
    if (line.startsWith('#')) {
      console.error(`    ${theme.muted(line)}`);
    } else if (/^\S/.test(line) && line.includes(':')) {
      const match = line.match(/^([\w-]+)(:.*)/);
      if (match) {
        console.error(`    ${theme.accent(match[1])}${theme.muted(match[2])}`);
      }
    } else if (line.trim() === '') {
      console.error();
    }
  }

  // ── Confirm to proceed ─────────────────────────────────────────────────
  console.error();
  const proceed = await eConfirm({
    message: 'Create these resources and deploy the stack?',
    default: true,
  });
  if (proceed === GoBack || !proceed) {
    console.error(`  ${theme.muted('Cancelled.')}`);
    console.error();
    return;
  }

  // Live path
  await executePipeline(cfg);

  // Offer to create demo EKS services
  try {
    await promptDemoAfterCreate(session);
  } catch (err) {
    // Demo is optional — don't fail the create flow
    console.error(`  ${theme.muted(`Demo setup skipped: ${err.message}`)}`);
  }
}
