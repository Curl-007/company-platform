/**
 * SQL dialect helpers (W2 Wave 2).
 *
 * Translates the as-built SQLite-oriented SQL surface into PostgreSQL-compatible
 * text and $n parameters. Does not open connections.
 */

const NAMED_PARAM = /@([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Convert @name placeholders to positional $1..$n for node-postgres.
 * Returns { text, values } where values is an ordered array.
 *
 * Supports plain objects for named params. Arrays are treated as already-ordered
 * positional values for ? placeholders only.
 */
function toPostgresParams(sql, params) {
  const source = String(sql || "");
  if (params == null) {
    return { text: source, values: [] };
  }

  if (Array.isArray(params)) {
    let index = 0;
    const text = source.replace(/\?/g, () => {
      index += 1;
      return `$${index}`;
    });
    return { text, values: params };
  }

  if (typeof params !== "object") {
    throw new Error("SQL params must be an object, array, or null.");
  }

  const values = [];
  const nameToIndex = new Map();
  const text = source.replace(NAMED_PARAM, (_match, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      throw new Error(`Missing SQL parameter: @${name}`);
    }
    if (!nameToIndex.has(name)) {
      values.push(params[name]);
      nameToIndex.set(name, values.length);
    }
    return `$${nameToIndex.get(name)}`;
  });

  return { text, values };
}

/**
 * Translate a limited set of SQLite-only constructs into PostgreSQL.
 * Table/column structure is assumed portable (TEXT/INTEGER, no PRAGMA).
 */
/**
 * Pick ON CONFLICT target for INSERT OR REPLACE.
 * Prefer known identity columns: id, then job_id, then key, else first column.
 * app_settings uses PK = key (not id); ai_jobs uses job_id.
 */
function resolveReplaceConflictTarget(table, columns) {
  const cols = columns.map((c) => String(c).trim());
  const tableName = String(table || "").toLowerCase();
  if (tableName === "app_settings" && cols.includes("key")) return "key";
  if (tableName === "ai_jobs" && cols.includes("job_id")) return "job_id";
  if (cols.includes("id")) return "id";
  if (cols.includes("job_id")) return "job_id";
  if (cols.includes("key")) return "key";
  return cols[0];
}

function translateSqliteToPostgres(sql) {
  let text = String(sql || "");

  // Exclusive transaction start is not used on PG.
  text = text.replace(/\bBEGIN\s+IMMEDIATE\b/gi, "BEGIN");

  // Prefer application-layer now(); still normalize common SQLite default.
  text = text.replace(/datetime\s*\(\s*'now'\s*\)/gi, "(NOW() AT TIME ZONE 'utc')");
  text = text.replace(/datetime\s*\(\s*"now"\s*\)/gi, "(NOW() AT TIME ZONE 'utc')");

  // Case-insensitive ordering: SQLite COLLATE NOCASE → PostgreSQL lower(...).
  // Handles "ORDER BY name COLLATE NOCASE" and multi-column forms.
  text = text.replace(
    /\bORDER\s+BY\s+((?:[^;]+?)\s+COLLATE\s+NOCASE(?:\s*,\s*(?:[^;]+?))*)/gi,
    (match, orderList) => {
      const rewritten = String(orderList)
        .split(",")
        .map((part) => {
          const piece = part.trim();
          const collated = piece.match(/^(.+?)\s+COLLATE\s+NOCASE(\s+(ASC|DESC))?$/i);
          if (!collated) return piece;
          const expr = collated[1].trim();
          const dir = collated[3] ? ` ${collated[3].toUpperCase()}` : "";
          return `lower(${expr})${dir}`;
        })
        .join(", ");
      return `ORDER BY ${rewritten}`;
    },
  );
  // Remaining bare COLLATE NOCASE (e.g. WHERE name COLLATE NOCASE = ...).
  text = text.replace(/\s+COLLATE\s+NOCASE\b/gi, "");

  // INSERT OR IGNORE INTO t (...) VALUES (...)
  text = text.replace(
    /\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi,
    "INSERT INTO",
  );
  if (/\bINSERT\s+INTO\b/i.test(text) && /OR\s+IGNORE/i.test(String(sql || ""))) {
    // Only append DO NOTHING when we rewrote OR IGNORE and no conflict clause yet.
    if (!/\bON\s+CONFLICT\b/i.test(text)) {
      text = text.replace(/;?\s*$/, " ON CONFLICT DO NOTHING");
    }
  }

  // INSERT OR REPLACE INTO t (cols) VALUES (...)
  // Prefer id, then job_id, then key (app_settings), else first column.
  const orReplace = text.match(
    /^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*;?\s*$/i,
  );
  if (orReplace) {
    const table = orReplace[1];
    const cols = orReplace[2].split(",").map((c) => c.trim());
    const vals = orReplace[3];
    const conflictTarget = resolveReplaceConflictTarget(table, cols);
    const assignments = cols
      .filter((c) => c !== conflictTarget)
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(", ");
    const updateClause = assignments
      ? ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${assignments}`
      : ` ON CONFLICT (${conflictTarget}) DO NOTHING`;
    text = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals})${updateClause}`;
  } else if (/\bINSERT\s+OR\s+REPLACE\b/i.test(text)) {
    // Non-trivial OR REPLACE forms: strip OR REPLACE and require caller to use helper buildUpsert.
    text = text.replace(/\bINSERT\s+OR\s+REPLACE\b/gi, "INSERT");
  }

  // PRAGMA statements are SQLite-only — drop for postgres dialect translation.
  text = text
    .split("\n")
    .filter((line) => !/^\s*PRAGMA\b/i.test(line))
    .join("\n");

  return text;
}

/**
 * Full pipeline: SQLite-flavored SQL + named params → pg query args.
 */
function toPostgresQuery(sql, params) {
  const translated = translateSqliteToPostgres(sql);
  return toPostgresParams(translated, params);
}

/**
 * Build a portable upsert for dynamic insert(table, row) helpers.
 */
function buildUpsertSql(table, columns, {
  dialect = "sqlite",
  conflictTarget,
  excludeUpdateColumns = [],
} = {}) {
  const tableName = String(table || "");
  const cols = columns.map((c) => String(c));
  const safeIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (!safeIdentifier.test(tableName) || !cols.length || cols.some((column) => !safeIdentifier.test(column))) {
    throw new Error("Dynamic upsert requires safe SQL identifiers and at least one column.");
  }
  const rawTarget = conflictTarget == null
    ? [resolveReplaceConflictTarget(tableName, cols)]
    : Array.isArray(conflictTarget)
      ? conflictTarget
      : [conflictTarget];
  const targetColumns = rawTarget.map((column) => String(column));
  if (!targetColumns.length || targetColumns.some((column) => !safeIdentifier.test(column) || !cols.includes(column))) {
    throw new Error("Upsert conflictTarget must contain inserted column names.");
  }
  if (!Array.isArray(excludeUpdateColumns)) {
    throw new Error("Upsert excludeUpdateColumns must be an array.");
  }
  const excludedColumns = excludeUpdateColumns.map((column) => String(column));
  if (excludedColumns.some((column) => !safeIdentifier.test(column) || !cols.includes(column))) {
    throw new Error("Upsert excludeUpdateColumns must contain inserted column names.");
  }
  const placeholders = cols.map((c) => (dialect === "postgres" ? null : `@${c}`));
  const target = targetColumns.length === 1 ? targetColumns[0] : targetColumns;
  const conflictSql = targetColumns.join(", ");
  const updateExclusions = new Set([...targetColumns, ...excludedColumns]);
  if (dialect === "sqlite") {
    const assignments = cols
      .filter((column) => !updateExclusions.has(column))
      .map((column) => `${column} = excluded.${column}`)
      .join(", ");
    const updateClause = assignments
      ? ` ON CONFLICT (${conflictSql}) DO UPDATE SET ${assignments}`
      : ` ON CONFLICT (${conflictSql}) DO NOTHING`;
    return {
      sql: `INSERT INTO ${tableName} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})${updateClause}`,
      paramsStyle: "named",
      conflictTarget: target,
    };
  }

  const values = cols.map((_, i) => `$${i + 1}`);
  const assignments = cols
    .filter((column) => !updateExclusions.has(column))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  const updateClause = assignments
    ? ` ON CONFLICT (${conflictSql}) DO UPDATE SET ${assignments}`
    : ` ON CONFLICT (${conflictSql}) DO NOTHING`;
  return {
    sql: `INSERT INTO ${tableName} (${cols.join(", ")}) VALUES (${values.join(", ")})${updateClause}`,
    paramsStyle: "positional",
    conflictTarget: target,
  };
}

function buildInsertSql(table, columns, { dialect = "sqlite" } = {}) {
  const tableName = String(table || "");
  const cols = columns.map((column) => String(column));
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName) || cols.some((column) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(column))) {
    throw new Error("Dynamic insert requires safe SQL identifiers.");
  }
  const placeholders = dialect === "postgres"
    ? cols.map((_, index) => `$${index + 1}`)
    : cols.map((column) => `@${column}`);
  return {
    sql: `INSERT INTO ${tableName} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
    paramsStyle: dialect === "postgres" ? "positional" : "named",
  };
}

module.exports = {
  toPostgresParams,
  translateSqliteToPostgres,
  toPostgresQuery,
  buildInsertSql,
  buildUpsertSql,
  resolveReplaceConflictTarget,
};
