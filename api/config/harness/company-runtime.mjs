#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { boot, installFailLoud } from "@deepseek-ai/dsh-app-boot";

const NAME = "company-harness-runtime";
const fixedConfigPath = fileURLToPath(new URL("./cordis.yml", import.meta.url));
const requestedConfigPath = process.argv[2] ? resolve(process.argv[2]) : fixedConfigPath;
const production = process.env.NODE_ENV === "production";
// Explicit operator opt-in (mirrors resolveHarnessPaths in the parent
// process): production pins cordis.yml unless HARNESS_ALLOW_COMPOSITION_VARIANTS=1
// opts into the composition variants (company-draft-v1 / company-review-v1).
const allowCompositionVariants = String(process.env.HARNESS_ALLOW_COMPOSITION_VARIANTS || "").trim() === "1";

if (production && requestedConfigPath !== fixedConfigPath && !allowCompositionVariants) {
  throw new Error("company-harness-runtime: production composition override is forbidden (explicit opt-in: HARNESS_ALLOW_COMPOSITION_VARIANTS=1)");
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
