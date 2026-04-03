import chalk from 'chalk';
import ora from 'ora';
import readline from 'node:readline';
import { search, input, confirm } from '@inquirer/prompts';

// ── Theme colors ─────────────────────────────────────────────────────────────

export const theme = {
  primary: chalk.hex('#B07FFF'),       // soft purple (like Claude)
  primaryBold: chalk.hex('#B07FFF').bold,
  accent: chalk.hex('#6EC8F5'),        // light blue
  accentBold: chalk.hex('#6EC8F5').bold,
  success: chalk.hex('#6BCB77'),       // soft green
  error: chalk.hex('#FF6B6B'),         // soft red
  warn: chalk.hex('#FFD93D'),          // soft yellow
  muted: chalk.dim,
  mutedItalic: chalk.dim.italic,
  label: chalk.bold,
  highlight: chalk.hex('#E0C3FF'),     // light purple
};

// ── Symbols ──────────────────────────────────────────────────────────────────

export const CHECK = '\u2713';
export const CROSS = '\u2717';
export const ARROW = '\u25B6'; // ▶
export const STAR = '\u2605';
export const DOT = '\u2022';
export const DIAMOND = '\u25C6';

// Box-drawing characters
const DIVIDER = Symbol('divider');

const BOX = {
  tl: '\u256D', tr: '\u256E', bl: '\u2570', br: '\u256F', // rounded corners
  h: '\u2500', v: '\u2502', lT: '\u251C', rT: '\u2524',
  ltee: '\u251C', rtee: '\u2524',
};

// ── OSC 8 clickable hyperlinks ───────────────────────────────────────────────

/** Wrap text in an OSC 8 hyperlink escape sequence (clickable in supported terminals). */
export function link(url, text) {
  return `\x1B]8;;${url}\x07${text ?? url}\x1B]8;;\x07`;
}

// ── Box-drawing primitives ───────────────────────────────────────────────────

/**
 * Render a box with rounded corners around lines of text.
 * @param {string[]} lines - Lines to display inside the box
 * @param {Object} [opts]
 * @param {number}  [opts.width]   - Fixed inner width (auto-detected if omitted)
 * @param {string}  [opts.color]   - Chalk method to apply to border (e.g. 'dim')
 * @param {string}  [opts.title]   - Optional title in the top border
 * @param {number}  [opts.padding] - Left padding inside the box (default 1)
 */
export function renderBox(lines, opts = {}) {
  const pad = opts.padding ?? 1;
  const sp = ' '.repeat(pad);

  // Strip ANSI (SGR + OSC 8 hyperlinks) for width calculation
  const stripAnsi = (s) => s.replace(/\x1B\][^\x07]*\x07|\x1B\[[0-9;]*m/g, '');
  const innerWidth = opts.width || Math.max(...lines.filter((l) => typeof l === 'string').map((l) => stripAnsi(l).length)) + pad * 2;

  const colorFn = opts.color === 'dim' ? chalk.dim
    : opts.color === 'primary' ? theme.primary
    : opts.color === 'accent' ? theme.accent
    : chalk.dim;

  let topBorder;
  if (opts.title) {
    const titleStr = ` ${opts.title} `;
    const titleLen = stripAnsi(titleStr).length;
    const remaining = innerWidth - titleLen - 1;
    topBorder = colorFn(BOX.tl + BOX.h) + theme.primaryBold(titleStr) + colorFn(BOX.h.repeat(Math.max(0, remaining)) + BOX.tr);
  } else {
    topBorder = colorFn(BOX.tl + BOX.h.repeat(innerWidth) + BOX.tr);
  }

  const bottomBorder = colorFn(BOX.bl + BOX.h.repeat(innerWidth) + BOX.br);

  const boxLines = [topBorder];
  for (const line of lines) {
    if (line === DIVIDER) {
      boxLines.push(colorFn(BOX.lT + BOX.h.repeat(innerWidth) + BOX.rT));
      continue;
    }
    const visLen = stripAnsi(line).length;
    const rightPad = Math.max(0, innerWidth - pad * 2 - visLen);
    boxLines.push(colorFn(BOX.v) + sp + line + ' '.repeat(rightPad) + sp + colorFn(BOX.v));
  }
  boxLines.push(bottomBorder);

  return boxLines;
}

