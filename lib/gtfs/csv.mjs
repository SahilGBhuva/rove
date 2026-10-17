import fs from 'node:fs';
import readline from 'node:readline';

/** Parse one CSV line (RFC 4180 quoting, no embedded newlines). */
export function parseCsvLine(line) {
  const out = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      out.push(value);
      value = '';
    } else value += c;
  }
  out.push(value.replace(/\r$/, ''));
  return out;
}

function cleanHeaders(line) {
  return parseCsvLine(line).map(h => h.replace(/^﻿/, '').trim());
}

/** Read a small GTFS table fully into an array of objects. Missing file returns []. */
export function readTable(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = cleanHeaders(lines.shift());
  return lines.map(line => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

/** Stream a large GTFS table, calling onRow(row) with only the requested columns. */
export async function streamTable(file, columns, onRow) {
  if (!fs.existsSync(file)) return 0;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let indexes = null;
  let count = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!indexes) {
      const headers = cleanHeaders(line);
      indexes = columns.map(c => headers.indexOf(c));
      continue;
    }
    const values = parseCsvLine(line);
    const row = {};
    columns.forEach((c, i) => { row[c] = indexes[i] >= 0 ? (values[indexes[i]] ?? '') : ''; });
    onRow(row);
    count++;
  }
  return count;
}
