#!/usr/bin/env node
/**
 * Single-process SQLite trial / internal production entry.
 *
 * - NODE_ENV=production (unless already set)
 * - SERVE_WEB=1 (unless explicitly disabled)
 * - Requires web/dist (run `npm run build -w web` first)
 * - Loads api/server.js which fail-closes on weak secrets in production
 *
 * Usage:
 *   JWT_SECRET=... AI_CONFIG_ENCRYPTION_KEY=... node scripts/start-prod.js
 *   npm run start:prod
 */
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const apiRoot = path.join(repoRoot, "api");

if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
if (process.env.SERVE_WEB == null || process.env.SERVE_WEB === "") {
  process.env.SERVE_WEB = "1";
}

const webDist = process.env.WEB_DIST
  ? path.resolve(process.env.WEB_DIST)
  : path.join(repoRoot, "web", "dist");
const indexHtml = path.join(webDist, "index.html");

if (String(process.env.SERVE_WEB) !== "0" && String(process.env.SERVE_WEB).toLowerCase() !== "false") {
  if (!fs.existsSync(indexHtml)) {
    console.error(`FATAL: production web build missing at ${indexHtml}`);
    console.error("Run: npm run build -w web");
    process.exit(1);
  }
  process.env.WEB_DIST = webDist;
}

// Ensure API resolves relative paths from its package (storage, migrations, default db).
process.chdir(apiRoot);

require(path.join(apiRoot, "server.js"));
