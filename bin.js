#!/usr/bin/env node
// mcp-doctor CLI entry.
// Handle --no-color before the color module is imported (ESM imports are
// evaluated eagerly, and colors.js reads NO_COLOR at load time).
const argv = process.argv.slice(2);
if (argv.includes('--no-color')) process.env.NO_COLOR = '1';

const { main } = await import('./src/index.js');

main(argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  });
