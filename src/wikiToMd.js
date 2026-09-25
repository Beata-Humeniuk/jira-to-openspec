// Jira wiki markup (what REST API v2 returns for a description, on Cloud and on
// Server/Data Center) to Markdown. Anything not recognised stays as written, so
// mentions, images and macros survive a round trip as plain text.

const BOUNDARY_BEFORE = '(^|[\\s([{>"\'/])';
const BOUNDARY_AFTER = '(?=$|[\\s)\\]}<.,;:!?"\'/])';

function span(marker, open, close) {
  const m = marker.replace(/[-*+^~]/g, '\\$&');
  return [new RegExp(BOUNDARY_BEFORE + m + '(?=\\S)([^' + marker + '\\n]*?\\S)' + m + BOUNDARY_AFTER, 'g'),
    (all, before, text) => before + open + text + close];
}

const SPANS = [span('*', '**', '**'), span('_', '_', '_'), span('-', '~~', '~~')];

function link(inner) {
  const bar = inner.indexOf('|');
  if (bar < 0) {
    return /^(https?:|mailto:)/.test(inner) ? '<' + inner + '>' : null;
  }
  const text = inner.slice(0, bar);
  const href = inner.slice(bar + 1).split('|')[0].trim();
  if (!/^(https?:|mailto:|#)/.test(href)) return null;
  return '[' + text + '](' + href + ')';
}

function inline(text) {
  const codes = [];
  let s = String(text).replace(/\{\{([\s\S]*?)\}\}/g, (m, code) => {
    codes.push(code);
    return '\u0000' + (codes.length - 1) + '\u0000';
  });
  s = s.replace(/\[([^\[\]\n]+)\]/g, (m, inner) => link(inner) || m);
  for (const [re, to] of SPANS) s = s.replace(re, to);
  s = s.replace(/ ?\\\\ ?(?=\S|$)/g, '\\\n');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => {
    const code = codes[Number(i)];
    const fence = code.includes('`') ? '`` ' : '`';
    return fence + code + fence.split('').reverse().join('');
  });
}

// Splits a table row on "|" that are not inside [links] or {{code}}.
function cells(row, separator) {
  const out = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '[' || (row[i] === '{' && row[i + 1] === '{')) depth++;
    if ((row[i] === ']' || (row[i] === '}' && row[i + 1] === '}')) && depth) depth--;
    if (!depth && row.startsWith(separator, i)) {
      out.push(current);
      current = '';
      i += separator.length - 1;
      continue;
    }
    current += row[i];
  }
  out.push(current);
  return out.slice(1, current.trim() ? undefined : -1).map((c) => c.trim());
}

function tableRow(values) {
  return '| ' + values.map((v) => inline(v).replace(/\|/g, '\\|') || ' ').join(' | ') + ' |';
}

function table(rows) {
  const parsed = rows.map((row) => row.startsWith('||') ? { head: true, cells: cells(row, '||') } : { head: false, cells: cells(row, '|') });
  const width = Math.max(...parsed.map((r) => r.cells.length));
  const pad = (c) => c.concat(Array(width - c.length).fill(''));
  const head = parsed[0].head ? parsed.shift().cells : [];
  const out = [tableRow(pad(head)), '|' + Array(width).fill(' --- ').join('|') + '|'];
  for (const row of parsed) out.push(tableRow(pad(row.cells)));
  return out;
}

function listLine(marker, text, stack) {
  const depth = marker.length;
  const kinds = marker.split('').map((c) => c === '#' ? 'ol' : 'ul');
  while (stack.length > depth || (stack.length && stack[stack.length - 1].kind !== kinds[stack.length - 1])) stack.pop();
  while (stack.length < depth) stack.push({ kind: kinds[stack.length], n: 0 });
  const indent = stack.slice(0, -1).map((level) => ' '.repeat(level.kind === 'ol' ? 3 : 2)).join('');
  const level = stack[stack.length - 1];
  level.n += 1;
  return indent + (level.kind === 'ol' ? level.n + '. ' : '- ') + inline(text);
}

function wikiToMd(wiki) {
  const lines = String(wiki == null ? '' : wiki).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = [];
  let i = 0;
  const blank = () => {
    if (out.length && out[out.length - 1] !== '') out.push('');
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const code = trimmed.match(/^\{(code|noformat)(?::([^}]*))?\}(.*)$/);
    if (code) {
      blank();
      list = [];
      const param = (code[2] || '').split('|')[0];
      const lang = code[1] === 'code' && param && !param.includes('=') ? param.trim() : '';
      const end = '{' + code[1] + '}';
      const body = [];
      let rest = code[3];
      for (;;) {
        const close = rest.indexOf(end);
        if (close >= 0) {
          if (rest.slice(0, close)) body.push(rest.slice(0, close));
          break;
        }
        if (rest || body.length) body.push(rest);
        if (++i >= lines.length) break;
        rest = lines[i];
      }
      const text = body.join('\n').replace(/\n+$/, '');
      const fence = /```/.test(text) ? '````' : '```';
      out.push(fence + lang, ...(text ? text.split('\n') : []), fence, '');
      i++;
      continue;
    }

    if (/^\{quote\}/.test(trimmed)) {
      blank();
      list = [];
      const body = [];
      let rest = trimmed.slice('{quote}'.length);
      for (;;) {
        const close = rest.indexOf('{quote}');
        if (close >= 0) {
          body.push(rest.slice(0, close));
          break;
        }
        body.push(rest);
        if (++i >= lines.length) break;
        rest = lines[i];
      }
      const inner = wikiToMd(body.join('\n')).replace(/\n+$/, '');
      out.push(...inner.split('\n').map((l) => l ? '> ' + l : '>'), '');
      i++;
      continue;
    }

    if (/^\{panel(:[^}]*)?\}$/.test(trimmed) || trimmed === '{panel}' || /^\{(color|div)(:[^}]*)?\}$/.test(trimmed)) {
      i++;
      continue;
    }

    if (!trimmed) {
      list = [];
      blank();
      i++;
      continue;
    }

    const heading = trimmed.match(/^h([1-6])\.\s+(.*)$/);
    if (heading) {
      blank();
      list = [];
      out.push('#'.repeat(Number(heading[1])) + ' ' + inline(heading[2]), '');
      i++;
      continue;
    }

    const quote = trimmed.match(/^bq\.\s+(.*)$/);
    if (quote) {
      blank();
      list = [];
      out.push('> ' + inline(quote[1]), '');
      i++;
      continue;
    }

    if (/^-{4,}$/.test(trimmed)) {
      blank();
      list = [];
      out.push('---', '');
      i++;
      continue;
    }

    if (/^\|/.test(trimmed)) {
      blank();
      list = [];
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) rows.push(lines[i++].trim());
      out.push(...table(rows), '');
      continue;
    }

    const item = line.match(/^\s*([*#-]+)\s+(.*)$/);
    if (item && (/^[*#]+$/.test(item[1]) || item[1] === '-')) {
      if (!list.length) blank();
      out.push(listLine(item[1].replace(/-/g, '*'), item[2], list));
      i++;
      continue;
    }

    if (list.length) {
      out[out.length - 1] += '\\\n' + ' '.repeat(out[out.length - 1].match(/^\s*(?:\d+\. |- )/)[0].length) + inline(trimmed);
      i++;
      continue;
    }

    out.push(inline(line.replace(/\s+$/, '')));
    i++;
  }

  while (out.length && out[out.length - 1] === '') out.pop();
  return out.length ? out.join('\n') + '\n' : '';
}

module.exports = { wikiToMd };
