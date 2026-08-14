const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createPgPool,
  maskDatabaseUrl,
  resolveDatabaseUrl,
} = require("../src/db/postgres");

test("resolveDatabaseUrl prefers DATABASE_URL then POSTGRES_TARGET_URL", () => {
  assert.equal(resolveDatabaseUrl({}), null);
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: "postgres://a:b@localhost/db" }), "postgres://a:b@localhost/db");
  assert.equal(
    resolveDatabaseUrl({ POSTGRES_TARGET_URL: "postgres://t:u@localhost/target" }),
    "postgres://t:u@localhost/target",
  );
  assert.equal(
    resolveDatabaseUrl({
      DATABASE_URL: "postgres://primary",
      POSTGRES_TARGET_URL: "postgres://secondary",
    }),
    "postgres://primary",
  );
});

test("maskDatabaseUrl redacts credentials", () => {
  const masked = maskDatabaseUrl("postgres://alice:s3cret@db.example:5432/pm");
  assert.match(masked, /\*\*\*/);
  assert.doesNotMatch(masked, /s3cret/);
  assert.doesNotMatch(masked, /alice/);
});

test("maskDatabaseUrl omits query-string secrets and URL fragments", () => {
  const masked = maskDatabaseUrl(
    "postgres://alice:s3cret@db.example:5432/pm?password=query-secret&sslkey=private-key#fragment-secret",
  );
  assert.doesNotMatch(masked, /s3cret|alice|query-secret|private-key|fragment-secret/);
  assert.doesNotMatch(masked, /\?/);
  assert.doesNotMatch(masked, /#/);
});

test("createPgPool requires a connection string", () => {
  assert.throws(() => createPgPool({ env: {}, Pool: class {} }), /DATABASE_URL/);
});

test("createPgPool builds a pool with injected Pool constructor", async () => {
  const ended = [];
  class FakePool {
    constructor(options) {
      this.options = options;
      this.queries = [];
    }

    async query(sql) {
      this.queries.push(sql);
      return { rows: [{ ok: 1 }] };
    }

    async end() {
      ended.push(true);
    }
  }

  const handle = createPgPool({
    connectionString: "postgres://user:pass@localhost:5432/pm",
    env: {
      PG_POOL_MAX: "3",
      PG_IDLE_TIMEOUT_MS: "0",
      PG_CONNECTION_TIMEOUT_MS: "-1",
    },
    Pool: FakePool,
  });

  assert.equal(handle.dialect, "postgres");
  assert.equal(handle.pool.options.max, 3);
  assert.equal(handle.pool.options.idleTimeoutMillis, 0);
  assert.equal(handle.pool.options.connectionTimeoutMillis, 10_000);
  assert.match(handle.connectionStringMasked, /\*\*\*/);
  assert.equal(await handle.ping(), true);
  await handle.close();
  assert.equal(ended.length, 1);
});
