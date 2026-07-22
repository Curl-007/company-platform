#!/usr/bin/env node
const { formatPreflightReport, preflightEnv } = require("../src/ops/envPreflight");

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const report = preflightEnv(process.env);

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatPreflightReport(report));
}

if (!report.ok) process.exitCode = 1;
