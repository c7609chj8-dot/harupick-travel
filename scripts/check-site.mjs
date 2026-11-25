import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = fs.readdirSync(root);
const errors = [];
let htmlCount = 0, scriptCount = 0, referenceCount = 0;
function checkReference(source, raw) {
  if (!raw || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(raw)) return;
  const relative = raw.split(/[?#]/)[0];
  if (!relative) return;
  const target = path.resolve(path.dirname(source), decodeURIComponent(relative));
  if (!fs.existsSync(target)) errors.push(path.basename(source) + ': missing reference ' + raw);
  referenceCount++;
}
for (const name of files.filter(name => name.endsWith('.html'))) {
  const filename = path.join(root, name), html = fs.readFileSync(filename, 'utf8');
  htmlCount++;
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  if (new Set(ids).size !== ids.length) errors.push(name + ': duplicate IDs');
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) checkReference(filename, match[1]);
  for (const match of html.matchAll(/(?:aria-labelledby|aria-describedby|aria-controls|for)=["']([^"']+)["']/g)) {
    for (const id of match[1].split(/\s+/)) if (!ids.includes(id)) errors.push(name + ': missing accessible target #' + id);
  }
}
for (const name of files.filter(name => name.endsWith('.js'))) {
  const filename = path.join(root, name), js = fs.readFileSync(filename, 'utf8');
  scriptCount++;
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(name + ': syntax error ' + result.stderr.trim());
  for (const match of js.matchAll(/(?:from\s+|import\s*)['"](\.\.?\/[^'"]+)['"]/g)) checkReference(filename, match[1]);
  if (/sb_secret_[a-z\d]/i.test(js)) errors.push(name + ': secret key in browser source');
}
for (const name of files.filter(name => name.endsWith('.css'))) {
  const filename = path.join(root, name), css = fs.readFileSync(filename, 'utf8');
  for (const match of css.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g)) checkReference(filename, match[1]);
}
if (errors.length) { errors.forEach(error => console.error(error)); process.exitCode = 1; }
else console.log('PASS: ' + htmlCount + ' HTML pages, ' + scriptCount + ' JavaScript files, ' + referenceCount + ' local references; IDs, accessibility targets and syntax verified.');

