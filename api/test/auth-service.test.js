const assert = require("node:assert/strict");
const test = require("node:test");
const { createAuthService } = require("../src/modules/auth/service");

test("auth service never accepts invalid credentials and prevents duplicate profile email", () => {
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

  assert.throws(() => service.login({ email: "alice@example.com", password: "wrong" }), { code: "INVALID_CREDENTIALS" });
  assert.deepEqual(service.login({ email: "alice@example.com", password: "correct" }), {
    token: "token-USR-001",
    user: { id: "USR-001", email: "alice@example.com", name: "Alice" },
  });
  assert.throws(() => service.updateProfile("USR-001", { email: "bob@example.com" }), { code: "CONFLICT" });
  const update = service.updateProfile("USR-001", { name: "  Alice Updated ", email: "new@example.com" });
  assert.equal(update.after.name, "Alice Updated");
  assert.equal(update.after.email, "new@example.com");
});
