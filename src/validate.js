// Core validation logic. Pure functions that turn a parsed config into a
// structured list of findings. No I/O beyond PATH resolution and (optional)
// network probing, both injected so the core stays testable.
import { which } from './which.js';

// Known transport hints seen in the wild across MCP hosts.
const KNOWN_TYPES = new Set(['stdio', 'sse', 'http', 'streamable-http', 'streamableHttp']);

// Commands that are commonly used but must be installed separately.
const RUNNER_HINTS = {
  npx: 'ships with Node.js',
  node: 'ships with Node.js',
  uvx: 'install via https://docs.astral.sh/uv/',
  uv: 'install via https://docs.astral.sh/uv/',
  docker: 'install Docker Desktop / Engine',
  python: 'install Python 3',
  python3: 'install Python 3',
  bunx: 'install via https://bun.sh',
  deno: 'install via https://deno.land',
};

// severity: 'ok' | 'warn' | 'error'
function finding(severity, message, hint) {
  return hint ? { severity, message, hint } : { severity, message };
}

// Find `${VAR}` / `$VAR` references inside a string.
function envRefs(str) {
  if (typeof str !== 'string') return [];
  const refs = [];
  const re = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    refs.push(m[1] || m[2]);
  }
  return refs;
}

// Validate a single server entry. Returns { checks: [], transport }.
function validateServer(name, entry, opts) {
  const checks = [];
  const env = opts.env || {};

  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    checks.push(finding('error', 'Server entry must be an object'));
    return { checks, transport: 'invalid' };
  }

  const hasUrl = typeof entry.url === 'string' && entry.url.length > 0;
  const hasCommand = 'command' in entry;
  let transport = 'unknown';

  // Unknown transport type hint.
  if (entry.type != null && !KNOWN_TYPES.has(entry.type)) {
    checks.push(finding('warn', `Unknown transport type "${entry.type}"`, `expected one of: ${[...KNOWN_TYPES].join(', ')}`));
  }

  if (hasUrl && hasCommand) {
    checks.push(finding('warn', 'Entry defines both "command" and "url" — MCP hosts will pick one ambiguously'));
  }

  if (hasUrl) {
    // ---- Remote (http/sse) transport ----
    transport = 'remote';
    let parsed;
    try {
      parsed = new URL(entry.url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        checks.push(finding('error', `URL must be http(s), got "${parsed.protocol}"`));
      } else {
        checks.push(finding('ok', `remote endpoint ${entry.url}`));
        if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
          checks.push(finding('warn', 'Remote URL uses plain http:// over a non-local host'));
        }
      }
    } catch {
      checks.push(finding('error', `Invalid URL "${entry.url}"`));
    }

    if (opts.probe && parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
      // Marker consumed by the async probe pass.
      checks.push({ severity: 'pending-probe', message: `probe ${entry.url}`, url: entry.url });
    }
  } else if (hasCommand) {
    // ---- Local (stdio) transport ----
    transport = 'stdio';
    const cmd = entry.command;
    if (typeof cmd !== 'string' || cmd.trim() === '') {
      checks.push(finding('error', '"command" is missing or empty'));
    } else {
      const resolved = opts.whichFn(cmd);
      if (resolved) {
        checks.push(finding('ok', `command "${cmd}" resolves (${resolved})`));
      } else {
        const hint = RUNNER_HINTS[cmd] || 'not found on PATH — is it installed?';
        checks.push(finding('warn', `command "${cmd}" not found on PATH`, hint));
      }
    }

    // args must be an array of strings when present.
    if ('args' in entry) {
      if (!Array.isArray(entry.args)) {
        checks.push(finding('error', '"args" must be an array'));
      } else if (entry.args.length === 0) {
        checks.push(finding('warn', '"args" is an empty array'));
      } else {
        const nonString = entry.args.find((a) => typeof a !== 'string');
        if (nonString !== undefined) {
          checks.push(finding('error', '"args" must contain only strings'));
        }
      }
    }
  } else {
    // Neither url nor command.
    checks.push(finding('error', 'Entry has neither "command" (stdio) nor "url" (remote)'));
  }

  // ---- env checks (applies to both transports) ----
  if ('env' in entry) {
    if (entry.env === null || typeof entry.env !== 'object' || Array.isArray(entry.env)) {
      checks.push(finding('error', '"env" must be an object of string values'));
    } else {
      for (const [k, v] of Object.entries(entry.env)) {
        if (typeof v !== 'string') {
          checks.push(finding('error', `env "${k}" must be a string`));
          continue;
        }
        if (v === '') {
          checks.push(finding('warn', `env "${k}" is empty`));
        }
        // Referenced-but-unset variables (e.g. "${GITHUB_TOKEN}").
        for (const ref of envRefs(v)) {
          if (env[ref] == null || env[ref] === '') {
            checks.push(finding('warn', `env "${k}" references $${ref}, which is not set in this environment`));
          }
        }
      }
    }
  }

  // Env references embedded in command/args/url too.
  const refTargets = [entry.command, entry.url, ...(Array.isArray(entry.args) ? entry.args : [])];
  const seenRefs = new Set();
  for (const t of refTargets) {
    for (const ref of envRefs(t)) {
      if (seenRefs.has(ref)) continue;
      seenRefs.add(ref);
      if ((env[ref] == null || env[ref] === '') && !(entry.env && ref in entry.env)) {
        checks.push(finding('warn', `references $${ref}, which is not set in this environment`));
      }
    }
  }

  return { checks, transport };
}

