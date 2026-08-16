const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const test = require("node:test");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { createAuthRouter } = require("../src/modules/auth/routes");
const { createAuthService } = require("../src/modules/auth/service");
const { createAuthRepository } = require("../src/modules/auth/repository");

// Minimal in-memory users table backing the real repository SQL surface.
function createMemoryStore() {
  const users = new Map();
  let tokenVersion = 0;
  return {
    users,
    row: async (_sql, params) => users.get(params.id) || users.get(params.email) || null,
    run: async (sql, params) => {
      if (sql.includes("token_version = token_version + 1")) {
        const user = users.get(params.id);
        assert.ok(user, "password update targets an existing user");
        user.password_hash = params.passwordHash;
        user.token_version = (user.token_version || 0) + 1;
        tokenVersion += 1;
      }
    },
    revocations: () => tokenVersion,
  };
}

function createFixture() {
  const store = createMemoryStore();
  store.users.set("USR-1", {
    id: "USR-1",
    name: "Alice",
    email: "alice@example.com",
    password_hash: bcrypt.hashSync("correct-horse-1", 10),
    status: "active",
    role: "dev",
    permissions: JSON.stringify(["requirement:read"]),
    token_version: 0,
  });
  const JWT_SECRET = "change-password-test-secret-16";
  const issueToken = (user) => jwt.sign({
    sub: user.id,
    role: user.role,
    tv: Number(user.token_version || 0),
  }, JWT_SECRET, { expiresIn: "8h" });

  const service = createAuthService({
    comparePassword: (password, hash) => bcrypt.compareSync(password, hash),
    hashPassword: (password) => bcrypt.hashSync(password, 10),
    issueToken,
    publicUser: (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role }),
    repository: createAuthRepository({ row: store.row, run: store.run }),
  });

  // authenticate middleware stand-in: mirrors src/middleware/auth.js tv check.
  const authenticate = (req, _res, next) => {
    try {
      const payload = jwt.verify(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), JWT_SECRET);
      const user = store.users.get(payload.sub);
      if (!user || user.status !== "active" || Number(payload.tv ?? 0) !== Number(user.token_version ?? 0)) {
        return next(Object.assign(new Error("unauthorized"), { status: 401 }));
      }
      req.user = { id: user.id, email: user.email };
      next();
    } catch {
      next(Object.assign(new Error("unauthorized"), { status: 401 }));
    }
  };

  const audits = [];
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.use("/api", createAuthRouter({
    audit: async (actor, action) => { audits.push({ actor, action }); },
    authLimiter: (_req, _res, next) => next(),
    buildCapabilities: () => ({}),
    fail: (res, status, code, message) => res.status(status).json({ errorCode: code, message }),
    ok: (data) => ({ data }),
    publicUser: (user) => ({ id: user.id, name: user.name, email: user.email }),
    service,
  }));
  return { app, audits, issueToken, store };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}/api` }));
  });
}

test("change-password endpoint rotates the token and revokes the previous session", async () => {
  const { app, audits, store } = createFixture();
  const { server, baseUrl } = await listen(app);
  try {
    const oldToken = store.users.get("USR-1").token === undefined
      ? jwt.sign({ sub: "USR-1", role: "dev", tv: 0 }, "change-password-test-secret-16", { expiresIn: "8h" })
      : null;

    const wrong = await fetch(`${baseUrl}/auth/change-password`, {
      method: "POST",
      headers: { authorization: `Bearer ${oldToken}`, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "not-the-password", newPassword: "staple-battery-9" }),
    });
    assert.equal(wrong.status, 400);
    assert.equal((await wrong.json()).errorCode, "CURRENT_PASSWORD_INVALID");

    const weak = await fetch(`${baseUrl}/auth/change-password`, {
      method: "POST",
      headers: { authorization: `Bearer ${oldToken}`, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "correct-horse-1", newPassword: "short" }),
    });
    assert.equal(weak.status, 400);
    assert.equal((await weak.json()).errorCode, "WEAK_PASSWORD");

    const okResponse = await fetch(`${baseUrl}/auth/change-password`, {
      method: "POST",
      headers: { authorization: `Bearer ${oldToken}`, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "correct-horse-1", newPassword: "staple-battery-9" }),
    });
    assert.equal(okResponse.status, 200);
    const payload = await okResponse.json();
    assert.equal(payload.data.user.email, "alice@example.com");
    assert.ok(payload.data.token && payload.data.token !== oldToken);

    // The previous session token is dead; the rotated one keeps working.
    const stale = await fetch(`${baseUrl}/auth/me`, { headers: { authorization: `Bearer ${oldToken}` } });
    assert.equal(stale.status, 401);
    const fresh = await fetch(`${baseUrl}/auth/me`, { headers: { authorization: `Bearer ${payload.data.token}` } });
    assert.equal(fresh.status, 200);

    // The stored hash actually changed to the bcrypt of the new password.
    const user = store.users.get("USR-1");
    assert.equal(bcrypt.compareSync("staple-battery-9", user.password_hash), true);
    assert.equal(bcrypt.compareSync("correct-horse-1", user.password_hash), false);
    assert.equal(user.token_version, 1);
    assert.ok(audits.some((entry) => entry.action === "auth.password_change"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
