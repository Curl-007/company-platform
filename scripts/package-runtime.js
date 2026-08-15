#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const sourceRoot = path.resolve(readArg("--source") || path.join(__dirname, ".."));
const distRoot = path.resolve(readArg("--dist") || path.join(sourceRoot, "web", "dist"));
const outputRootArg = readArg("--out");
if (!outputRootArg) {
  console.error("Usage: node scripts/package-runtime.js --source <tag source> --dist <web/dist> --out <runtime root>");
  process.exit(1);
}
const outputRoot = path.resolve(outputRootArg);

if (fs.existsSync(outputRoot)) {
  console.error(`Runtime output already exists: ${outputRoot}`);
  process.exit(1);
}

function copyFile(relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(outputRoot, relativePath);
  if (!fs.statSync(source).isFile()) throw new Error(`Required runtime file missing: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(relativePath, options = {}) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(outputRoot, relativePath);
  if (!fs.statSync(source).isDirectory()) throw new Error(`Required runtime directory missing: ${source}`);
  fs.cpSync(source, target, {
    recursive: true,
    filter: options.filter,
  });
}

for (const file of [
  "package.json",
  "package-lock.json",
  "DELIVERY.md",
  "scripts/start-prod.js",
  "api/.env.example",
  "api/package.json",
  "api/server.js",
  "api/db.js",
  "api/openapi.json",
  "web/package.json",
  "docs/deployment-and-ops.md",
]) {
  copyFile(file);
}

copyDirectory("api/db");
copyDirectory("api/migrations");
const developmentSource = path.join(sourceRoot, "api", "src", "dev");
copyDirectory("api/src", {
  filter: (source) => source !== developmentSource && !source.startsWith(`${developmentSource}${path.sep}`),
});

if (!fs.existsSync(path.join(distRoot, "index.html"))) {
  throw new Error(`Production web build missing: ${distRoot}`);
}
fs.cpSync(distRoot, path.join(outputRoot, "web", "dist"), { recursive: true });

const forbiddenValues = [
  "\u672c\u5730\u6f14\u793a\u8d26\u53f7",
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
const findings = [];

function stripInlineComment(line) {
  return line.split("#")[0].split("//")[0].trim();
}

function lineMatchesCredential(line, value) {
  // A credential is considered leaked only when it is the whole (comment-stripped)
  // line, or the value side of a `KEY=value` line. Substring matches inside a
  // longer value (e.g. Admin@123 inside the delivered initial password
  // Admin@123456) or inside a comment are intentional and allowed.
  const stripped = stripInlineComment(line);
  return stripped === value || stripped.endsWith(`=${value}`) || stripped.endsWith(`: "${value}"`) || stripped.endsWith(`: '${value}'`);
}

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(target);
      continue;
    }
    if (!entry.isFile()) continue;
    const lines = fs.readFileSync(target).toString("utf8").split(/\r?\n/);
    for (const value of forbiddenValues) {
      const hit = lines.some((line) => lineMatchesCredential(line, value));
      if (hit) findings.push(`${path.relative(outputRoot, target)}: ${value}`);
    }
  }
}

scan(outputRoot);
if (findings.length > 0) {
  console.error("Runtime package contains development demo credentials:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Runtime staging ready: ${outputRoot}`);
