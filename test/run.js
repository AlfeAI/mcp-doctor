// Minimal zero-dependency test runner. Run with `npm test`.
import assert from 'node:assert/strict';
import { parseJsonc, JsonParseError } from '../src/jsonlint.js';
import { validateConfig, runProbes } from '../src/validate.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  ok  ${name}\n`);
  } catch (e) {
    failed++;
    process.stdout.write(`FAIL  ${name}\n      ${e.message}\n`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write(`  ok  ${name}\n`);
  } catch (e) {
    failed++;
    process.stdout.write(`FAIL  ${name}\n      ${e.message}\n`);
  }
}

// Stub PATH resolver so tests are deterministic.
const whichFn = (cmd) => (cmd === 'node' || cmd === 'npx' ? `/usr/bin/${cmd}` : null);

test('parses valid JSON', () => {
  const { value, duplicates } = parseJsonc('{"a":1,"b":[true,null]}');
  assert.deepEqual(value, { a: 1, b: [true, null] });
  assert.equal(duplicates.length, 0);
});

test('detects duplicate keys', () => {
  const { duplicates } = parseJsonc('{"mcpServers":{"x":{},"x":{}}}');
  assert.deepEqual(duplicates, ['mcpServers.x']);
});

test('throws on trailing comma with position', () => {
  assert.throws(() => parseJsonc('{"a":1,}'), (e) => e instanceof JsonParseError && e.line === 1);
});

test('flags missing command and url', () => {
  const r = validateConfig({ mcpServers: { bad: { args: ['x'] } } }, { whichFn, env: {} });
  assert.equal(r.counts.error, 1);
  assert.ok(r.servers[0].checks.some((c) => c.severity === 'error' && /neither/.test(c.message)));
});

test('detects stdio transport and resolves known command', () => {
  const r = validateConfig({ mcpServers: { fs: { command: 'node', args: ['s.js'] } } }, { whichFn, env: {} });
  assert.equal(r.servers[0].transport, 'stdio');
  assert.equal(r.counts.error, 0);
  assert.equal(r.counts.ok, 1);
});

test('warns on unresolved command', () => {
  const r = validateConfig({ mcpServers: { u: { command: 'uvx', args: ['x'] } } }, { whichFn, env: {} });
  assert.ok(r.servers[0].checks.some((c) => c.severity === 'warn' && /not found on PATH/.test(c.message)));
});

test('flags invalid remote url scheme', () => {
  const r = validateConfig({ mcpServers: { r: { url: 'ftp://x/mcp' } } }, { whichFn, env: {} });
  assert.equal(r.servers[0].transport, 'remote');
  assert.ok(r.counts.error >= 1);
});

test('warns on unset referenced env var', () => {
  const r = validateConfig(
    { mcpServers: { g: { command: 'npx', args: ['s'], env: { TOK: '${MY_TOKEN}' } } } },
    { whichFn, env: {} }
  );
  assert.ok(r.servers[0].checks.some((c) => c.severity === 'warn' && /MY_TOKEN/.test(c.message)));
});

test('accepts set referenced env var', () => {
  const r = validateConfig(
    { mcpServers: { g: { command: 'npx', args: ['s'], env: { TOK: '${MY_TOKEN}' } } } },
    { whichFn, env: { MY_TOKEN: 'abc' } }
  );
  assert.ok(!r.servers[0].checks.some((c) => /MY_TOKEN/.test(c.message)));
});

test('reports missing mcpServers', () => {
  const r = validateConfig({ foo: 1 }, { whichFn, env: {} });
  assert.equal(r.counts.error, 1);
  assert.ok(r.global.some((c) => /No "mcpServers"/.test(c.message)));
});

test('reports duplicate server names via global', () => {
  const r = validateConfig({ mcpServers: { a: { command: 'node' } } }, { whichFn, env: {}, duplicates: ['mcpServers.a'] });
  assert.ok(r.global.some((c) => c.severity === 'error' && /Duplicate server name/.test(c.message)));
});

await testAsync('probe marker resolves through runProbes', async () => {
  const r = validateConfig({ mcpServers: { rem: { url: 'https://example.com/mcp' } } }, { whichFn, env: {}, probe: true });
  await runProbes(r, async () => ({ ok: true, status: 200 }));
  assert.ok(r.servers[0].checks.some((c) => c.severity === 'ok' && /HTTP 200/.test(c.message)));
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
