#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { boot, installFailLoud } from "@deepseek-ai/dsh-app-boot";

const NAME = "company-harness-runtime";
const fixedConfigPath = fileURLToPath(new URL("./cordis.yml", import.meta.url));
const requestedConfigPath = process.argv[2] ? resolve(process.argv[2]) : fixedConfigPath;
const production = process.env.NODE_ENV === "production";

if (production && requestedConfigPath !== fixedConfigPath) {
  throw new Error("company-harness-runtime: production composition override is forbidden");
}
if (!existsSync(requestedConfigPath)) {
  throw new Error(`company-harness-runtime: composition was not found: ${requestedConfigPath}`);
}

installFailLoud(NAME);
const ctx = await boot(NAME, requestedConfigPath);
let exiting = false;

async function disposeAndExit(code) {
  if (exiting) return;
  exiting = true;
  try {
    await ctx.fiber.dispose();
  } finally {
    process.exit(code);
  }
}

process.stdin.on("end", () => { void disposeAndExit(0); });
process.on("SIGTERM", () => { void disposeAndExit(0); });
process.on("SIGINT", () => { void disposeAndExit(130); });
