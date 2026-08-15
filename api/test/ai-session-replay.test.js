const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createAiSessionReplayRouter } = require("../src/modules/ai/sessionReplayRoutes");
const { createAiSessionReplayService, sessionListLimit } = require("../src/modules/ai/sessionReplay");

const SESSIONS_SCHEMA = `
  CREATE TABLE persistence_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    store_id TEXT NOT NULL
  ) STRICT;
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    cwd TEXT,
    parent_session TEXT,
    seed_length INTEGER,
    origin TEXT,
    delegation_depth INTEGER,
    agent_preset TEXT,
    incarnation TEXT NOT NULL,
    revision INTEGER NOT NULL
  ) STRICT;
  CREATE TABLE events (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    time INTEGER NOT NULL,
    data TEXT NOT NULL,
    source_event_seqs TEXT,
    surface_op TEXT,
    ignorable INTEGER,
    PRIMARY KEY (session_id, seq)
  ) STRICT;
`;

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-session-replay-"));
}

function writeJsonlSession(root, { hash = "--hash--", id, createdAt, events }) {
  const dir = path.join(root, hash, id);
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    JSON.stringify({ type: "session", version: 0, id, createdAt, cwd: "C:\\tmp", delegationDepth: 0 }),
    ...events.map((item) => JSON.stringify({ type: item.type, seq: item.seq, time: item.time, data: item.data })),
  ];
  fs.writeFileSync(path.join(dir, "session.jsonl"), `${lines.join("\n")}\n`, "utf8");
}

function writeSessionsDatabase(file, sessions) {
  const db = new DatabaseSync(file);
  db.exec(SESSIONS_SCHEMA);
  db.prepare("INSERT INTO persistence_state (singleton, store_id) VALUES (1, 'test')").run();
  for (const session of sessions) {
    db.prepare("INSERT INTO sessions (id, version, created_at, cwd, parent_session, seed_length, origin, delegation_depth, agent_preset, incarnation, revision) VALUES (?, 0, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, 1)")
      .run(session.id, session.createdAt, null, `inc-${session.id}`);
    for (const item of session.events) {
      db.prepare("INSERT INTO events (session_id, seq, type, time, data, source_event_seqs, surface_op, ignorable) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)")
        .run(session.id, item.seq, item.type, item.time, JSON.stringify(item.data ?? {}));
    }
  }
  db.close();
}

test("session replay limit parsing follows the 1-100 window with default 20", () => {
  assert.equal(sessionListLimit(undefined), 20);
  assert.equal(sessionListLimit(""), 20);
  assert.equal(sessionListLimit("5"), 5);
  assert.equal(sessionListLimit("100"), 100);
  assert.equal(sessionListLimit("101"), 100);
  assert.equal(sessionListLimit("0"), null);
  assert.equal(sessionListLimit("-3"), null);
  assert.equal(sessionListLimit("many"), null);
  assert.equal(sessionListLimit("12.5"), null);
});

