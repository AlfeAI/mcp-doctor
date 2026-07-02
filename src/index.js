// Orchestrator: argument parsing, file loading, validation, output.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJsonc, JsonParseError } from './jsonlint.js';
import { validateConfig, runProbes, defaultProbe } from './validate.js';
import { renderReport, toJson } from './report.js';
import { autoDiscover, candidatePaths } from './discover.js';
import { colors } from './colors.js';

export const VERSION = '1.0.0';

const HELP = `
${colors.bold('mcp-doctor')} — diagnose Model Context Protocol config files

${colors.bold('Usage')}
  npx mcp-doctor [path] [options]

${colors.bold('Arguments')}
  path            Path to an MCP config file. If omitted, common host
                  locations are auto-discovered (Claude Desktop, Claude Code,
                  Cursor, VS Code, Windsurf, ./mcp.json, ...).

${colors.bold('Options')}
  --probe         Reachability-check remote (http/sse) server URLs.
  --json          Emit machine-readable JSON instead of a report.
  --list          List the config locations that are scanned, then exit.
  --no-color      Disable colored output (also honors NO_COLOR).
  -h, --help      Show this help.
  -v, --version   Show version.

${colors.bold('Exit codes')}
  0  no errors (warnings allowed)
  1  one or more errors found
  2  usage / file-not-found / parse error

Maintained by Alfe — https://alfe.ai
`;

function parseArgs(argv) {
  const opts = { probe: false, json: false, help: false, version: false, list: false, path: null };
  for (const arg of argv) {
    if (arg === '--probe') opts.probe = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--list') opts.list = true;
    else if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '-v' || arg === '--version') opts.version = true;
    else if (arg === '--no-color') {} // handled via env in colors.js at load
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else opts.path = arg;
  }
  return opts;
}

// Main entry. Returns a process exit code.
export async function main(argv, io = {}) {
  const out = io.out || ((s) => process.stdout.write(s + '\n'));
  const err = io.err || ((s) => process.stderr.write(s + '\n'));

  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    err(colors.red(e.message));
    err('Run `mcp-doctor --help` for usage.');
    return 2;
  }

  if (opts.help) {
    out(HELP);
    return 0;
  }
  if (opts.version) {
    out(VERSION);
    return 0;
  }
  if (opts.list) {
    out(colors.bold('Scanned MCP config locations:'));
    for (const c of candidatePaths()) {
      const mark = existsSync(c.path) ? colors.green('found ') : colors.gray('       ');
      out(`  ${mark} ${colors.gray(`[${c.host}]`)} ${c.path}`);
    }
    return 0;
  }

  // Resolve the target config.
  let target;
  if (opts.path) {
    const p = resolve(opts.path);
    if (!existsSync(p)) {
      err(colors.red(`File not found: ${p}`));
      return 2;
    }
    target = { host: 'file', path: p };
  } else {
    target = autoDiscover();
    if (!target) {
      err(colors.yellow('No MCP config file found in any known location.'));
      err('Pass an explicit path, or run `mcp-doctor --list` to see where it looks.');
      return 2;
    }
  }

  // Load + parse.
  let raw;
  try {
    raw = readFileSync(target.path, 'utf8');
  } catch (e) {
    err(colors.red(`Could not read ${target.path}: ${e.message}`));
    return 2;
  }

  let parsed;
  try {
    parsed = parseJsonc(raw);
  } catch (e) {
    if (e instanceof JsonParseError) {
      err(colors.red(`Invalid JSON in ${target.path}`));
      err(colors.red(`  ${e.message}`));
    } else {
      err(colors.red(`Failed to parse ${target.path}: ${e.message}`));
    }
    return 2;
  }

  // Validate.
  const result = validateConfig(parsed.value, {
    probe: opts.probe,
    env: process.env,
    duplicates: parsed.duplicates,
  });

  // Probe remote endpoints if requested.
  if (opts.probe) {
    await runProbes(result, (url) => defaultProbe(url));
  }

  // Output.
  if (opts.json) {
    out(toJson(result, target));
  } else {
    out(renderReport(result, target));
  }

  return result.counts.error > 0 ? 1 : 0;
}
