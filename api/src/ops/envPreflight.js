/**
 * Startup / deploy environment preflight for the API process.
 * Fail-closed in production for secrets and dangerous opt-ins.
 * Optionally validates SQLite parent-directory writability when DATABASE_FILE is set
 * (or defaultDatabaseFile is provided by the server entrypoint).
 */

const { preflightSqliteFilesystem } = require("./sqliteFsPreflight");

function isProduction(env = process.env) {
  return String(env.NODE_ENV || "development") === "production";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ defaultDatabaseFile?: string, checkFilesystem?: boolean }} [options]
 * @returns {{ ok: boolean, isProd: boolean, issues: Array<{ level: 'error'|'warn', code: string, message: string }>, databaseFile?: string|null }}
 */
function preflightEnv(env = process.env, options = {}) {
  const issues = [];
  const isProd = isProduction(env);
  const jwt = String(env.JWT_SECRET || "").trim();
  const aiKey = String(env.AI_CONFIG_ENCRYPTION_KEY || "").trim();
  const rateLimitTrustLocal = String(env.RATE_LIMIT_TRUST_LOCAL || "").trim();
  const seedAdminEmail = String(env.SEED_ADMIN_EMAIL || "").trim();
  const seedAdminPassword = String(env.SEED_ADMIN_PASSWORD || "");
  const port = Number(env.PORT || 4010);
  const dialect = String(env.DB_DIALECT || env.DATABASE_DIALECT || "sqlite").toLowerCase();
  const checkFilesystem = options.checkFilesystem !== false;

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    issues.push({ level: "error", code: "PORT_INVALID", message: "PORT must be an integer between 1 and 65535." });
  }

  if (jwt.length < 16) {
    issues.push({
      level: isProd ? "error" : "warn",
      code: "JWT_SECRET_WEAK",
      message: isProd
        ? "JWT_SECRET must be set (>= 16 chars) in production."
        : "JWT_SECRET is missing or shorter than 16 characters; using an insecure default is only for local development.",
    });
  }

  if (aiKey.length < 16) {
    issues.push({
      level: isProd ? "error" : "warn",
      code: "AI_CONFIG_ENCRYPTION_KEY_WEAK",
      message: isProd
        ? "AI_CONFIG_ENCRYPTION_KEY must be set (>= 16 chars) in production."
        : "AI_CONFIG_ENCRYPTION_KEY is missing or short; local development may fall back to JWT_SECRET.",
    });
  }

  if (jwt && aiKey && jwt === aiKey) {
    issues.push({
      level: isProd ? "error" : "warn",
      code: "SECRETS_REUSED",
      message: "AI_CONFIG_ENCRYPTION_KEY must not equal JWT_SECRET.",
    });
  }

  if (rateLimitTrustLocal === "1" && isProd) {
    issues.push({
      level: "error",
      code: "RATE_LIMIT_TRUST_LOCAL_IN_PROD",
      message: "RATE_LIMIT_TRUST_LOCAL=1 is not allowed in production.",
    });
  }

  let databaseFile = null;
  if (dialect === "postgres" || dialect === "postgresql") {
    const url = String(env.DATABASE_URL || env.POSTGRES_TARGET_URL || "").trim();
    if (!url) {
      issues.push({
        level: "error",
        code: "POSTGRES_URL_MISSING",
        message: "PostgreSQL dialect requires DATABASE_URL or POSTGRES_TARGET_URL.",
      });
    }
  } else if (env.DATABASE_FILE !== undefined && String(env.DATABASE_FILE).trim() === "") {
    issues.push({ level: "error", code: "DATABASE_FILE_EMPTY", message: "DATABASE_FILE is set but empty." });
  } else if (checkFilesystem) {
    const fsReport = preflightSqliteFilesystem(env, {
      defaultDatabaseFile: options.defaultDatabaseFile,
      isProd,
    });
    databaseFile = fsReport.databaseFile;
    for (const issue of fsReport.issues) issues.push(issue);
  }

  if (isProd && Boolean(seedAdminEmail) !== Boolean(seedAdminPassword)) {
    issues.push({
      level: "error",
      code: seedAdminEmail ? "SEED_ADMIN_PASSWORD_MISSING" : "SEED_ADMIN_EMAIL_MISSING",
      message: "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be provided together for first production startup.",
    });
  }

  if (isProd && seedAdminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(seedAdminEmail)) {
    issues.push({ level: "error", code: "SEED_ADMIN_EMAIL_INVALID", message: "SEED_ADMIN_EMAIL must be a valid email address." });
  }

  if (isProd && seedAdminPassword && seedAdminPassword.length < 12) {
    issues.push({
      level: "error",
      code: "SEED_ADMIN_PASSWORD_WEAK",
      message: "SEED_ADMIN_PASSWORD must contain at least 12 characters.",
    });
  }

  const productionDemoRoleSeeds = ["SEED_PM_PASSWORD", "SEED_DEV_PASSWORD", "SEED_QA_PASSWORD", "SEED_PDM_PASSWORD"]
    .filter((name) => String(env[name] || "").length > 0);
  if (isProd && productionDemoRoleSeeds.length > 0) {
    issues.push({
      level: "error",
      code: "DEMO_ROLE_SEED_IN_PROD",
      message: "Named demo role seed passwords are not allowed in production; create users from the administration UI.",
    });
  }

  if (isProd && String(env.SEED_DEMO_DATA || "") === "1") {
    issues.push({
      level: "error",
      code: "SEED_DEMO_IN_PROD",
      message: "SEED_DEMO_DATA=1 is not allowed in production.",
    });
  }

  if (isProd && String(env.ENABLE_HTTP_SHUTDOWN || "") === "1") {
    issues.push({
      level: "error",
      code: "HTTP_SHUTDOWN_IN_PROD",
      message: "ENABLE_HTTP_SHUTDOWN=1 is not allowed in production (Windows-only ops drill aid).",
    });
  }

  const errors = issues.filter((item) => item.level === "error");
  return {
    ok: errors.length === 0,
    isProd,
    issues,
    databaseFile,
  };
}

function formatPreflightReport(report) {
  const lines = [
    `Environment preflight: ${report.ok ? "PASS" : "FAIL"} (${report.isProd ? "production" : "non-production"})`,
  ];
  if (!report.issues.length) {
    lines.push("No issues.");
    return lines.join("\n");
  }
  for (const issue of report.issues) {
    lines.push(`- [${issue.level.toUpperCase()}] ${issue.code}: ${issue.message}`);
  }
  return lines.join("\n");
}

module.exports = {
  formatPreflightReport,
  isProduction,
  preflightEnv,
};
