// Human-readable report rendering.
import { colors, glyph } from './colors.js';

function symbol(severity) {
  switch (severity) {
    case 'ok': return glyph.ok;
    case 'warn': return glyph.warn;
    case 'error': return glyph.err;
    default: return glyph.info;
  }
}

function line(severity, message, hint, indent = '   ') {
  let out = `${indent}${symbol(severity)} ${message}`;
  if (hint) out += colors.gray(`  — ${hint}`);
  return out;
}

// Render the full report to a string.
export function renderReport(result, meta = {}) {
  const lines = [];
  lines.push('');
  lines.push(colors.bold('mcp-doctor') + colors.gray(`  ·  ${meta.host || 'config'}`));
  if (meta.path) lines.push(colors.gray(meta.path));
  lines.push('');

  // Global (config-level) findings.
  if (result.global.length) {
    lines.push(colors.bold('Config'));
    for (const c of result.global) lines.push(line(c.severity, c.message, c.hint));
    lines.push('');
  }

  // Per-server findings.
  if (result.servers.length) {
    for (const server of result.servers) {
      const worst = serverSeverity(server);
      const tag = colors.gray(`[${server.transport}]`);
      lines.push(`${symbol(worst)} ${colors.bold(server.name)} ${tag}`);
      for (const c of server.checks) {
        if (c.severity === 'pending-probe') continue;
        lines.push(line(c.severity, c.message, c.hint));
      }
      lines.push('');
    }
  }

  // Summary line.
  const { ok, warn, error } = result.counts;
  const parts = [
    colors.green(`${ok} ok`),
    colors.yellow(`${warn} warning${warn === 1 ? '' : 's'}`),
    colors.red(`${error} error${error === 1 ? '' : 's'}`),
  ];
  const verdict = error > 0
    ? colors.red('FAIL')
    : warn > 0
      ? colors.yellow('OK with warnings')
      : colors.green('PASS');
  lines.push(colors.bold('Summary  ') + parts.join(colors.gray('  ·  ')) + colors.gray('  ·  ') + verdict);
  lines.push('');

  return lines.join('\n');
}

function serverSeverity(server) {
  if (server.checks.some((c) => c.severity === 'error')) return 'error';
  if (server.checks.some((c) => c.severity === 'warn')) return 'warn';
  return 'ok';
}

// Strip internal markers before JSON output.
export function toJson(result, meta = {}) {
  const clean = {
    host: meta.host,
    path: meta.path,
    ok: result.counts.error === 0,
    counts: result.counts,
    global: result.global,
    servers: result.servers.map((s) => ({
      name: s.name,
      transport: s.transport,
      checks: s.checks.filter((c) => c.severity !== 'pending-probe'),
    })),
  };
  return JSON.stringify(clean, null, 2);
}
