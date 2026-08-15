const fs = require("node:fs");
const path = require("node:path");
const { COMPANY_RUNTIME_COMPOSITION } = require("./harnessRuntime");

// The composition manifest embeds js-yaml `!!js` custom tags, so it is not
// parsed with a YAML loader. Top-level plugin entries start at column zero as
// `- id: <id>` followed by `  name: <source>`; indented entries such as the
// per-model descriptors under llm-company must stay excluded.
const TOP_LEVEL_ENTRY = /^- id:\s*(.+?)\s*$/;
const NAME_LINE = /^\s+name:\s*(.+?)\s*$/;
const NEXT_ENTRY = /^- /;

function unquote(value) {
  const text = String(value || "").trim();
  if (text.length > 1 && ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))) {
    return text.slice(1, -1);
  }
  return text;
}

function parseCompositionPlugins(source) {
  const plugins = [];
  const lines = String(source || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const entry = TOP_LEVEL_ENTRY.exec(lines[index]);
    if (!entry) continue;
    const id = unquote(entry[1]);
    let name = "";
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (NEXT_ENTRY.test(lines[scan])) break;
      if (!name) {
        const nameLine = NAME_LINE.exec(lines[scan]);
        if (nameLine) name = unquote(nameLine[1]);
      }
    }
    if (!id || id.includes("!!js") || name.includes("!!js")) continue;
    plugins.push({
      id,
      name,
      kind: name.startsWith("./") ? "company" : "builtin",
    });
  }
  return plugins;
}

const compositionCache = new Map();

function resolveApiRoot(apiRoot) {
  return path.resolve(apiRoot || path.resolve(__dirname, "..", "..", ".."));
}

/**
 * Public composition summary for the fixed company runtime manifest.
 * Cached per config path and refreshed when the file mtime changes; a missing
 * or unreadable manifest yields an empty plugin list instead of throwing so
 * the status endpoint stays available.
 */
function readCompositionSummary({ apiRoot, fsImpl = fs } = {}) {
  const configPath = path.join(resolveApiRoot(apiRoot), "config", "harness", "cordis.yml");
  let mtimeMs = -1;
  try {
    mtimeMs = fsImpl.statSync(configPath).mtimeMs;
  } catch {
    mtimeMs = -1;
  }
  const cached = compositionCache.get(configPath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.summary;
  let plugins = [];
  try {
    plugins = parseCompositionPlugins(fsImpl.readFileSync(configPath, "utf8"));
  } catch {
    plugins = [];
  }
  const summary = { id: COMPANY_RUNTIME_COMPOSITION, plugins };
  compositionCache.set(configPath, { mtimeMs, summary });
  return summary;
}

let sdkVersionCache;

/**
 * Best-effort dsh SDK client version: package exports first, then a direct
 * node_modules file read (workspace hoisting), then null. Never throws so the
 * harness status endpoint cannot fail because of package exports.
 */
function readSdkVersion({ apiRoot, fsImpl = fs } = {}) {
  if (sdkVersionCache !== undefined) return sdkVersionCache;
  sdkVersionCache = null;
  try {
    const version = require("@deepseek-ai/dsh-sdk-client/package.json").version;
    if (typeof version === "string" && version.trim()) sdkVersionCache = version.trim();
  } catch {
    sdkVersionCache = null;
  }
  if (sdkVersionCache) return sdkVersionCache;
  const root = resolveApiRoot(apiRoot);
  for (const candidate of [
    path.join(root, "node_modules", "@deepseek-ai", "dsh-sdk-client", "package.json"),
    path.join(root, "..", "node_modules", "@deepseek-ai", "dsh-sdk-client", "package.json"),
  ]) {
    try {
      const version = JSON.parse(fsImpl.readFileSync(candidate, "utf8")).version;
      if (typeof version === "string" && version.trim()) {
        sdkVersionCache = version.trim();
        return sdkVersionCache;
      }
    } catch {
      // Try the next hoisted node_modules location.
    }
  }
  return sdkVersionCache;
}

module.exports = {
  parseCompositionPlugins,
  readCompositionSummary,
  readSdkVersion,
};
