import chalk from 'chalk';
import ora from 'ora';
import readline from 'node:readline';
import { select, input, confirm } from '@inquirer/prompts';

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

  // Strip ANSI for width calculation
  const stripAnsi = (s) => s.replace(/\x1B\[[0-9;]*m/g, '');
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
  const lines = [];
  for (const [label, value] of entries) {
    if (!label && !value) {
      lines.push('');
    } else if (!label) {
      lines.push(value);
    } else {
      lines.push(`${theme.muted(label)}  ${value}`);
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
  style: { keysHelpTip: formatKeysHelpTip([['/', 'search'], ['Esc', 'back']]) },
  keybindings: ['vim'],
};

export const eInput = withEscape(input);
export const eConfirm = withEscape(confirm);

// ── Searchable select ───────────────────────────────────────────────────────

const _SearchMode = Symbol('SearchMode');

/**
 * Wrap select so Escape → GoBack and '/' → SearchMode.
 */
function _selectWithEscapeAndSearch(opts) {
  if (!_keypressInit && process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    _keypressInit = true;
  }

  const promise = select(opts);
  let escaped = false;
  let search = false;

  const onKeypress = (_ch, key) => {
    if (key?.name === 'escape') {
      escaped = true;
      promise.cancel();
    } else if (key?.sequence === '/') {
      search = true;
      promise.cancel();
    }
  };

  process.stdin.on('keypress', onKeypress);

  return promise.then(
    (val) => { process.stdin.removeListener('keypress', onKeypress); return val; },
    (err) => {
      process.stdin.removeListener('keypress', onKeypress);
      if (escaped) return GoBack;
      if (search) return _SearchMode;
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

/**
 * Select prompt with vim navigation, Escape-to-go-back, and '/' search.
 * Pressing '/' opens a search input; the matching choice becomes pre-selected.
 */
export async function eSelect(opts) {
  const fullOpts = { loop: false, theme: _selectKeyTheme, ...opts };
  let defaultValue = fullOpts.default;

  while (true) {
    const result = await _selectWithEscapeAndSearch({ ...fullOpts, default: defaultValue });

    if (result === GoBack) return GoBack;

    if (result === _SearchMode) {
      const term = await eInput({
        message: theme.accent('/'),
        theme: { prefix: _promptPrefix },
      });
      if (term === GoBack || !term) continue;

      const lower = term.toLowerCase();
      const match = fullOpts.choices.find((c) => {
        if (c.type === 'separator' || c.disabled) return false;
        const name = (c.name || String(c.value || '')).toLowerCase();
        return name.includes(lower);
      });

      if (match) defaultValue = match.value;
      continue;
    }

    return result;
  }
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
    `${theme.muted('Create and manage your observability stack on AWS')}`,
  ];
  if (session) {
    lines.push(DIVIDER);
    lines.push(`${theme.muted('Account')}  ${session.account}`);
    lines.push(`${theme.muted('Region')}   ${session.region}`);
    lines.push(`${theme.muted('Identity')} ${theme.muted(session.arn)}`);
  }
  printBox(lines, { title: 'Open Stack', color: 'primary', padding: 2 });
}

// ── Horizontal divider ──────────────────────────────────────────────────────

export function printDivider() {
  console.error(`  ${theme.muted(BOX.h.repeat(60))}`);
}

// ── Escape-to-go-back prompt wrapper ────────────────────────────────────────

export const GoBack = Symbol('GoBack');

let _keypressInit = false;

/**
 * Wrap an @inquirer/prompts function so that pressing Escape cancels
 * the prompt and returns the GoBack sentinel instead of throwing.
 * @param {Function} promptFn
 */
export function withEscape(promptFn) {
  return (...args) => {
    if (!_keypressInit && process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      _keypressInit = true;
    }

    const promise = promptFn(...args);
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

  const stripAnsi = (s) => String(s).replace(/\x1B\[[0-9;]*m/g, '');

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
