const assert = require("node:assert/strict");
const test = require("node:test");
const {
  toPostgresParams,
  translateSqliteToPostgres,
  toPostgresQuery,
  buildUpsertSql,
  buildInsertSql,
} = require("../src/db/sql");

test("named @params become positional $n values in declaration order of appearance", () => {
  const { text, values } = toPostgresParams(
    "SELECT * FROM projects WHERE id = @id AND owner = @owner AND id <> @id",
    { id: "PRJ-1", owner: "Ada" },
  );
  assert.equal(text, "SELECT * FROM projects WHERE id = $1 AND owner = $2 AND id <> $1");
  assert.deepEqual(values, ["PRJ-1", "Ada"]);
});

test("missing named parameter throws", () => {
  assert.throws(() => toPostgresParams("SELECT @missing", {}), /Missing SQL parameter: @missing/);
});

test("array params map question-mark placeholders", () => {
  const { text, values } = toPostgresParams("SELECT * FROM t WHERE a = ? AND b = ?", [1, "x"]);
  assert.equal(text, "SELECT * FROM t WHERE a = $1 AND b = $2");
  assert.deepEqual(values, [1, "x"]);
});

test("BEGIN IMMEDIATE and datetime('now') translate for postgres", () => {
  const sql = translateSqliteToPostgres("BEGIN IMMEDIATE; SELECT datetime('now');");
  assert.match(sql, /BEGIN;/i);
  assert.doesNotMatch(sql, /IMMEDIATE/i);
  assert.match(sql, /NOW\(\) AT TIME ZONE 'utc'/i);
});

test("INSERT OR IGNORE becomes ON CONFLICT DO NOTHING", () => {
  const sql = translateSqliteToPostgres(
    "INSERT OR IGNORE INTO idempotency_keys (actor_id, operation, idempotency_key) VALUES (@a, @o, @k)",
  );
  assert.match(sql, /^INSERT INTO idempotency_keys/i);
  assert.match(sql, /ON CONFLICT DO NOTHING/i);
  assert.doesNotMatch(sql, /OR IGNORE/i);
});

test("INSERT OR REPLACE with id column becomes ON CONFLICT DO UPDATE", () => {
  const sql = translateSqliteToPostgres(
    "INSERT OR REPLACE INTO projects (id, value) VALUES (@id, @value)",
  );
  assert.match(sql, /INSERT INTO projects/i);
  assert.match(sql, /ON CONFLICT \(id\) DO UPDATE SET value = EXCLUDED\.value/i);
});

test("INSERT OR REPLACE into app_settings conflicts on key primary key", () => {
  const sql = translateSqliteToPostgres(
    "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
  );
  assert.match(sql, /INSERT INTO app_settings/i);
  assert.match(sql, /ON CONFLICT \(key\) DO UPDATE SET value = EXCLUDED\.value, updated_at = EXCLUDED\.updated_at/i);
  assert.doesNotMatch(sql, /ON CONFLICT \(id\)/i);
});

test("COLLATE NOCASE in ORDER BY becomes lower()", () => {
  const sql = translateSqliteToPostgres("SELECT * FROM users ORDER BY name COLLATE NOCASE");
  assert.match(sql, /ORDER BY lower\(name\)/i);
  assert.doesNotMatch(sql, /COLLATE\s+NOCASE/i);
});

test("PRAGMA lines are stripped for postgres", () => {
  const sql = translateSqliteToPostgres("PRAGMA journal_mode = WAL;\nCREATE TABLE t (id TEXT);");
  assert.doesNotMatch(sql, /PRAGMA/i);
  assert.match(sql, /CREATE TABLE t/i);
});

test("toPostgresQuery combines translation and params", () => {
  const { text, values } = toPostgresQuery(
    "INSERT OR IGNORE INTO t (id) VALUES (@id)",
    { id: "1" },
  );
  assert.match(text, /\$1/);
  assert.match(text, /ON CONFLICT DO NOTHING/i);
  assert.deepEqual(values, ["1"]);
});

test("buildUpsertSql emits dialect-specific insert forms", () => {
  const sqlite = buildUpsertSql("items", ["id", "name"], { dialect: "sqlite" });
  assert.match(sqlite.sql, /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(sqlite.sql, /@id/);

  const postgres = buildUpsertSql("items", ["id", "name"], { dialect: "postgres" });
  assert.match(postgres.sql, /INSERT INTO items/);
  assert.match(postgres.sql, /\$1/);
  assert.match(postgres.sql, /ON CONFLICT \(id\) DO UPDATE SET name = EXCLUDED\.name/);

  const settings = buildUpsertSql("app_settings", ["key", "value"], { dialect: "postgres" });
  assert.equal(settings.conflictTarget, "key");
  assert.match(settings.sql, /ON CONFLICT \(key\) DO UPDATE SET value = EXCLUDED\.value/);
});

test("buildUpsertSql supports composite natural keys and immutable columns", () => {
  const columns = ["id", "user_id", "period_start", "period_end", "value", "created_at"];
  const options = {
    conflictTarget: ["user_id", "period_start", "period_end"],
    excludeUpdateColumns: ["id", "created_at"],
  };
  const sqlite = buildUpsertSql("capacity_plans", columns, { dialect: "sqlite", ...options });
  assert.deepEqual(sqlite.conflictTarget, ["user_id", "period_start", "period_end"]);
  assert.match(sqlite.sql, /ON CONFLICT \(user_id, period_start, period_end\) DO UPDATE SET value = excluded\.value/);
  assert.doesNotMatch(sqlite.sql, /id = excluded\.id|created_at = excluded\.created_at/);

  const postgres = buildUpsertSql("capacity_plans", columns, { dialect: "postgres", ...options });
  assert.match(postgres.sql, /ON CONFLICT \(user_id, period_start, period_end\) DO UPDATE SET value = EXCLUDED\.value/);
  assert.doesNotMatch(postgres.sql, /id = EXCLUDED\.id|created_at = EXCLUDED\.created_at/);
  assert.throws(
    () => buildUpsertSql("items", ["id", "value"], { conflictTarget: ["missing"] }),
    /conflictTarget/,
  );
  assert.throws(
    () => buildUpsertSql("items", ["id", "value"], { excludeUpdateColumns: ["missing"] }),
    /excludeUpdateColumns/,
  );
});

test("buildInsertSql emits strict inserts and rejects unsafe identifiers", () => {
  assert.equal(buildInsertSql("items", ["id", "name"], { dialect: "sqlite" }).sql, "INSERT INTO items (id, name) VALUES (@id, @name)");
  assert.equal(buildInsertSql("items", ["id", "name"], { dialect: "postgres" }).sql, "INSERT INTO items (id, name) VALUES ($1, $2)");
  assert.throws(() => buildInsertSql("items; DROP TABLE items", ["id"]), /safe SQL identifiers/);
});
