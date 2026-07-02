// Tiny zero-dependency ANSI color helper.
// Respects NO_COLOR (https://no-color.org/), FORCE_COLOR, and TTY detection.

const useColor = (() => {
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== '') return false;
  if (process.env.FORCE_COLOR != null && process.env.FORCE_COLOR !== '0') return true;
  return Boolean(process.stdout && process.stdout.isTTY);
})();

function wrap(open, close) {
  return (str) => (useColor ? `[${open}m${str}[${close}m` : String(str));
}

export const colors = {
  enabled: useColor,
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

// Status glyphs used across the report.
export const glyph = {
  ok: colors.green('✓'), // ✓
  warn: colors.yellow('⚠'), // ⚠
  err: colors.red('✗'), // ✗
  info: colors.blue('ℹ'), // ℹ
};