/**
 * Print a box to stderr.
 */
export function printBox(lines, opts = {}) {
  const indent = opts.indent ?? 2;
  const prefix = ' '.repeat(indent);
  for (const l of renderBox(lines, opts)) {
    console.error(prefix + l);
  }
}

/**
 * Print a key-value panel inside a box.
 * @param {string} title - Panel title
 * @param {Array<[string, string]>} entries - [label, value] pairs; empty label = blank line
 */
export function printPanel(title, entries) {
  const stripAnsi = (s) => s.replace(/\x1B\][^\x07]*\x07|\x1B\[[0-9;]*m/g, '');

  // Split entries into sections (separated by blank lines or header-only rows)
  const sections = [];
  let cur = [];
  for (const [label, value] of entries) {
    if ((!label && !value) || (!label && value)) {
      if (cur.length) sections.push(cur);
      cur = [];
      sections.push([[label, value]]);
    } else {
      cur.push([label, value]);
    }
  }
  if (cur.length) sections.push(cur);

  const lines = [];
  for (const section of sections) {
    if (section.length === 1 && !section[0][0]) {
      const [, value] = section[0];
      lines.push(value || '');
      continue;
    }
    const maxLen = Math.max(...section.map(([l]) => stripAnsi(l).length));
    for (const [label, value] of section) {
      const padded = label + ' '.repeat(maxLen - stripAnsi(label).length);
      lines.push(`${theme.muted(padded)}  ${value}`);
    }
  }
  printBox(lines, { title, color: 'dim', padding: 1 });
}

// ── Print helpers — all write to stderr so stdout stays clean for YAML ───────

export function printHeader() {
  console.error();
  const banner = [
    '',
    `${theme.primaryBold('Open Stack CLI')}`,
    `${theme.muted('Create and manage your observability stack on AWS')}`,
    '',
  ];
  printBox(banner, { color: 'primary', padding: 2 });
  console.error();
}

export function printStep(msg) {
  console.error();
  console.error(`  ${theme.primary(DIAMOND)} ${theme.primaryBold(msg)}`);
}

export function printSubStep(msg) {
  console.error(`    ${theme.muted(DOT)} ${msg}`);
}

export function printSuccess(msg) {
  console.error(`  ${theme.success(CHECK)} ${msg}`);
}

export function printError(msg) {
  console.error(`  ${theme.error(CROSS)} ${msg}`);
}

export function printWarning(msg) {
  console.error(`  ${theme.warn('!')} ${msg}`);
}

export function printInfo(msg) {
  console.error(`    ${theme.muted(msg)}`);
}

// Spinner — wraps ora for consistent styling
export function createSpinner(text) {
  return ora({ text, stream: process.stderr, spinner: 'dots', color: 'magenta', indent: 2 });
}

// ── Key hints ────────────────────────────────────────────────────────────────

export function printKeyHint(hints) {
  // hints: array of [key, description] e.g. [['Ctrl+C', 'cancel'], ['Enter', 'select']]
  const parts = hints.map(([key, desc]) =>
    `${theme.muted('[')}${theme.accent(key)}${theme.muted(']')} ${theme.muted(desc)}`
  );
  console.error(`  ${parts.join('  ')}`);
}

/**
 * Returns a keysHelpTip theme function for @inquirer/select that appends
 * extra key hints (e.g. Esc, Ctrl+C) to the default navigation line.
 */
