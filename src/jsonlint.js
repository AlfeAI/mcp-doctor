// A tiny JSON parser that (a) reports parse errors with line/column and
// (b) surfaces duplicate object keys — something JSON.parse silently drops
// by keeping the last value. Duplicate MCP server names are a real, common
// footgun, so detecting them is worth the ~100 lines.

export class JsonParseError extends Error {
  constructor(message, line, column) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'JsonParseError';
    this.line = line;
    this.column = column;
  }
}

export function parseJsonc(text) {
  const duplicates = [];
  let i = 0;
  const n = text.length;

  function lineCol(pos) {
    let line = 1;
    let col = 1;
    for (let k = 0; k < pos && k < n; k++) {
      if (text[k] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    return { line, col };
  }

  function fail(msg, pos = i) {
    const { line, col } = lineCol(pos);
    throw new JsonParseError(msg, line, col);
  }

  function skipWs() {
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        i++;
      } else {
        break;
      }
    }
  }

  function parseValue(path) {
    skipWs();
    if (i >= n) fail('Unexpected end of input');
    const c = text[i];
    if (c === '{') return parseObject(path);
    if (c === '[') return parseArray(path);
    if (c === '"') return parseString();
    if (c === '-' || (c >= '0' && c <= '9')) return parseNumber();
    if (text.startsWith('true', i)) {
      i += 4;
      return true;
    }
    if (text.startsWith('false', i)) {
      i += 5;
      return false;
    }
    if (text.startsWith('null', i)) {
      i += 4;
      return null;
    }
    fail(`Unexpected token '${c}'`);
  }

  function parseObject(path) {
    i++; // consume {
    const obj = {};
    const seen = new Set();
    skipWs();
    if (text[i] === '}') {
      i++;
      return obj;
    }
    for (;;) {
      skipWs();
      if (text[i] !== '"') fail('Expected property name string');
      const key = parseString();
      if (seen.has(key)) {
        const here = path ? `${path}.${key}` : key;
        duplicates.push(here);
      }
      seen.add(key);
      skipWs();
      if (text[i] !== ':') fail("Expected ':' after property name");
      i++;
      const childPath = path ? `${path}.${key}` : key;
      obj[key] = parseValue(childPath);
      skipWs();
      const ch = text[i];
      if (ch === ',') {
        i++;
        continue;
      }
      if (ch === '}') {
        i++;
        return obj;
      }
      fail("Expected ',' or '}' in object");
    }
  }

  function parseArray(path) {
    i++; // consume [
    const arr = [];
    skipWs();
    if (text[i] === ']') {
      i++;
      return arr;
    }
    let idx = 0;
    for (;;) {
      arr.push(parseValue(`${path}[${idx++}]`));
      skipWs();
      const ch = text[i];
      if (ch === ',') {
        i++;
        continue;
      }
      if (ch === ']') {
        i++;
        return arr;
      }
      fail("Expected ',' or ']' in array");
    }
  }

  function parseString() {
    i++; // opening quote
    let out = '';
    for (;;) {
      if (i >= n) fail('Unterminated string');
      const c = text[i++];
      if (c === '"') return out;
      if (c === '\\') {
        const e = text[i++];
        switch (e) {
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case '/': out += '/'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'u': {
            const hex = text.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid \\u escape');
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            fail(`Invalid escape '\\${e}'`);
        }
      } else {
        out += c;
      }
    }
  }

  function parseNumber() {
    const start = i;
    if (text[i] === '-') i++;
    while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    if (text[i] === '.') {
      i++;
      while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++;
      if (text[i] === '+' || text[i] === '-') i++;
      while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    }
    return Number(text.slice(start, i));
  }

  const value = parseValue('');
  skipWs();
  if (i < n) fail('Unexpected trailing content');

  return { value, duplicates };
}
