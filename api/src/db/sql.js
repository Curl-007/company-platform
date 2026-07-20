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
function translateSqliteToPostgres(sql) {
  let text = String(sql || "");

  // Exclusive transaction start is not used on PG.
  text = text.replace(/\bBEGIN\s+IMMEDIATE\b/gi, "BEGIN");

  // Prefer application-layer now(); still normalize common SQLite default.
  text = text.replace(/datetime\s*\(\s*'now'\s*\)/gi, "(NOW() AT TIME ZONE 'utc')");
  text = text.replace(/datetime\s*\(\s*"now"\s*\)/gi, "(NOW() AT TIME ZONE 'utc')");

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
  // Assumes primary key on first identity column "id" when present in column list.
  const orReplace = text.match(
    /^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*;?\s*$/i,
  );
  if (orReplace) {
    const table = orReplace[1];
    const cols = orReplace[2].split(",").map((c) => c.trim());
    const vals = orReplace[3];
    const conflictTarget = cols.includes("id") ? "id" : cols[0];
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
function buildUpsertSql(table, columns, { dialect = "sqlite", conflictTarget = "id" } = {}) {
  const cols = columns.map((c) => String(c));
  const placeholders = cols.map((c) => (dialect === "postgres" ? null : `@${c}`));
  if (dialect === "sqlite") {
    return {
      sql: `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
      paramsStyle: "named",
    };
  }

  const values = cols.map((_, i) => `$${i + 1}`);
  const assignments = cols
    .filter((c) => c !== conflictTarget)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  const updateClause = assignments
    ? ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${assignments}`
    : ` ON CONFLICT (${conflictTarget}) DO NOTHING`;
  return {
    sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${values.join(", ")})${updateClause}`,
    paramsStyle: "positional",
  };
}

module.exports = {
  toPostgresParams,
  translateSqliteToPostgres,
  toPostgresQuery,
  buildUpsertSql,
};
