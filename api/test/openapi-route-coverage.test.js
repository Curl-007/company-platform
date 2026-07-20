const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const apiRoot = path.resolve(__dirname, "..");

function routeFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(location);
    return entry.name === "routes.js" || entry.name.endsWith("Routes.js") ? [location] : [];
  });
}

function normalizePath(value) {
  return value.replace(/:[A-Za-z][A-Za-z0-9_]*/g, "{}").replace(/\{[^}]+\}/g, "{}");
}

test("every Express module route is represented by an OpenAPI operation", () => {
  const document = JSON.parse(fs.readFileSync(path.join(apiRoot, "openapi.json"), "utf8"));
  const operations = new Set();
  for (const [routePath, pathItem] of Object.entries(document.paths)) {
    for (const method of ["get", "post", "patch", "put", "delete"]) {
      if (pathItem[method]) operations.add(`${method.toUpperCase()} ${normalizePath(routePath)}`);
    }
  }

  const missing = [];
  const routePattern = /router\.(get|post|patch|put|delete)\("([^"\s]+)"/g;
  for (const filename of routeFiles(path.join(apiRoot, "src", "modules"))) {
    const source = fs.readFileSync(filename, "utf8");
    for (const match of source.matchAll(routePattern)) {
      const operation = `${match[1].toUpperCase()} ${normalizePath(`/api${match[2]}`)}`;
      if (!operations.has(operation)) missing.push(`${operation} (${path.relative(apiRoot, filename)})`);
    }
  }

  assert.deepEqual(missing, []);
});