export function formatKeysHelpTip(extraHints) {
  const extra = extraHints.map(([key, desc]) =>
    `${theme.accent(key)} ${theme.muted(desc)}`
  ).join(theme.muted(' \u2022 '));
  return (keys) => {
    const base = keys.map(([key, action]) =>
      `${theme.accent(key)} ${theme.muted(action)}`
    ).join(theme.muted(' \u2022 '));
    return `${base} ${theme.muted('\u2022')} ${extra}`;
  };
}

// ── Shared escape-wrapped prompts ────────────────────────────────────────────

const _promptPrefix = { idle: '  ?', done: '  ✔', canceled: '  ✖' };

const _selectKeyTheme = {
  prefix: _promptPrefix,
  style: { keysHelpTip: formatKeysHelpTip([['Esc', 'back']]) },
};

export const eInput = withEscape(input);
export const eConfirm = withEscape(confirm);

// ── Searchable select ───────────────────────────────────────────────────────

/**
 * Select prompt with built-in incremental search and Escape-to-go-back.
 * Type to filter, arrow keys to navigate, Enter to select, Esc to go back.
 */
export function eSelect(opts) {
  if (!_keypressInit && process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    _keypressInit = true;
  }

  const searchableChoices = (opts.choices || []).filter((c) => c.type !== 'separator' && !c.disabled);

  const promise = search({
    message: opts.message || 'Select',
    theme: _selectKeyTheme,
    source: (term) => {
      if (!term) return searchableChoices;
      const lower = term.toLowerCase();
      return searchableChoices.filter((c) => {
        const name = (c.name || String(c.value || '')).toLowerCase();
        return name.includes(lower);
      });
    },
  });

  // Intercept tab at emit level to prevent search prompt's autocomplete
  const origEmit = process.stdin.emit;
  process.stdin.emit = function (event, ...args) {
    if (event === 'keypress' && args[1]?.name === 'tab') return true;
    return origEmit.apply(this, [event, ...args]);
  };

  let escaped = false;
  const onKeypress = (_ch, key) => {
    if (key?.name === 'escape') {
      escaped = true;
      promise.cancel();
    }
  };

  process.stdin.on('keypress', onKeypress);

  const cleanup = () => {
    process.stdin.removeListener('keypress', onKeypress);
    process.stdin.emit = origEmit;
  };

  return promise.then(
    (val) => { cleanup(); return val; },
    (err) => {
      cleanup();
      if (escaped) return GoBack;
      if (err.name === 'ExitPromptError') {
        console.error();
        console.error(`  ${theme.muted('Goodbye.')}`);
        console.error();
        process.exit(0);
      }
      throw err;
    },
  );
}

// ── Pipeline status colorizer ────────────────────────────────────────────────

const STATUS_COLORS = {
  ACTIVE: theme.success,
  CREATING: theme.warn,
  UPDATING: theme.warn,
  DELETING: theme.warn,
  CREATE_FAILED: theme.error,
  UPDATE_FAILED: theme.error,
  STARTING: theme.accent,
  STOPPING: theme.accent,
  STOPPED: theme.muted,
};

export function colorStatus(status) {
  const fn = STATUS_COLORS[status] || chalk.white;
  return fn(status);
}

// ── Date formatter ───────────────────────────────────────────────────────────

