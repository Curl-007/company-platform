#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const distDir = path.resolve(__dirname, "..", "web", "dist");
const forbidden = [
  "\u672c\u5730\u6f14\u793a\u8d26\u53f7",
  "\u6f14\u793a\u8d26\u53f7",
  "admin@example.com",
  "pm@example.com",
  "pdm@example.com",
  "dev@example.com",
  "qa@example.com",
  "Admin@123",
  "Pm@12345",
  "Pdm@12345",
  "Dev@12345",
  "Qa@12345",
];

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error(`Release web build missing at ${distDir}. Run npm run build -w web first.`);
  process.exit(1);
}

const files = collectFiles(distDir);
const hits = [];
for (const file of files) {
  const content = fs.readFileSync(file).toString("utf8");
  for (const value of forbidden) {
    if (content.includes(value)) hits.push(`${path.relative(distDir, file)}: ${value}`);
  }
}

if (hits.length > 0) {
  console.error("Release web build contains forbidden demo credentials:");
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log(`Release web scan PASS (${files.length} files, ${forbidden.length} forbidden values absent).`);
