/**
 * Project source_path policy for P0-1:
 * - only admin may configure source_path
 * - configured path must resolve under an allowlisted root
 * - browse rejects symlink escapes, hidden/sensitive names, absolute path injection
 */

const DEFAULT_SENSITIVE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".git",
  ".svn",
  ".hg",
  "id_rsa",
  "id_dsa",
  "id_ed25519",
  "id_ecdsa",
  "authorized_keys",
  "known_hosts",
  "credentials",
  "secrets",
  "private.key",
  "server.key",
  "keystore",
  "truststore",
]);

const SENSITIVE_SUFFIXES = [
  ".pem",
  ".p12",
  ".pfx",
  ".key",
  ".jks",
  ".kdbx",
];

function sourcePolicyError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/**
 * Parse allowlist from env: SOURCE_PATH_ALLOWLIST or SOURCE_ROOT_ALLOWLIST
 * (semicolon / comma / path-delimiter separated absolute roots).
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ path?: typeof import("node:path"), fs?: typeof import("node:fs") }} [deps]
 */
function parseSourcePathAllowlist(env = process.env, deps = {}) {
  const path = deps.path || require("node:path");
  const fs = deps.fs || require("node:fs");
  const raw = String(env.SOURCE_PATH_ALLOWLIST || env.SOURCE_ROOT_ALLOWLIST || "").trim();
  if (!raw) return [];
  const parts = raw.split(/[;,\n|]/).map((item) => item.trim()).filter(Boolean);
  const roots = [];
  for (const part of parts) {
    try {
      const resolved = path.resolve(part);
      if (fs.existsSync(resolved)) {
        roots.push(fs.realpathSync.native(resolved));
      } else {
        roots.push(resolved);
      }
    } catch {
      roots.push(path.resolve(part));
    }
  }
  return roots;
}

function normalizeComparePath(value, path) {
  const normalized = path.normalize(String(value || ""));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * @param {string} candidate
 * @param {string[]} allowlist
 * @param {{ path?: typeof import("node:path"), fs?: typeof import("node:fs") }} [deps]
 */
function isPathUnderAllowlist(candidate, allowlist, deps = {}) {
  const path = deps.path || require("node:path");
  const fs = deps.fs || require("node:fs");
  if (!allowlist.length) return false;
  let target;
  try {
    target = fs.existsSync(candidate)
      ? fs.realpathSync.native(path.resolve(candidate))
      : path.resolve(candidate);
  } catch {
    target = path.resolve(candidate);
  }
  const compareTarget = normalizeComparePath(target, path);
  return allowlist.some((root) => {
    const compareRoot = normalizeComparePath(root, path);
    const relative = path.relative(compareRoot, compareTarget);
    return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

function isSensitiveFileName(name) {
  const base = String(name || "").trim();
  if (!base) return true;
  if (base.startsWith(".")) return true;
  const lower = base.toLowerCase();
  if (DEFAULT_SENSITIVE_NAMES.has(lower) || DEFAULT_SENSITIVE_NAMES.has(base)) return true;
  return SENSITIVE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/**
 * Validate and normalize a source_path for persistence (admin-only call site).
 * @param {unknown} sourcePath
 * @param {{ allowlist?: string[], path?: any, fs?: any, requireAllowlist?: boolean }} [options]
 */
function assertConfigurableSourcePath(sourcePath, options = {}) {
  const path = options.path || require("node:path");
  const fs = options.fs || require("node:fs");
  if (sourcePath === undefined) return undefined;
  if (sourcePath === null || sourcePath === "") return null;
  const raw = String(sourcePath).trim();
  if (!raw) return null;
  if (!path.isAbsolute(raw)) {
    throw sourcePolicyError("SOURCE_PATH_MUST_BE_ABSOLUTE", "sourcePath must be an absolute path under the allowlist.", 400);
  }
  const allowlist = options.allowlist || parseSourcePathAllowlist(process.env, { path, fs });
  const requireAllowlist = options.requireAllowlist !== false;
  if (requireAllowlist && allowlist.length === 0) {
    throw sourcePolicyError(
      "SOURCE_PATH_ALLOWLIST_REQUIRED",
      "SOURCE_PATH_ALLOWLIST is not configured; refuse to set sourcePath.",
      400,
    );
  }
  const resolved = path.resolve(raw);
  if (!isPathUnderAllowlist(resolved, allowlist, { path, fs })) {
    throw sourcePolicyError(
      "SOURCE_PATH_OUTSIDE_ALLOWLIST",
      "sourcePath is outside the configured SOURCE_PATH_ALLOWLIST.",
      403,
    );
  }
  // Reject if path exists and is a symlink escape relative to its parent allow root
  try {
    if (fs.existsSync(resolved)) {
      const real = fs.realpathSync.native(resolved);
      if (!isPathUnderAllowlist(real, allowlist, { path, fs })) {
        throw sourcePolicyError("SOURCE_PATH_SYMLINK_ESCAPE", "sourcePath resolves outside the allowlist.", 403);
      }
      return real;
    }
  } catch (error) {
    if (error && error.code && String(error.code).startsWith("SOURCE_")) throw error;
  }
  return resolved;
}

/**
 * Only admin may configure project source_path.
 * @param {{ role?: string } | null | undefined} user
 */
function canConfigureSourcePath(user) {
  return Boolean(user && user.role === "admin");
}

module.exports = {
  assertConfigurableSourcePath,
  canConfigureSourcePath,
  isPathUnderAllowlist,
  isSensitiveFileName,
  parseSourcePathAllowlist,
  sourcePolicyError,
};
