const fs = require('fs');
const path = require('path');
const zh = JSON.parse(fs.readFileSync('web/src/i18n/locales/zh-CN.json', 'utf8'));

function collect(node, prefix, set) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) collect(v, key, set);
    else set.add(key);
  }
}
const allKeys = new Set();
collect(zh, '', allKeys);

const files = [];
function scan(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('node_modules')) scan(p);
    } else if (/\.(tsx|ts)$/.test(entry.name)) {
      files.push(p);
    }
  }
}
scan('web/src');

const missing = new Set();
const dynamicFiles = new Set();
const KEY_RE = /\bt\(\s*(['"])([^'"{}]+)\1/g;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let m;
  KEY_RE.lastIndex = 0;
  while ((m = KEY_RE.exec(src)) !== null) {
    const key = m[2];
    if (!allKeys.has(key)) missing.add(key + '  <-  ' + file.replace(/\\/g, '/').replace('web/src/', ''));
  }
  if (/\bt\(\s*`/.test(src)) dynamicFiles.add(file.replace(/\\/g, '/').replace('web/src/', ''));
}

console.log('missing literal keys:', missing.size);
[...missing].slice(0, 50).forEach((x) => console.log('  ', x));
console.log('files with template-literal t() (dynamic keys):', dynamicFiles.size);
[...dynamicFiles].slice(0, 25).forEach((f) => console.log('  ', f));