export function formatDate(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── REPL banner ──────────────────────────────────────────────────────────────

export function printBanner(session) {
  console.error();
  const lines = [
    `${theme.muted('OpenTelemetry-native observability for services, infrastructure, and AI agents.')}`,
    `${theme.muted('Collect and analyze traces, logs, metrics, service maps, and agent execution graphs.')}`,
    '',
    `${theme.muted('This installer provisions the following AWS resources:')}`,
    `${theme.muted('  • OpenSearch Ingestion pipeline')}`,
    `${theme.muted('  • Amazon Managed Prometheus workspace')}`,
    `${theme.muted('  • OpenSearch, OpenSearch UI with connected data sources')}`,
    `${theme.muted('  • IAM roles and access control policies')}`,
  ];
  printBox(lines, { title: 'Open Stack', color: 'primary', padding: 2 });
  if (session) {
    const sessionLines = [
      `${theme.muted('Account')}  ${session.account}`,
      `${theme.muted('Region')}   ${session.region}`,
      `${theme.muted('Identity')} ${theme.muted(session.arn)}`,
    ];
    printBox(sessionLines, { title: 'Session', color: 'primary', padding: 2 });
  }
}

// ── Horizontal divider ──────────────────────────────────────────────────────

export function printDivider() {
  console.error(`  ${theme.muted(BOX.h.repeat(60))}`);
}

// ── Terminal cursor helpers ──────────────────────────────────────────────────

/** Save cursor position (DEC private mode). */
export function saveCursor() { process.stderr.write('\x1B7'); }

/** Restore saved cursor position and erase everything below it. */
export function clearFromCursor() { process.stderr.write('\x1B8\x1B[J'); }

// ── Escape-to-go-back prompt wrapper ────────────────────────────────────────

export const GoBack = Symbol('GoBack');

let _keypressInit = false;

/**
 * Wrap an @inquirer/prompts function so that pressing Escape cancels
 * the prompt and returns the GoBack sentinel instead of throwing.
 * @param {Function} promptFn
 */
export function withEscape(promptFn) {
  return (opts, ...rest) => {
    if (!_keypressInit && process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      _keypressInit = true;
    }

    opts = { ...opts, theme: { ...opts?.theme, prefix: _promptPrefix } };
    const promise = promptFn(opts, ...rest);
    let escaped = false;

    const onKeypress = (_ch, key) => {
      if (key?.name === 'escape') {
        escaped = true;
        promise.cancel();
      }
    };

    process.stdin.on('keypress', onKeypress);

    return promise.then(
      (val) => { process.stdin.removeListener('keypress', onKeypress); return val; },
      (err) => {
        process.stdin.removeListener('keypress', onKeypress);
        if (escaped) return GoBack;
        // Ctrl+C → exit immediately
        if (err.name === 'ExitPromptError') {
          console.error();
          console.error(`  ${theme.muted('Goodbye.')}`);
          console.error();
          process.exit(0);
        }
        throw err;
      },
    );
  };
}

// ── Table formatter with box borders ─────────────────────────────────────────

export function printTable(headers, rows) {
  if (rows.length === 0) return;

  const stripAnsi = (s) => String(s).replace(/\x1B\][^\x07]*\x07|\x1B\[[0-9;]*m/g, '');

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => stripAnsi(r[i] ?? '').length))
  );

  const totalWidth = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * 3;

  // Top border
  console.error(`  ${theme.muted(BOX.tl + BOX.h.repeat(totalWidth + 2) + BOX.tr)}`);

  // Header
  const headerLine = headers
    .map((h, i) => theme.accentBold(h.padEnd(widths[i])))
    .join(theme.muted(' ' + BOX.v + ' '));
  console.error(`  ${theme.muted(BOX.v)} ${headerLine} ${theme.muted(BOX.v)}`);

  // Separator
  const sep = widths.map((w) => BOX.h.repeat(w)).join(BOX.h + BOX.h + BOX.h);
  console.error(`  ${theme.muted(BOX.ltee + sep + BOX.h + BOX.h + BOX.rtee)}`);

  // Rows
  for (const row of rows) {
    const line = row
      .map((cell, i) => {
        const s = String(cell ?? '');
        const pad = widths[i] - stripAnsi(s).length;
        return s + ' '.repeat(Math.max(0, pad));
      })
      .join(theme.muted(' ' + BOX.v + ' '));
    console.error(`  ${theme.muted(BOX.v)} ${line} ${theme.muted(BOX.v)}`);
  }

  // Bottom border
  console.error(`  ${theme.muted(BOX.bl + BOX.h.repeat(totalWidth + 2) + BOX.br)}`);
  console.error();
}
