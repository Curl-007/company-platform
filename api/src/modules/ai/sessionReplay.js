const fs = require("node:fs");
const path = require("node:path");

// Read-only dsh session replay (admin surface, GET /api/ai/sessions).
//
// The resident harness composition persists sessions into a SQLite database
// (sessions.db: sessions + events tables); older runs left one JSONL file per
// session under sessions/<hash>/session-*/session.jsonl. This reader prefers
// the database when it exists, is readable, and has at least one session row;
// otherwise it scans the JSONL tree. It never writes: the database is always
// opened read-only and the JSONL files are only parsed, so a broken or busy
// store degrades to an empty replay instead of a 500.
//
// Event output shape matches the web AiInvocationEvent contract:
//   { type: string, seq: number, time: ISO string, data: object | null }

const DEFAULT_SESSION_LIMIT = 20;
const MAX_SESSION_LIMIT = 100;
const MAX_JSONL_EVENT_BYTES = 8 * 1024 * 1024;

function sessionListLimit(value) {
  const text = String(value ?? "").trim();
  if (!text) return DEFAULT_SESSION_LIMIT;
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, MAX_SESSION_LIMIT);
}

function isoFromEpochMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  try {
    return new Date(parsed).toISOString();
  } catch {
    return null;
  }
}

function eventPayload(row) {
  return {
    type: String(row.type || ""),
    seq: Number.isSafeInteger(Number(row.seq)) ? Number(row.seq) : 0,
    time: isoFromEpochMs(row.time),
    data: row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : null,
  };
}

