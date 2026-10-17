// Syntax-check every JavaScript module in the repository (excluding dependencies and data).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const skip = new Set(['node_modules', '.git', 'data']);
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(mjs|js)$/.test(entry.name)) files.push(full);
  }
})(root);
let failed = 0;
for (const file of files) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) { failed++; console.error(`✗ ${path.relative(root, file)}\n${error.stderr}`); }
}
console.log(`${files.length - failed}/${files.length} files passed syntax check`);
if (failed) process.exit(1);
