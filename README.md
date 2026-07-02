# mcp-doctor

**Diagnose your [Model Context Protocol](https://modelcontextprotocol.io) (MCP) config in one command.** `mcp-doctor` reads the JSON config used by Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, or any generic `mcp.json`, and tells you exactly what's wrong — before your AI client silently fails to start a server.

Zero dependencies. Runs anywhere Node 18+ runs. No install required.

```bash
npx mcpdoctor
```

[![npm](https://img.shields.io/npm/v/mcpdoctor)](https://www.npmjs.com/package/mcpdoctor)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

> On npm the package is **`mcpdoctor`** (the `mcp-doctor` name was already taken). The command it installs is still **`mcp-doctor`**, with `mcpdoctor` as an alias — so `npx mcpdoctor` and a global `mcp-doctor` both work.

---

## Why

MCP config files are hand-edited JSON, and the failure modes are miserable: a trailing comma, a `command` that isn't on your `PATH`, an `env` var you forgot to export, two servers with the same name where the second silently wins. Most MCP hosts fail **quietly** — the server just never shows up, with no error you can act on.

`mcp-doctor` turns those silent failures into a clear, colored checklist.

## Quickstart

```bash
# Auto-discover your config (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, ./mcp.json ...)
npx mcpdoctor

# Point it at a specific file
npx mcpdoctor ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Also reachability-check remote server URLs
npx mcpdoctor ./mcp.json --probe

# Machine-readable output for CI
npx mcpdoctor ./mcp.json --json
```

## Example output

```
mcp-doctor  ·  file
./examples/broken.json

Config
   ✗ Duplicate server name "dupe" — later definition silently wins

✗ no-command [unknown]
   ✗ Entry has neither "command" (stdio) nor "url" (remote)

⚠ empty-args [stdio]
   ⚠ command "uvx" not found on PATH  — install via https://docs.astral.sh/uv/
   ⚠ "args" is an empty array

⚠ needs-token [stdio]
   ✓ command "npx" resolves (/usr/local/bin/npx)
   ⚠ env "GITHUB_PERSONAL_ACCESS_TOKEN" references $GITHUB_PERSONAL_ACCESS_TOKEN, which is not set in this environment

✗ bad-url [remote]
   ✗ URL must be http(s), got "ftp:"

Summary  4 ok  ·  5 warnings  ·  4 errors  ·  FAIL
```

Exit code is non-zero when errors are found, so you can drop it straight into a pre-commit hook or CI job.

## What it checks

**File & JSON**
- File exists and is readable
- Valid JSON — with **line/column** on parse errors (trailing commas, unquoted keys, ...)
- **Duplicate server names**, which `JSON.parse` silently collapses to the last one

**Config shape**
- A top-level `mcpServers` object exists (also accepts `servers` / `mcp` aliases, with a nudge toward the standard key)
- Each server entry is a valid object

**stdio servers (`command` + `args`)**
- `command` is present and non-empty
- `command` **resolves on your `PATH`** (`npx`, `node`, `uvx`, `docker`, `python`, `bunx`, `deno`, ...) with an install hint when it doesn't
- `args` is an array of strings; flags empty or non-string args

**Remote servers (`url`)**
- `url` is a valid `http`/`https` URL
- Warns on plain `http://` to non-local hosts
- With `--probe`: a quick, safe `HEAD`/`GET` reachability check with a timeout

**Environment & common mistakes**
- `env` is an object of string values
- `${VAR}` / `$VAR` references (in `env`, `command`, `args`, `url`) that **aren't set** in your environment
- Empty `env` values
- Unknown transport `type`
- Entries that ambiguously define **both** `command` and `url`

## Flags

| Flag | Description |
| --- | --- |
| `[path]` | Path to a config file. Omit to auto-discover. |
| `--probe` | Reachability-check remote server URLs (HEAD/GET, timed out). |
| `--json` | Emit machine-readable JSON instead of the report. |
| `--list` | Show every config location that is scanned, then exit. |
| `--no-color` | Disable ANSI color (also honors `NO_COLOR`). |
| `-h, --help` | Show help. |
| `-v, --version` | Show version. |

## Where it looks

Run `npx mcpdoctor --list` to see the exact paths for your OS. It covers:

- **Claude Desktop** — `claude_desktop_config.json` (macOS / Windows / Linux)
- **Claude Code** — `.mcp.json` (project) and `~/.claude.json` (user)
- **Cursor** — `.cursor/mcp.json` (project and global)
- **VS Code** — `.vscode/mcp.json`
- **Windsurf** — `~/.codeium/windsurf/mcp_config.json`
- **Generic** — `./mcp.json`, `./.mcp/config.json`

## Use in CI

```yaml
# .github/workflows/mcp.yml
- run: npx mcpdoctor ./.mcp.json --json
```

`mcp-doctor` exits `1` on errors and `2` on usage/parse failures, so a broken config fails the job.

## Programmatic use

```js
import { validateConfig } from 'mcpdoctor';

const result = validateConfig(JSON.parse(configText));
console.log(result.counts); // { ok, warn, error }
```

## Contributing

Issues and PRs welcome. The whole thing is a few hundred lines of dependency-free ESM under `src/`, with a zero-dependency test runner (`npm test`).

---

## Maintained by Alfe

`mcp-doctor` is built and maintained by **[Alfe](https://alfe.ai)** — the platform for deploying and managing AI agents that actually do work. Alfe agents speak MCP natively, so we spend a lot of time staring at these config files. We built `mcp-doctor` to stop staring.

- **Website:** [alfe.ai](https://alfe.ai)
- **Docs:** [docs.alfe.ai](https://docs.alfe.ai)

If `mcp-doctor` saved you some head-scratching, come see what [Alfe](https://alfe.ai) can do with agents.

## License

[MIT](./LICENSE) © [Alfe](https://alfe.ai)
