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

function createProjectSourceBrowser({ fs, path }) {
  function isPathWithinBase(basePath, targetPath) {
    const baseReal = fs.realpathSync.native(basePath);
    const targetReal = fs.realpathSync.native(targetPath);
    const compareBase = process.platform === "win32" ? baseReal.toLowerCase() : baseReal;
    const compareTarget = process.platform === "win32" ? targetReal.toLowerCase() : targetReal;
    const relative = path.relative(compareBase, compareTarget);
    return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
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
    if (!basePath) throw sourceError("SOURCE_PATH_NOT_CONFIGURED", "Project source_path not set.", 400);
    if (!fs.existsSync(basePath)) throw sourceError("SOURCE_PATH_NOT_FOUND", `Source path does not exist: ${basePath}`, 404);
    const relativePath = String(requestedPath || "").replace(/^\/+/, "");
    const absolutePath = path.resolve(basePath, relativePath);
    if (!fs.existsSync(absolutePath)) throw sourceError("FILE_NOT_FOUND", `Path not found: ${relativePath}`, 404);
    if (!isPathWithinBase(basePath, absolutePath)) throw sourceError("PATH_TRAVERSAL_DETECTED", "Access denied.", 403);
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      const items = fs.readdirSync(absolutePath, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith(".") && !HIDDEN_DIRS.has(entry.name))
        .sort((left, right) => (left.isDirectory() === right.isDirectory() ? left.name.localeCompare(right.name) : left.isDirectory() ? -1 : 1))
        .map((entry) => ({ name: entry.name, path: relativePath ? `${relativePath}/${entry.name}` : entry.name, type: entry.isDirectory() ? "dir" : "file" }));
      return items;
    }
    if (!includeContent) return { name: path.basename(absolutePath), path: relativePath, type: "file" };
    const readSize = Math.min(stat.size, MAX_FILE_SIZE);
    let buffer;
    if (stat.size > MAX_FILE_SIZE) {
      const descriptor = fs.openSync(absolutePath, "r");
      try {
        buffer = Buffer.alloc(readSize);
        fs.readSync(descriptor, buffer, 0, readSize, 0);
      } finally {
        fs.closeSync(descriptor);
      }
    } else {
      buffer = fs.readFileSync(absolutePath);
    }
    if (isBinary(buffer)) throw sourceError("BINARY_FILE", "Cannot display binary file.", 400);
    const lines = buffer.toString("utf8").split("\n").slice(0, MAX_LINES);
    return { content: lines.join("\n"), language: guessLanguage(absolutePath), truncated: stat.size > MAX_FILE_SIZE || lines.length >= MAX_LINES, lineCount: lines.length };
  }

  return { browse };
}

module.exports = { createProjectSourceBrowser };
