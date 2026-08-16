const assert = require("node:assert/strict");
const test = require("node:test");
const { createAuthService } = require("../src/modules/auth/service");

test("auth service never accepts invalid credentials and prevents duplicate profile email", async () => {
  const users = [
    { id: "USR-001", name: "Alice", email: "alice@example.com", password_hash: "hash", status: "active", role: "dev" },
    { id: "USR-002", name: "Bob", email: "bob@example.com", password_hash: "hash", status: "active", role: "pm" },
  ];
  const repository = {
    findByEmail: (email) => users.find((user) => user.email === email),
    findById: (id) => users.find((user) => user.id === id),
    findOtherByEmail: (email, id) => users.find((user) => user.email === email && user.id !== id),
    updateProfile: (id, profile) => {
      const user = users.find((item) => item.id === id);
      Object.assign(user, profile);
      return user;
    },
  };
  const service = createAuthService({
    comparePassword: (password, hash) => password === "correct" && hash === "hash",
    issueToken: (user) => `token-${user.id}`,
    publicUser: (user) => ({ id: user.id, email: user.email, name: user.name }),
    repository,
  });

  await assert.rejects(() => service.login({ email: "alice@example.com", password: "wrong" }), { code: "INVALID_CREDENTIALS" });
  await assert.rejects(() => service.login({ email: "alice@example.com", password: "" }), { code: "INVALID_CREDENTIALS" });
  assert.deepEqual(await service.login({ email: "alice@example.com", password: "correct" }), {
    token: "token-USR-001",
    user: { id: "USR-001", email: "alice@example.com", name: "Alice" },
  });
  await assert.rejects(() => service.updateProfile("USR-001", { email: "bob@example.com" }), { code: "CONFLICT" });
  const update = await service.updateProfile("USR-001", { name: "  Alice Updated ", email: "new@example.com" });
  assert.equal(update.after.name, "Alice Updated");
  assert.equal(update.after.email, "new@example.com");
});

test("auth service maps database unique violations during profile update to conflict", async () => {
  for (const databaseError of [
    Object.assign(new Error("UNIQUE constraint failed: users.email"), { code: "SQLITE_CONSTRAINT_UNIQUE" }),
    Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }),
  ]) {
    const service = createAuthService({
      comparePassword: () => true,
      issueToken: () => "token",
      publicUser: (user) => user,
      repository: {
        findById: () => ({ id: "USR-001", name: "Alice", email: "alice@example.com" }),
        findOtherByEmail: () => null,
        updateProfile: () => { throw databaseError; },
      },
    });
    await assert.rejects(() => service.updateProfile("USR-001", { email: "race@example.com" }), {
      code: "CONFLICT",
      status: 409,
      message: "The email address is already in use.",
    });
  }
});

test("auth service changes the password after proving the current one and rotates the session token", async () => {
  const users = [{ id: "USR-001", name: "Alice", email: "alice@example.com", password_hash: "old-hash", status: "active", role: "dev" }];
  const updates = [];
  const repository = {
    findById: (id) => users.find((user) => user.id === id),
    updatePassword: (id, passwordHash) => {
      updates.push({ id, passwordHash });
      const user = users.find((item) => item.id === id);
      user.password_hash = passwordHash;
      return user;
    },
  };
  const service = createAuthService({
    comparePassword: (password, hash) => (hash === "old-hash" && password === "correct-horse") || (hash === "new-hash" && password === "staple-battery-9"),
    hashPassword: (password) => (password === "staple-battery-9" ? "new-hash" : "other-hash"),
    issueToken: (user) => `token-${user.id}-v2`,
    publicUser: (user) => ({ id: user.id, email: user.email }),
    repository,
  });

  // Wrong current password, weak new password, and identical password all fail closed.
  await assert.rejects(
    () => service.changePassword("USR-001", { currentPassword: "wrong", newPassword: "staple-battery-9" }),
    { code: "CURRENT_PASSWORD_INVALID", status: 400 },
  );
  await assert.rejects(
    () => service.changePassword("USR-001", { currentPassword: "correct-horse", newPassword: "short" }),
    { code: "WEAK_PASSWORD", status: 400 },
  );
  await assert.rejects(
    () => service.changePassword("USR-001", { currentPassword: "correct-horse", newPassword: " pad-start-1 " }),
    { code: "WEAK_PASSWORD", status: 400 },
  );
  await assert.rejects(
    () => service.changePassword("USR-001", { currentPassword: "correct-horse", newPassword: "correct-horse" }),
    { code: "WEAK_PASSWORD", status: 400 },
  );
  assert.equal(updates.length, 0);

  const result = await service.changePassword("USR-001", { currentPassword: "correct-horse", newPassword: "staple-battery-9" });
  assert.deepEqual(result.user, { id: "USR-001", email: "alice@example.com" });
  assert.equal(result.token, "token-USR-001-v2");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].passwordHash, "new-hash");
  assert.equal(users[0].password_hash, "new-hash");
});
