#!/usr/bin/env node
/**
 * Bootstrap a disposable SQLite DB for RC/E2E.
 * Honors DATABASE_FILE and seed env already present in the process.
 */
require(require("path").join(__dirname, "..", "api", "db")).initDb();
