// Minimal cross-platform `which`: resolve a bare command name against PATH.
import { existsSync, statSync } from 'node:fs';
import { delimiter, join, isAbsolute } from 'node:path';

function isExecutableFile(p) {
  try {
    const st = statSync(p);
    return st.isFile();
  } catch {
    return false;
  }
}

// Resolve `cmd` to an absolute path, or null if not found on PATH.
export function which(cmd) {
  if (!cmd) return null;

  // Absolute or explicitly-relative path: check directly.
  if (isAbsolute(cmd) || cmd.includes('/') || cmd.includes('\\')) {
    return isExecutableFile(cmd) ? cmd : null;
  }

  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(delimiter).filter(Boolean);

  // On Windows, commands resolve with an extension.
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
      : [''];

  for (const dir of dirs) {
    for (const ext of exts) {
      const full = join(dir, cmd + ext);
      if (existsSync(full) && isExecutableFile(full)) return full;
    }
  }
  return null;
}