function parseJsonlEventData(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createAiSessionReplayService({
  DatabaseSync,
  databaseFile,
  fsImpl = fs,
  jsonlRoot,
  logger = console,
} = {}) {
  if (!databaseFile || !jsonlRoot) throw new Error("AI session replay requires the sessions.db path and the JSONL sessions root.");

  // Opens sessions.db strictly read-only. Any failure (missing file, locked
  // database, unexpected schema) yields null so the caller falls back to the
  // JSONL tree or an empty list — replay must never break on storage churn.
  function withDatabase(callback) {
    if (typeof DatabaseSync !== "function") return null;
    let connection;
    try {
      connection = new DatabaseSync(databaseFile, { readOnly: true });
      const sessions = connection.prepare("SELECT COUNT(*) AS count FROM sessions").get();
      if (!sessions || Number(sessions.count) <= 0) return null;
      return callback(connection);
    } catch (error) {
      logger?.warn?.("AI session replay database read failed:", error?.message || error);
      return null;
    } finally {
      try {
        connection?.close?.();
      } catch {
        // Read-only handle; close failures are harmless.
      }
    }
  }

  function listFromDatabase(connection, limit) {
    const rows = connection.prepare(
      `SELECT s.id AS id, s.created_at AS started_at, e.event_count AS event_count, e.last_time AS last_event_at
         FROM sessions s
         LEFT JOIN (SELECT session_id, COUNT(*) AS event_count, MAX(time) AS last_time FROM events GROUP BY session_id) e
           ON e.session_id = s.id
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ?`,
    ).all(limit);
    return rows.map((row) => ({
      id: String(row.id || ""),
      startedAt: isoFromEpochMs(row.started_at),
      lastEventAt: isoFromEpochMs(row.last_event_at),
      eventCount: Number.isFinite(Number(row.event_count)) ? Math.max(0, Number(row.event_count)) : 0,
    })).filter((item) => item.id);
  }

  function sessionDirs() {
    let hashDirs;
    try {
      hashDirs = fsImpl.readdirSync(jsonlRoot, { withFileTypes: true });
    } catch {
      return [];
    }
    const dirs = [];
    for (const hashEntry of hashDirs) {
      if (!hashEntry.isDirectory()) continue;
      let sessionEntries;
      try {
        sessionEntries = fsImpl.readdirSync(path.join(jsonlRoot, hashEntry.name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const sessionEntry of sessionEntries) {
        if (!sessionEntry.isDirectory() || !sessionEntry.name.startsWith("session-")) continue;
        const jsonlFile = path.join(jsonlRoot, hashEntry.name, sessionEntry.name, "session.jsonl");
        try {
          if (!fsImpl.statSync(jsonlFile).isFile()) continue;
        } catch {
          continue;
        }
        dirs.push({ id: sessionEntry.name, jsonlFile });
      }
    }
    return dirs;
  }

  function parseJsonlSession(jsonlFile) {
    let raw;
    try {
      const stats = fsImpl.statSync(jsonlFile);
      if (!stats.isFile() || stats.size > MAX_JSONL_EVENT_BYTES * 8) return null;
      raw = fsImpl.readFileSync(jsonlFile, "utf8");
    } catch {
      return null;
    }
    if (raw.length > MAX_JSONL_EVENT_BYTES * 8) return null;
    let header = null;
    const events = [];
    for (const line of raw.split(/\r?\n/)) {
      const text = line.trim();
      if (!text) continue;
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object") continue;
      if (parsed.type === "session") {
        header = parsed;
        continue;
      }
      if (typeof parsed.type !== "string" || parsed.type === "") continue;
      events.push(eventPayload({ ...parsed, data: parseJsonlEventData(parsed.data) }));
    }
    if (!header && events.length === 0) return null;
    const id = typeof header?.id === "string" && header.id.trim() ? header.id.trim() : null;
    return {
      header,
      id,
      events,
      startedAt: isoFromEpochMs(header?.createdAt),
    };
  }

  function listFromJsonl(limit) {
    const summaries = [];
    for (const { id, jsonlFile } of sessionDirs()) {
      const parsed = parseJsonlSession(jsonlFile);
      if (!parsed) continue;
      const sessionId = parsed.id || id;
      if (!sessionId) continue;
      let lastEventAt = null;
      for (const event of parsed.events) {
        if (!event.time) continue;
        if (!lastEventAt || event.time > lastEventAt) lastEventAt = event.time;
      }
      summaries.push({
        id: sessionId,
        startedAt: parsed.startedAt,
        lastEventAt,
        eventCount: parsed.events.length,
      });
    }
    summaries.sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")) || String(right.id).localeCompare(String(left.id)));
    return summaries.slice(0, limit);
  }

  function getFromDatabase(connection, id) {
    const session = connection.prepare("SELECT id FROM sessions WHERE id = ?").get(id);
    if (!session) return null;
    const rows = connection.prepare("SELECT seq, type, time, data FROM events WHERE session_id = ? ORDER BY seq ASC").all(id);
    return {
      id: String(session.id || ""),
      events: rows.map((row) => eventPayload({ ...row, data: parseJsonlEventData(row.data) })),
    };
  }

  async function list(limit = DEFAULT_SESSION_LIMIT) {
    const bounded = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, MAX_SESSION_LIMIT) : DEFAULT_SESSION_LIMIT;
    const fromDatabase = withDatabase((connection) => listFromDatabase(connection, bounded));
    if (fromDatabase) return fromDatabase;
    return listFromJsonl(bounded);
  }

  async function get(id) {
    const target = String(id || "").trim();
    if (!target || target.includes("/") || target.includes("\\") || target.includes("..")) return null;
    const fromDatabase = withDatabase((connection) => getFromDatabase(connection, target));
    if (fromDatabase) return fromDatabase;
    for (const { id: dirId, jsonlFile } of sessionDirs()) {
      if (dirId !== target) continue;
      const parsed = parseJsonlSession(jsonlFile);
      if (!parsed) return null;
      return { id: parsed.id || dirId, events: parsed.events };
    }
    return null;
  }

  return { get, list };
}

module.exports = {
  DEFAULT_SESSION_LIMIT,
  MAX_SESSION_LIMIT,
  createAiSessionReplayService,
  sessionListLimit,
};
