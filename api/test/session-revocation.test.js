const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const express = require("express");
const { createAuthMiddleware } = require("../src/middleware/auth");
const { closeUserConnections } = require("../src/modules/documents/collaboration");
const { createTeamRouter } = require("../src/modules/team/routes");

const secret = "session-revocation-test-secret";

function authHarness(user) {
  const failures = [];
  const middleware = createAuthMiddleware({
    jwtSecret: secret,
    fail: (_res, status, errorCode) => failures.push({ status, errorCode }),
    row: async () => user,
  });
  return { middleware, failures };
}

test("HTTP and WebSocket authentication reject a token issued for an older user token version", async () => {
  const user = { id: "USR-1", status: "active", role: "dev", permissions: "[]", token_version: 2 };
  const token = jwt.sign({ sub: user.id, role: user.role, tv: 1 }, secret, { expiresIn: "8h" });
  const { middleware, failures } = authHarness(user);
  const req = { path: "/api/projects", headers: { authorization: `Bearer ${token}` } };
  let nextCalled = false;
  await middleware.authenticate(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.deepEqual(failures, [{ status: 401, errorCode: "UNAUTHENTICATED" }]);

  const socketReq = { url: "/ws/collab", headers: { "sec-websocket-protocol": `pm.jwt, ${token}` } };
  assert.equal(await middleware.authenticateSocket(socketReq), null);
});

test("session revocation closes all established collaboration sockets owned by the user", () => {
  const closed = [];
  const socket = (id) => ({ collabUser: { id }, close: (code, reason) => closed.push({ id, code, reason }) });
  const rooms = new Map([
    ["DOC-1", new Set([socket("USR-1"), socket("USR-2")])],
    ["DOC-2", new Set([socket("USR-1")])],
  ]);
  assert.equal(closeUserConnections(rooms, "USR-1"), 2);
  assert.deepEqual(closed, [
    { id: "USR-1", code: 1008, reason: "Session revoked" },
    { id: "USR-1", code: 1008, reason: "Session revoked" },
  ]);
});

test("administrator password reset increments the token version and revokes established sessions", async (t) => {
  let user = {
    id: "USR-1",
    name: "User",
    email: "user@example.com",
    role: "dev",
    status: "active",
    password_hash: "old",
    token_version: 3,
  };
  const executed = [];
  const revoked = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: "USR-ADMIN", role: "admin" }; next(); });
  app.use(createTeamRouter({
    audit: async () => {},
    buildTeamMembers: async () => [],
    canViewTeamLogs: () => true,
    defaultPermissionsForRole: () => [],
    fail: (res, status, errorCode, message) => res.status(status).json({ errorCode, message }),
    insert: async () => {},
    isSystemRole: () => true,
    json: JSON.stringify,
    mapUser: (value) => value,
    nextId: async () => "USR-2",
    now: () => new Date().toISOString(),
    ok: (data) => ({ data }),
    paginatedResponse: (items) => items,
    requirePermission: () => (_req, _res, next) => next(),
    row: async () => user,
    rows: async () => [],
    run: async (sql, params) => {
      executed.push({ sql, params });
      if (sql.includes("token_version = token_version + 1")) {
        user = { ...user, password_hash: params.val, token_version: user.token_version + 1 };
      }
      return { changes: 1 };
    },
    revokeUserSessions: (userId) => revoked.push(userId),
    systemRoles: ["admin", "dev"],
    organizationRepository: {},
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/users/USR-1`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "StrongPassword123!" }),
  });
  assert.equal(response.status, 200);
  assert.equal(user.token_version, 4);
  assert.equal(executed.some(({ sql }) => sql.includes("password_hash") && sql.includes("token_version")), true);
  assert.deepEqual(revoked, ["USR-1"]);
});
