const { isPathUnderAllowlist, isSensitiveFileName, parseSourcePathAllowlist } = require("./sourcePathPolicy");

const HIDDEN_DIRS = new Set(["node_modules", ".git", ".svn", ".hg", ".DS_Store", ".cache"]);
const MAX_FILE_SIZE = 1024 * 1024;
const MAX_LINES = 5000;
const EXT_LANGUAGE_MAP = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python", java: "java", rb: "ruby", go: "go", rs: "rust",
  c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp", php: "php", swift: "swift", kt: "kotlin", scala: "scala",
  html: "html", css: "css", scss: "scss", less: "less", json: "json", xml: "xml", yaml: "yaml", yml: "yaml",
  md: "markdown", sql: "sql", sh: "bash", bash: "bash", dockerfile: "dockerfile", vue: "vue", svelte: "svelte",
};

function sourceError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function createProjectSourceBrowser({ fs, path, env = process.env, allowlist: allowlistOverride } = {}) {
  function allowlist() {
    return allowlistOverride || parseSourcePathAllowlist(env, { fs, path });
  }

  function isPathWithinBase(basePath, targetPath) {
    const baseReal = fs.realpathSync.native(basePath);
    const targetReal = fs.realpathSync.native(targetPath);
    const compareBase = process.platform === "win32" ? baseReal.toLowerCase() : baseReal;
    const compareTarget = process.platform === "win32" ? targetReal.toLowerCase() : targetReal;
    const relative = path.relative(compareBase, compareTarget);
    return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  }

  function assertBaseConfigured(basePath) {
    if (!basePath) throw sourceError("SOURCE_PATH_NOT_CONFIGURED", "Project source_path not set.", 400);
    const roots = allowlist();
    if (roots.length === 0) {
      throw sourceError("SOURCE_PATH_ALLOWLIST_REQUIRED", "SOURCE_PATH_ALLOWLIST is not configured.", 503);
    }
    if (!isPathUnderAllowlist(basePath, roots, { fs, path })) {
      throw sourceError("SOURCE_PATH_OUTSIDE_ALLOWLIST", "Project source_path is outside the allowlist.", 403);
    }
  }

  function isBinary(buffer) {
    for (let index = 0; index < Math.min(buffer.length, 8192); index += 1) {
      if (buffer[index] === 0) return true;
    }
    return false;
  }
  function guessLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
    if (path.basename(filePath).toLowerCase() === "dockerfile") return "dockerfile";
    return ext ? EXT_LANGUAGE_MAP[ext] || "text" : "text";
  }

  function browse(basePath, requestedPath = "", includeContent = false) {
    assertBaseConfigured(basePath);
    if (!fs.existsSync(basePath)) throw sourceError("SOURCE_PATH_NOT_FOUND", `Source path does not exist: ${basePath}`, 404);
    const relativePath = String(requestedPath || "").replace(/^\/+/, "").replace(/\\/g, "/");
    if (path.isAbsolute(relativePath) || relativePath.includes("\0")) {
      throw sourceError("PATH_TRAVERSAL_DETECTED", "Access denied.", 403);
    }
    const segments = relativePath ? relativePath.split("/").filter(Boolean) : [];
    for (const segment of segments) {
      if (segment === ".." || segment === ".") {
        throw sourceError("PATH_TRAVERSAL_DETECTED", "Access denied.", 403);
      }
      if (isSensitiveFileName(segment) || HIDDEN_DIRS.has(segment)) {
        throw sourceError("SENSITIVE_PATH_DENIED", "Access to hidden or sensitive paths is denied.", 403);
      }
    }
    const baseReal = fs.realpathSync.native(basePath);
    const absolutePath = path.resolve(baseReal, relativePath);
    if (!fs.existsSync(absolutePath)) throw sourceError("FILE_NOT_FOUND", `Path not found: ${relativePath}`, 404);
    let targetReal;
    try {
      targetReal = fs.realpathSync.native(absolutePath);
    } catch {
      throw sourceError("PATH_TRAVERSAL_DETECTED", "Access denied.", 403);
    }
    if (!isPathWithinBase(baseReal, targetReal)) throw sourceError("PATH_TRAVERSAL_DETECTED", "Access denied.", 403);
    if (!isPathUnderAllowlist(targetReal, allowlist(), { fs, path })) {
      throw sourceError("SOURCE_PATH_OUTSIDE_ALLOWLIST", "Resolved path is outside the allowlist.", 403);
    }
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      // realpath already validated target; still refuse listing through odd link types at leaf
      if (!isPathWithinBase(baseReal, targetReal)) throw sourceError("PATH_TRAVERSAL_DETECTED", "Access denied.", 403);
    }
    const finalStat = fs.statSync(targetReal);
    if (finalStat.isDirectory()) {
      const items = fs.readdirSync(targetReal, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith(".") && !HIDDEN_DIRS.has(entry.name) && !isSensitiveFileName(entry.name))
        .sort((left, right) => (left.isDirectory() === right.isDirectory() ? left.name.localeCompare(right.name) : left.isDirectory() ? -1 : 1))
        .map((entry) => ({ name: entry.name, path: relativePath ? `${relativePath}/${entry.name}` : entry.name, type: entry.isDirectory() ? "dir" : "file" }));
      return items;
    }
    if (isSensitiveFileName(path.basename(targetReal))) {
      throw sourceError("SENSITIVE_PATH_DENIED", "Access to sensitive files is denied.", 403);
    }
    if (!includeContent) return { name: path.basename(targetReal), path: relativePath, type: "file" };
    const readSize = Math.min(finalStat.size, MAX_FILE_SIZE);
    let buffer;
    if (finalStat.size > MAX_FILE_SIZE) {
      const descriptor = fs.openSync(targetReal, "r");
      try {
        buffer = Buffer.alloc(readSize);
        fs.readSync(descriptor, buffer, 0, readSize, 0);
      } finally {
        fs.closeSync(descriptor);
      }
    } else {
      buffer = fs.readFileSync(targetReal);
    }
    if (isBinary(buffer)) throw sourceError("BINARY_FILE", "Cannot display binary file.", 400);
    const lines = buffer.toString("utf8").split("\n").slice(0, MAX_LINES);
    return { content: lines.join("\n"), language: guessLanguage(targetReal), truncated: finalStat.size > MAX_FILE_SIZE || lines.length >= MAX_LINES, lineCount: lines.length };
  }

  return { browse };
}

module.exports = { createProjectSourceBrowser };