// Top-level: validate a parsed config object.
// opts: { probe, whichFn, env, duplicates }
export function validateConfig(config, opts = {}) {
  const whichFn = opts.whichFn || which;
  const env = opts.env || process.env;
  const probe = Boolean(opts.probe);
  const duplicates = opts.duplicates || [];

  const result = {
    global: [],
    servers: [],
    counts: { ok: 0, warn: 0, error: 0 },
  };

  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    result.global.push(finding('error', 'Config root must be a JSON object'));
    tally(result);
    return result;
  }

  // Locate the mcpServers map. Accept a couple of aliases seen across hosts.
  const key = ['mcpServers', 'servers', 'mcp'].find((k) => k in config);
  const servers = key ? config[key] : undefined;

  if (servers === undefined) {
    result.global.push(finding('error', 'No "mcpServers" object found in config'));
    tally(result);
    return result;
  }
  if (key !== 'mcpServers') {
    result.global.push(finding('warn', `Found "${key}" — most hosts expect the key "mcpServers"`));
  }
  if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) {
    result.global.push(finding('error', `"${key}" must be an object mapping server names to configs`));
    tally(result);
    return result;
  }

  const names = Object.keys(servers);
  if (names.length === 0) {
    result.global.push(finding('warn', `"${key}" is empty — no servers configured`));
  }

  // Duplicate server names (from the raw-text parse).
  for (const dup of duplicates) {
    if (dup.startsWith(`${key}.`)) {
      const dupName = dup.slice(key.length + 1);
      result.global.push(finding('error', `Duplicate server name "${dupName}" — later definition silently wins`));
    }
  }

  for (const name of names) {
    const { checks, transport } = validateServer(name, servers[name], { probe, whichFn, env });
    result.servers.push({ name, transport, checks });
  }

  tally(result);
  return result;
}

function tally(result) {
  const bump = (c) => {
    if (c.severity === 'ok') result.counts.ok++;
    else if (c.severity === 'warn') result.counts.warn++;
    else if (c.severity === 'error') result.counts.error++;
  };
  result.global.forEach(bump);
  for (const s of result.servers) s.checks.forEach(bump);
}

// Perform pending network probes (mutates the result in place).
// probeFn(url) -> Promise<{ ok, status, error }>
export async function runProbes(result, probeFn) {
  for (const server of result.servers) {
    for (let idx = 0; idx < server.checks.length; idx++) {
      const c = server.checks[idx];
      if (c.severity !== 'pending-probe') continue;
      const res = await probeFn(c.url);
      if (res.ok) {
        server.checks[idx] = finding('ok', `probe ${c.url} → HTTP ${res.status}`);
        result.counts.ok++;
      } else if (res.status) {
        server.checks[idx] = finding('warn', `probe ${c.url} → HTTP ${res.status}`, res.note);
        result.counts.warn++;
      } else {
        server.checks[idx] = finding('warn', `probe ${c.url} unreachable`, res.error);
        result.counts.warn++;
      }
    }
  }
  return result;
}

// Default probe implementation using global fetch with a timeout.
export async function defaultProbe(url, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let resp;
    try {
      resp = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: ctrl.signal });
    } catch {
      // Some MCP endpoints reject HEAD; fall back to GET.
      resp = await fetch(url, { method: 'GET', redirect: 'manual', signal: ctrl.signal });
    }
    // Any HTTP response (even 4xx) means the host is reachable.
    const note = resp.status >= 400 ? 'endpoint reachable but returned an error status' : undefined;
    return { ok: resp.status < 400, status: resp.status, note };
  } catch (err) {
    const msg = err && err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : (err && err.message) || 'connection failed';
    return { ok: false, status: 0, error: msg };
  } finally {
    clearTimeout(t);
  }
}
