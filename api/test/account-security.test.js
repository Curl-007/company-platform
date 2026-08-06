const assert = require("node:assert/strict");
const test = require("node:test");
const { validatePassword } = require("../src/lib/accountSecurity");
const { isUniqueConstraintError } = require("../src/lib/databaseErrors");

test("password policy requires 12 to 128 characters", () => {
  assert.match(validatePassword(""), /12/);
  assert.match(validatePassword("short"), /12/);
  assert.equal(validatePassword("valid-pass-12"), null);
  assert.equal(validatePassword("x".repeat(128)), null);
  assert.match(validatePassword("x".repeat(129)), /128/);
});

test("unique constraint detection covers SQLite and PostgreSQL without matching unrelated errors", () => {
  assert.equal(isUniqueConstraintError({ code: "SQLITE_CONSTRAINT_UNIQUE" }), true);
  assert.equal(isUniqueConstraintError({ code: "SQLITE_CONSTRAINT", message: "UNIQUE constraint failed: users.email" }), true);
  assert.equal(isUniqueConstraintError({ code: "23505" }), true);
  assert.equal(isUniqueConstraintError({ code: "SQLITE_BUSY", message: "database is locked" }), false);
});
