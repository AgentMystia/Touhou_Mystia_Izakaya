/**
 * Minimal recursive-descent parser for the Lua table literals used by the
 * Touhou Mystia's Izakaya wiki's data modules (`Module:Cuisine/data` et al).
 *
 * These modules are always a single `return { ... }` expression built from
 * tables, strings, and numbers, so a full Lua implementation is unnecessary.
 * The dialect quirks that actually appear in the data are:
 *   - both `"` and `'` string delimiters
 *   - `..` string concatenation used to wrap long description lines
 *   - `--` line comments and `--[[ ]]` block comments
 *   - mixed array/record tables (`{"a", "b", ["k"] = 1}`)
 *
 * A table containing any keyed entry is returned as an object; a purely
 * positional table is returned as an array. Mixed tables keep only the keyed
 * entries under their keys and positional ones under a `_list` field, which
 * the data modules use for their per-DLC name lists.
 */

export function parseLuaTable(source) {
  let s = stripComments(source).trim();
  if (s.startsWith('return')) s = s.slice('return'.length).trim();

  let i = 0;

  const skipSpace = () => {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n')) i++;
  };

  const parseString = () => {
    const quote = s[i];
    i++;
    let out = '';
    while (i < s.length && s[i] !== quote) {
      if (s[i] === '\\') {
        out += s[i + 1];
        i += 2;
      } else {
        out += s[i];
        i++;
      }
    }
    i++; // closing quote
    skipSpace();
    // Lua string concatenation: "part one " .. "part two"
    if (s[i] === '.' && s[i + 1] === '.') {
      i += 2;
      const rest = parseValue();
      if (typeof rest !== 'string') {
        throw new Error(`concatenation with a non-string near offset ${i}`);
      }
      return out + rest;
    }
    return out;
  };

  const LITERAL = /^-?\d+\.?\d*(?:[eE][+-]?\d+)?|^true\b|^false\b|^nil\b/;

  const parseValue = () => {
    skipSpace();
    if (s[i] === '{') return parseTable();
    if (s[i] === '"' || s[i] === "'") return parseString();

    const m = LITERAL.exec(s.slice(i));
    if (!m) {
      throw new Error(`unexpected token at offset ${i}: ${JSON.stringify(s.slice(i, i + 40))}`);
    }
    i += m[0].length;
    const tok = m[0];
    if (tok === 'true') return true;
    if (tok === 'false') return false;
    if (tok === 'nil') return null;
    return Number(tok);
  };

  const IDENT_KEY = /^([A-Za-z_]\w*)\s*=/;

  const parseTable = () => {
    i++; // opening brace
    const list = [];
    const record = {};
    let hasRecord = false;

    for (;;) {
      skipSpace();
      if (i >= s.length) throw new Error('unterminated table');
      if (s[i] === '}') {
        i++;
        break;
      }

      if (s[i] === '[') {
        // ["key"] = value  /  [1] = value
        i++;
        const key = parseValue();
        skipSpace();
        if (s[i] !== ']') throw new Error(`expected ] at offset ${i}`);
        i++;
        skipSpace();
        if (s[i] !== '=') throw new Error(`expected = at offset ${i}`);
        i++;
        record[String(key)] = parseValue();
        hasRecord = true;
      } else {
        const m = IDENT_KEY.exec(s.slice(i));
        if (m) {
          // bare identifier key: name="Youkai Trail"
          i += m[0].length;
          record[m[1]] = parseValue();
          hasRecord = true;
        } else {
          list.push(parseValue());
        }
      }

      skipSpace();
      if (s[i] === ',' || s[i] === ';') i++;
    }

    if (!hasRecord) return list;
    if (list.length > 0) record._list = list;
    return record;
  };

  const value = parseValue();
  skipSpace();
  if (i < s.length) {
    throw new Error(`trailing content at offset ${i}: ${JSON.stringify(s.slice(i, i + 40))}`);
  }
  return value;
}

function stripComments(src) {
  return src.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');
}

/** Pull the `.parse.wikitext['*']` payload out of a cached MediaWiki API response. */
export function wikitextOf(apiResponseJson) {
  const wikitext = apiResponseJson?.parse?.wikitext?.['*'];
  if (typeof wikitext !== 'string') {
    throw new Error('cached response has no parse.wikitext payload');
  }
  return wikitext;
}