test("session replay reads the JSONL tree when no database exists", async () => {
  const root = tempRoot();
  writeJsonlSession(root, {
    id: "session-older",
    createdAt: 1786723127937,
    events: [
      { type: "turn/start", seq: 0, time: 1786723127943, data: { turn: 1 } },
      { type: "user/message", seq: 1, time: 1786723127944, data: { role: "user" } },
    ],
  });
  writeJsonlSession(root, {
    id: "session-newer",
    createdAt: 1786730410246,
    events: [
      { type: "turn/start", seq: 0, time: 1786730257886, data: { turn: 1 } },
    ],
  });
  const service = createAiSessionReplayService({
    DatabaseSync: null,
    databaseFile: path.join(root, "missing", "sessions.db"),
    jsonlRoot: root,
    logger: { warn: () => {} },
  });
  try {
    const items = await service.list(20);
    assert.deepEqual(items, [
      {
        id: "session-newer",
        startedAt: new Date(1786730410246).toISOString(),
        lastEventAt: new Date(1786730257886).toISOString(),
        eventCount: 1,
      },
      {
        id: "session-older",
        startedAt: new Date(1786723127937).toISOString(),
        lastEventAt: new Date(1786723127944).toISOString(),
        eventCount: 2,
      },
    ]);
    assert.equal(items.length, 2);

    const replay = await service.get("session-older");
    assert.equal(replay.id, "session-older");
    assert.deepEqual(replay.events, [
      { type: "turn/start", seq: 0, time: new Date(1786723127943).toISOString(), data: { turn: 1 } },
      { type: "user/message", seq: 1, time: new Date(1786723127944).toISOString(), data: { role: "user" } },
    ]);

    assert.equal(await service.list(1).then((listed) => listed.length), 1);
    assert.equal(await service.get("session-missing"), null);
    assert.equal(await service.get("../etc/passwd"), null);
    assert.equal(await service.get(""), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("session replay prefers a populated sessions.db and never writes to it", async () => {
  const root = tempRoot();
  writeJsonlSession(root, {
    id: "session-jsonl-only",
    createdAt: 1786723127937,
    events: [{ type: "turn/start", seq: 0, time: 1786723127943, data: { turn: 1 } }],
  });
  const dbFile = path.join(root, "sessions.db");
  writeSessionsDatabase(dbFile, [
    {
      id: "session-db",
      createdAt: 1786730410246,
      events: [
        { type: "turn/start", seq: 0, time: 1786730257886, data: { turn: 1 } },
        { type: "turn/end", seq: 1, time: 1786730286804, data: { reason: { kind: "completed" } } },
      ],
    },
  ]);
  const before = fs.readFileSync(dbFile);
  const service = createAiSessionReplayService({
    DatabaseSync,
    databaseFile: dbFile,
    jsonlRoot: root,
    logger: { warn: () => {} },
  });
  try {
    const items = await service.list(20);
    assert.deepEqual(items.map((item) => item.id), ["session-db"]);
    assert.equal(items[0].eventCount, 2);
    assert.equal(items[0].startedAt, new Date(1786730410246).toISOString());
    assert.equal(items[0].lastEventAt, new Date(1786730286804).toISOString());

    const replay = await service.get("session-db");
    assert.deepEqual(replay.events, [
      { type: "turn/start", seq: 0, time: new Date(1786730257886).toISOString(), data: { turn: 1 } },
      { type: "turn/end", seq: 1, time: new Date(1786730286804).toISOString(), data: { reason: { kind: "completed" } } },
    ]);
    // Per-id fallback: an id the db does not carry still replays from JSONL
    // (the db stays authoritative for the ids it owns; no merge is attempted).
    const legacy = await service.get("session-jsonl-only");
    assert.equal(legacy.id, "session-jsonl-only");
    assert.equal(legacy.events[0].type, "turn/start");

    // Strictly read-only: the file bytes are untouched after list + get.
    assert.deepEqual(fs.readFileSync(dbFile), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("session replay falls back to JSONL on an empty or unusable database and answers empty when both lack sessions", async () => {
  const root = tempRoot();
  writeJsonlSession(root, {
    id: "session-fallback",
    createdAt: 1786723127937,
    events: [{ type: "turn/start", seq: 0, time: 1786723127943, data: { turn: 1 } }],
  });
  const emptyDb = path.join(root, "empty.db");
  writeSessionsDatabase(emptyDb, []);
  const corruptDb = path.join(root, "corrupt.db");
  fs.writeFileSync(corruptDb, "this is not sqlite", "utf8");

  const fromEmpty = createAiSessionReplayService({ DatabaseSync, databaseFile: emptyDb, jsonlRoot: root, logger: { warn: () => {} } });
  assert.deepEqual((await fromEmpty.list(20)).map((item) => item.id), ["session-fallback"], "empty db falls back to JSONL");
  const replay = await fromEmpty.get("session-fallback");
  assert.equal(replay.id, "session-fallback");

  const fromCorrupt = createAiSessionReplayService({ DatabaseSync, databaseFile: corruptDb, jsonlRoot: root, logger: { warn: () => {} } });
  assert.deepEqual((await fromCorrupt.list(20)).map((item) => item.id), ["session-fallback"], "corrupt db falls back to JSONL");

  const bare = createAiSessionReplayService({ DatabaseSync, databaseFile: path.join(root, "none.db"), jsonlRoot: path.join(root, "no-sessions"), logger: { warn: () => {} } });
  assert.deepEqual(await bare.list(20), []);
  assert.equal(await bare.get("session-any"), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test("session replay routes enforce the admin gate, limit validation, and 404 semantics", async () => {
  const root = tempRoot();
  writeJsonlSession(root, {
    id: "session-routed",
    createdAt: 1786723127937,
    events: [{ type: "turn/start", seq: 0, time: 1786723127943, data: { turn: 1 } }],
  });
  const service = createAiSessionReplayService({
    DatabaseSync: null,
    databaseFile: path.join(root, "missing.db"),
    jsonlRoot: root,
    logger: { warn: () => {} },
  });
  const permissions = [];
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: "USR-ADMIN", permissions: ["admin:*"] };
    next();
  });
  const ok = (data) => ({ data });
  const fail = (res, status, errorCode, message) => res.status(status).json({ errorCode, message });
  app.use("/api", createAiSessionReplayRouter({
    fail,
    ok,
    requirePermission: (permission) => {
      permissions.push(permission);
      return (req, res, next) => {
        if (!(req.user?.permissions || []).includes(permission)) {
          return fail(res, 403, "PERMISSION_DENIED", "Forbidden.");
        }
        return next();
      };
    },
    service,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const listed = await fetch(`${baseUrl}/ai/sessions`);
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.data.items.length, 1);
    assert.equal(listedBody.data.items[0].id, "session-routed");
    assert.equal(listedBody.data.items[0].eventCount, 1);

    const badLimit = await fetch(`${baseUrl}/ai/sessions?limit=0`);
    assert.equal(badLimit.status, 400);
    assert.equal((await badLimit.json()).errorCode, "VALIDATION_FAILED");

    const detail = await fetch(`${baseUrl}/ai/sessions/session-routed`);
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.data.id, "session-routed");
    assert.equal(detailBody.data.events[0].type, "turn/start");
    assert.equal(detailBody.data.events[0].data.turn, 1);

    const missing = await fetch(`${baseUrl}/ai/sessions/session-none`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).errorCode, "RESOURCE_NOT_FOUND");

    assert.deepEqual(permissions, ["admin:*", "admin:*"], "both replay routes are gated on admin:*");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
