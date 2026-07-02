// Discovery of MCP config files across common host locations.
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

// Returns the list of well-known MCP config paths for the current OS,
// each tagged with the host it belongs to. Only paths that exist are
// worth probing, but we return all candidates so callers can report
// "nothing found" usefully.
export function candidatePaths() {
  const home = homedir();
  const plat = platform();
  const out = [];

  const add = (host, path) => path && out.push({ host, path });

  // Claude Desktop
  if (plat === 'darwin') {
    add('Claude Desktop', join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  } else if (plat === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    add('Claude Desktop', join(appData, 'Claude', 'claude_desktop_config.json'));
  } else {
    add('Claude Desktop', join(home, '.config', 'Claude', 'claude_desktop_config.json'));
  }

  // Claude Code (project + user scope)
  add('Claude Code (project)', join(process.cwd(), '.mcp.json'));
  add('Claude Code (user)', join(home, '.claude.json'));

  // Cursor
  add('Cursor (project)', join(process.cwd(), '.cursor', 'mcp.json'));
  add('Cursor (global)', join(home, '.cursor', 'mcp.json'));

  // VS Code (workspace)
  add('VS Code (workspace)', join(process.cwd(), '.vscode', 'mcp.json'));

  // Windsurf
  add('Windsurf', join(home, '.codeium', 'windsurf', 'mcp_config.json'));

  // Generic project-local
  add('Generic', join(process.cwd(), 'mcp.json'));
  add('Generic', join(process.cwd(), '.mcp', 'config.json'));

  return out;
}

// Auto-discover the first existing config file. Returns { host, path } or null.
export function autoDiscover() {
  for (const c of candidatePaths()) {
    if (existsSync(c.path)) return c;
  }
  return null;
}
