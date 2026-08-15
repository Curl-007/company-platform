// Sprint 5.1 ask-user / user-approval interaction bridge — server side.
//
// The dsh child runtime (company-ask-bridge.mjs plugin) pauses inference on
// the `ctx.userQuestions` and `ctx.approval` seams and asks the platform user
// through the SAME loopback HTTP server as the execution gateway (reusing its
// URL and scoped token for creation), so no harnessRuntime change is needed.
//
// Loopback wire contract (child -> server, all fail-closed):
//   POST /v1/interaction            Bearer <DSH_EXECUTION_TOKEN>
//                                   { kind: "question"|"approval", payload }
//                                   -> 200 { data: { interactionId, waitToken, waitMs } }
//   GET  /v1/interaction/:id/wait   x-wait-token: <waitToken>
//                                   -> 200 { status: "answered", response }
//                                      | { status: "cancelled" | "timed_out" }
//                                      | { status: "continue" }   (empty 25s poll, re-poll)
//
// The execution token only authorizes CREATION (60s TTL, no replay against
// the domain routes); the per-interaction random waitToken then authorizes the
// long polls, so a human answer may legally arrive long after the execution
// token would have expired. Unreachable/invalid channel -> the child fails
// closed (question errors out, approval resolves `unavailable`).

const crypto = require("node:crypto");

const DEFAULT_INTERACTION_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_INTERACTION_SWEEP_MS = 30 * 1000;
const DEFAULT_INTERACTION_WAIT_POLL_MS = 25 * 1000;
const MAX_INTERACTION_BODY_BYTES = 128 * 1024;
// How long a settled interaction's wait token still replays the final
// outcome to a child caught between two long polls.
const WAIT_TOKEN_GRACE_MS = 10 * 60 * 1000;
const INTERACTION_LIST_LIMIT = 100;
const KINDS = Object.freeze(["question", "approval"]);
const TERMINAL_STATUSES = Object.freeze(["answered", "cancelled", "timed_out"]);

const QUESTION_LIMITS = Object.freeze({
  maxQuestions: 8,
  maxIdLength: 128,
  maxTextLength: 2000,
  maxDetailLength: 4000,
  maxOptions: 12,
  maxOptionLabelLength: 200,
  maxOptionDescriptionLength: 500,
});

const APPROVAL_LIMITS = Object.freeze({
  maxToolNameLength: 128,
  maxReasonLength: 2000,
  maxCallIdLength: 128,
});

function interactionError(code, message, status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function readBearerToken(header) {
  const source = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(.+)$/i.exec(String(source || "").trim());
  return match ? match[1] : "";
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("error", rejectOnce);
    req.on("data", (chunk) => {
      if (settled) return;
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += data.length;
      if (size > maxBytes) {
        rejectOnce(interactionError("AI_INTERACTION_BODY_TOO_LARGE", "Interaction request is too large.", 413));
        req.resume();
        return;
      }
      chunks.push(data);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        resolve(parsed);
      } catch {
        reject(interactionError("AI_INTERACTION_INVALID_JSON", "Interaction request must be a JSON object.", 400));
      }
    });
  });
}

function writeJson(res, status, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(body);
}

function publicInteractionError(error) {
  return {
    error: {
      code: String(error?.code || "AI_INTERACTION_FAILED"),
      message: String(error?.message || "Interaction request failed.").replace(/\s+/g, " ").slice(0, 240),
    },
  };
}

function boundedText(value, field, { maxLength, required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw interactionError("VALIDATION_FAILED", `${field} is required.`, 400);
    return undefined;
  }
  if (typeof value !== "string") throw interactionError("VALIDATION_FAILED", `${field} must be a string.`, 400);
  const trimmed = value.trim();
  if (required && !trimmed) throw interactionError("VALIDATION_FAILED", `${field} is required.`, 400);
  if (trimmed.length > maxLength) {
    throw interactionError("VALIDATION_FAILED", `${field} must not exceed ${maxLength} characters.`, 400);
  }
  return trimmed;
}

// Question payload crosses the model/tool JSON boundary: every field is
// bounded and normalized before it is persisted or shown to a platform user.
function normalizeQuestionPayload(payload) {
  const questions = payload?.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw interactionError("VALIDATION_FAILED", "questions must be a non-empty array.", 400);
  }
  if (questions.length > QUESTION_LIMITS.maxQuestions) {
    throw interactionError("VALIDATION_FAILED", `questions must not exceed ${QUESTION_LIMITS.maxQuestions} items.`, 400);
  }
  const normalized = questions.map((question, index) => {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      throw interactionError("VALIDATION_FAILED", `questions[${index}] must be an object.`, 400);
    }
    const item = {
      id: boundedText(question.id, `questions[${index}].id`, { maxLength: QUESTION_LIMITS.maxIdLength, required: true }),
      question: boundedText(question.question, `questions[${index}].question`, { maxLength: QUESTION_LIMITS.maxTextLength, required: true }),
    };
    const header = boundedText(question.header, `questions[${index}].header`, { maxLength: QUESTION_LIMITS.maxOptionLabelLength });
    if (header) item.header = header;
    const detail = boundedText(question.detail, `questions[${index}].detail`, { maxLength: QUESTION_LIMITS.maxDetailLength });
    if (detail) item.detail = detail;
    if (question.options !== undefined && question.options !== null) {
      if (!Array.isArray(question.options) || question.options.length === 0) {
        throw interactionError("VALIDATION_FAILED", `questions[${index}].options must be a non-empty array.`, 400);
      }
      if (question.options.length > QUESTION_LIMITS.maxOptions) {
        throw interactionError("VALIDATION_FAILED", `questions[${index}].options must not exceed ${QUESTION_LIMITS.maxOptions} items.`, 400);
      }
      item.options = question.options.map((option, optionIndex) => {
        if (!option || typeof option !== "object" || Array.isArray(option)) {
          throw interactionError("VALIDATION_FAILED", `questions[${index}].options[${optionIndex}] must be an object.`, 400);
        }
        const normalizedOption = {
          label: boundedText(option.label, `questions[${index}].options[${optionIndex}].label`, {
            maxLength: QUESTION_LIMITS.maxOptionLabelLength,
            required: true,
          }),
        };
        const description = boundedText(option.description, `questions[${index}].options[${optionIndex}].description`, {
          maxLength: QUESTION_LIMITS.maxOptionDescriptionLength,
        });
        if (description) normalizedOption.description = description;
        return normalizedOption;
      });
    }
    if (question.multiSelect !== undefined && question.multiSelect !== null) {
      if (typeof question.multiSelect !== "boolean") {
        throw interactionError("VALIDATION_FAILED", `questions[${index}].multiSelect must be a boolean.`, 400);
      }
      item.multiSelect = question.multiSelect;
    }
    return item;
  });
  const ids = new Set(normalized.map((question) => question.id));
  if (ids.size !== normalized.length) {
    throw interactionError("VALIDATION_FAILED", "question ids must be unique.", 400);
  }
  return { questions: normalized };
}

function normalizeApprovalPayload(payload) {
  const normalized = {
    toolName: boundedText(payload?.toolName, "toolName", { maxLength: APPROVAL_LIMITS.maxToolNameLength, required: true }),
  };
  const reason = boundedText(payload?.reason, "reason", { maxLength: APPROVAL_LIMITS.maxReasonLength });
  if (reason) normalized.reason = reason;
  const callId = boundedText(payload?.callId, "callId", { maxLength: APPROVAL_LIMITS.maxCallIdLength });
  if (callId) normalized.callId = callId;
  return normalized;
}

function normalizePayload(kind, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw interactionError("VALIDATION_FAILED", "payload must be an object.", 400);
  }
  return kind === "approval" ? normalizeApprovalPayload(payload) : normalizeQuestionPayload(payload);
}

// The platform user's answer, shaped exactly like tool-ask-user's contract:
// { answers: [{ id, selected: [label...], custom? }] }. Every selected label
// must be one of the question's offered options; free text rides `custom`.
function normalizeQuestionResponse(payload, response) {
  const byId = new Map(payload.questions.map((question) => [question.id, question]));
  const answers = response?.answers;
  if (!Array.isArray(answers) || answers.length === 0) {
    throw interactionError("VALIDATION_FAILED", "answer.answers must be a non-empty array.", 400);
  }
  if (answers.length > payload.questions.length) {
    throw interactionError("VALIDATION_FAILED", "answer.answers must not exceed the asked questions.", 400);
  }
  const seen = new Set();
  const normalized = answers.map((answer, index) => {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
      throw interactionError("VALIDATION_FAILED", `answers[${index}] must be an object.`, 400);
    }
    const id = boundedText(answer.id, `answers[${index}].id`, { maxLength: QUESTION_LIMITS.maxIdLength, required: true });
    const question = byId.get(id);
    if (!question) throw interactionError("VALIDATION_FAILED", `answers[${index}].id does not match any asked question.`, 400);
    if (seen.has(id)) throw interactionError("VALIDATION_FAILED", `answers[${index}].id is answered twice.`, 400);
    seen.add(id);
    const selected = answer.selected === undefined || answer.selected === null ? [] : answer.selected;
    if (!Array.isArray(selected) || selected.some((label) => typeof label !== "string")) {
      throw interactionError("VALIDATION_FAILED", `answers[${index}].selected must be an array of strings.`, 400);
    }
    const labels = question.options ? question.options.map((option) => option.label) : null;
    for (const label of selected) {
      if (labels && !labels.includes(label)) {
        throw interactionError("VALIDATION_FAILED", `answers[${index}].selected contains a label that was not offered.`, 400);
      }
    }
    const item = { id, selected };
    const custom = boundedText(answer.custom, `answers[${index}].custom`, { maxLength: QUESTION_LIMITS.maxDetailLength });
    if (custom) item.custom = custom;
    return item;
  });
  return { answers: normalized };
}

function normalizeApprovalResponse(response) {
  const decision = String(response?.decision || "").trim().toLowerCase();
  if (decision !== "approve" && decision !== "reject") {
    throw interactionError("VALIDATION_FAILED", "decision must be approve or reject.", 400);
  }
  return { decision };
}

function parseSnapshotColumn(value, fallback) {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function publicInteraction(row) {
  if (!row) return null;
  return {
    interactionId: row.id,
    kind: row.kind,
    status: row.status,
    invocationId: row.invocation_id,
    projectId: row.project_id,
    actorId: row.actor_id,
    payload: parseSnapshotColumn(row.payload, {}),
    response: parseSnapshotColumn(row.response, null),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    respondedAt: row.responded_at || null,
    respondedBy: row.responded_by || null,
  };
}

function sameToken(left, right) {
  const leftBytes = Buffer.from(String(left || ""));
  const rightBytes = Buffer.from(String(right || ""));
  return leftBytes.length === rightBytes.length && leftBytes.length > 0 && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createAgentInteractionService({
  audit,
  canAccessProject,
  findInvocation,
  hasPermission,
  insert,
  json,
  logger = console,
  now = () => new Date().toISOString(),
  notifyInteraction,
  publicUser,
  randomUUID = () => crypto.randomUUID(),
  row,
  rows,
  run,
  sweepMs = positiveNumber(process.env.AI_INTERACTION_SWEEP_MS, DEFAULT_INTERACTION_SWEEP_MS),
  timeoutMs = positiveNumber(process.env.AI_INTERACTION_TIMEOUT_MS, DEFAULT_INTERACTION_TIMEOUT_MS),
  tokenService,
  waitPollMs = positiveNumber(process.env.AI_INTERACTION_WAIT_POLL_MS, DEFAULT_INTERACTION_WAIT_POLL_MS),
} = {}) {
  if (!tokenService || typeof tokenService.verify !== "function") throw new Error("Agent interaction service requires the execution token service.");
  if (typeof row !== "function" || typeof rows !== "function" || typeof run !== "function" || typeof insert !== "function") {
    throw new Error("Agent interaction service requires database access.");
  }
  if (typeof audit !== "function" || typeof json !== "function") {
    throw new Error("Agent interaction service requires audit and json helpers.");
  }
  if (typeof canAccessProject !== "function" || typeof hasPermission !== "function" || typeof publicUser !== "function") {
    throw new Error("Agent interaction service requires access control helpers.");
  }
  if (typeof findInvocation !== "function") throw new Error("Agent interaction service requires the capability repository.");

  // interactionId -> { token, expiresAt }. The wait token stays valid AFTER a
  // terminal transition (grace-bounded) so a child polling in the race window
  // between two long polls still receives the final outcome instead of a 401.
  const waitTokens = new Map();
  // interactionId -> Set<resolve> of suspended long polls.
  const waiters = new Map();
  let sweepTimer;

  function pruneWaitTokens(referenceNow = new Date()) {
    const cutoff = referenceNow.getTime() - WAIT_TOKEN_GRACE_MS;
    for (const [id, entry] of waitTokens) {
      if (Date.parse(entry.expiresAt) <= cutoff) waitTokens.delete(id);
    }
  }

  function wakeWaiters(id, outcome) {
    const pending = waiters.get(id);
    if (!pending) return;
    waiters.delete(id);
    for (const resolve of pending) {
      try {
        resolve(outcome);
      } catch {
        // A broken poll resolves nowhere; its HTTP response already ended.
      }
    }
  }

  function publishInteractionEvent(rowData, phase) {
    if (typeof notifyInteraction !== "function") return;
    try {
      notifyInteraction(rowData.actor_id, rowData.invocation_id, {
        kind: rowData.kind,
        phase,
        status: rowData.status,
        interactionId: rowData.id,
        invocationId: rowData.invocation_id,
        projectId: rowData.project_id,
        createdAt: rowData.created_at,
      });
    } catch {
      // ws push is best-effort: the frontend falls back to pending polling.
    }
  }

  function writeAudit(actor, action, interaction, detail, ip, projectId) {
    return audit(
      actor,
      action,
      "ai_interaction",
      interaction.id,
      null,
      { ...detail, kind: interaction.kind, projectId: interaction.project_id, invocationId: interaction.invocation_id },
      ip,
      { scopeType: "project", projectId },
    );
  }

  async function createInteraction({ token } = {}) {
    // Any token failure (malformed / expired / scope mismatch) is a hard 401:
    // creation is the only step that must happen while the scoped execution
    // token is still alive.
    const claims = tokenService.verify(token);
    const actor = await row("SELECT * FROM users WHERE id = @id", { id: claims.actorId });
    if (!actor || actor.status !== "active") {
      throw interactionError("AI_INTERACTION_ACTOR_UNAVAILABLE", "Interaction actor is unavailable.", 403);
    }
    const user = publicUser(actor);
    if (!hasPermission(user, "ai:*")) {
      throw interactionError("PERMISSION_DENIED", "Interaction actor cannot use AI capabilities.", 403);
    }
    const invocation = await findInvocation(claims.invocationId);
    if (!invocation || invocation.project_id !== claims.projectId) {
      throw interactionError("AI_INTERACTION_INVOCATION_UNKNOWN", "Interaction invocation is unknown.", 403);
    }
    return { actor, claims };
  }

  async function handleCreate(req, res) {
    const body = await readJsonBody(req, MAX_INTERACTION_BODY_BYTES);
    const kind = String(body.kind || "").trim();
    if (!KINDS.includes(kind)) {
      throw interactionError("VALIDATION_FAILED", "kind must be question or approval.", 400);
    }
    const payload = normalizePayload(kind, body.payload);
    const { actor, claims } = await createInteraction({ token: readBearerToken(req.headers.authorization) });
    const id = `AII-${randomUUID()}`;
    const createdAt = now();
    const expiresAt = new Date(Date.parse(createdAt) + timeoutMs).toISOString();
    const record = {
      id,
      kind,
      payload: json(payload),
      status: "pending",
      invocation_id: claims.invocationId,
      project_id: claims.projectId,
      actor_id: claims.actorId,
      created_at: createdAt,
      expires_at: expiresAt,
      responded_at: null,
      responded_by: null,
      response: null,
    };
    // Audit first: without the audit trail the interaction never becomes
    // visible, so a broken audit must fail the request (fail-closed).
    await writeAudit(actor, "ai.interaction_created", record, {}, null, claims.projectId);
    await insert("ai_interactions", record);
    const waitToken = crypto.randomBytes(32).toString("base64url");
    waitTokens.set(id, { expiresAt, token: waitToken });
    publishInteractionEvent(record, "created");
    writeJson(res, 200, { data: { interactionId: id, waitMs: waitPollMs, waitToken } });
  }

  function finalOutcome(rowData) {
    if (rowData.status === "answered") {
      return { response: parseSnapshotColumn(rowData.response, null), status: "answered" };
    }
    return { status: rowData.status };
  }

  async function claimTerminal(id, status, patch) {
    const result = await run(
      `UPDATE ai_interactions
          SET status = @status, responded_at = @responded_at, responded_by = @responded_by, response = @response
        WHERE id = @id AND status = 'pending'`,
      { id, response: patch.response ?? null, responded_at: patch.responded_at, responded_by: patch.responded_by ?? null, status },
    );
    return Number(result?.changes) === 1;
  }

  async function handleWait(req, res, parsed) {
    const id = String(parsed.pathname.split("/")[3] || "");
    const waitToken = String(req.headers["x-wait-token"] || "");
    const expected = waitTokens.get(id);
    if (!expected || !sameToken(waitToken, expected.token)) {
      throw interactionError("AI_INTERACTION_WAIT_TOKEN_INVALID", "Interaction wait token is invalid.", 401);
    }
    let current = await row("SELECT * FROM ai_interactions WHERE id = @id", { id });
    if (!current) throw interactionError("RESOURCE_NOT_FOUND", "Interaction not found.", 404);
    if (current.status === "pending" && Date.parse(current.expires_at) <= Date.now()) {
      current = await markTimedOut(current);
    }
    if (TERMINAL_STATUSES.includes(current.status)) {
      writeJson(res, 200, { data: finalOutcome(current) });
      return;
    }
    const remainingMs = Date.parse(current.expires_at) - Date.now();
    const pollMs = Math.max(1000, Math.min(waitPollMs, remainingMs));
    const outcome = await new Promise((resolve) => {
      const entry = waiters.get(id) || new Set();
      entry.add(resolve);
      waiters.set(id, entry);
      const timer = setTimeout(() => {
        entry.delete(resolve);
        if (!entry.size) waiters.delete(id);
        resolve({ status: "continue" });
      }, pollMs);
      timer?.unref?.();
    });
    if (outcome.status === "continue") {
      // Empty poll: tell the child to reconnect immediately.
      writeJson(res, 200, { data: { status: "continue" } });
      return;
    }
    writeJson(res, 200, { data: outcome });
  }

  async function markTimedOut(current) {
    const respondedAt = now();
    const claimed = await claimTerminal(current.id, "timed_out", { responded_at: respondedAt });
    if (!claimed) {
      return await row("SELECT * FROM ai_interactions WHERE id = @id", { id: current.id });
    }
    const updated = { ...current, responded_at: respondedAt, status: "timed_out" };
    try {
      await writeAudit({ id: "system", name: "AI Interaction Monitor" }, "ai.interaction_timed_out", updated, { timeoutMs }, null, current.project_id);
    } catch (error) {
      // The state transition is already committed; keep it authoritative.
      logger?.warn?.("AI interaction timeout audit write failed:", error?.code || error?.message || error);
    }
    wakeWaiters(current.id, { status: "timed_out" });
    return updated;
  }

  // Route dispatch for the loopback gateway delegation. Returns true when the
  // request was owned (matched /v1/interaction*), so the execution gateway
  // keeps its own 404 semantics for everything else.
  async function loopbackHandler(req, res, parsed) {
    if (!parsed.pathname.startsWith("/v1/interaction")) return false;
    try {
      if (req.method === "POST" && parsed.pathname === "/v1/interaction") {
        await handleCreate(req, res);
        return true;
      }
      if (req.method === "GET" && /^\/v1\/interaction\/[^/]+\/wait$/.test(parsed.pathname)) {
        await handleWait(req, res, parsed);
        return true;
      }
      writeJson(res, 404, { error: { code: "AI_INTERACTION_ROUTE_FORBIDDEN", message: "Interaction route is not allowed." } });
    } catch (error) {
      writeJson(res, Number(error?.status) || 502, publicInteractionError(error));
    }
    return true;
  }

  async function listForUser(user, { status = "pending" } = {}) {
    const wanted = TERMINAL_STATUSES.includes(status) || status === "pending" ? status : null;
    if (!wanted) throw interactionError("VALIDATION_FAILED", "status must be pending, answered, cancelled, or timed_out.", 400);
    const items = await rows(
      `SELECT * FROM ai_interactions WHERE status = @status ORDER BY created_at DESC LIMIT ${INTERACTION_LIST_LIMIT}`,
      { status: wanted },
    );
    const visible = [];
    for (const item of items) {
      if (item.actor_id === user.id) {
        visible.push(item);
        continue;
      }
      if (hasPermission(user, "ai:*") && await canAccessProject(user, item.project_id)) {
        visible.push(item);
      }
    }
    return visible.map(publicInteraction);
  }

  async function findAccessible(user, id) {
    const record = await row("SELECT * FROM ai_interactions WHERE id = @id", { id: String(id || "") });
    if (!record) throw interactionError("RESOURCE_NOT_FOUND", "Interaction not found.", 404);
    const isInitiator = record.actor_id === user.id;
    const projectResponder = hasPermission(user, "ai:*") && await canAccessProject(user, record.project_id);
    if (!isInitiator && !projectResponder) {
      throw interactionError("PERMISSION_DENIED", "You cannot access this AI interaction.", 403);
    }
    return { isInitiator, record };
  }

  async function respond({ body = {}, id, ip, user }) {
    const { record } = await findAccessible(user, id);
    if (record.status !== "pending") {
      throw interactionError("AI_INTERACTION_ALREADY_SETTLED", "Interaction is no longer pending.", 409);
    }
    const payload = parseSnapshotColumn(record.payload, {});
    const response = record.kind === "approval"
      ? normalizeApprovalResponse(body)
      : normalizeQuestionResponse(payload, body.answer ?? body);
    const respondedAt = now();
    const patch = {
      responded_at: respondedAt,
      responded_by: user.id,
      response: json(response),
    };
    await writeAudit(user, "ai.interaction_responded", record, { response }, ip, record.project_id);
    const claimed = await claimTerminal(record.id, "answered", patch);
    if (!claimed) {
      throw interactionError("AI_INTERACTION_ALREADY_SETTLED", "Interaction is no longer pending.", 409);
    }
    const updated = { ...record, ...patch, status: "answered" };
    wakeWaiters(record.id, { response, status: "answered" });
    return publicInteraction(updated);
  }

  async function cancel({ id, ip, user }) {
    const { isInitiator, record } = await findAccessible(user, id);
    if (!isInitiator) {
      throw interactionError("PERMISSION_DENIED", "Only the initiating user can cancel an AI interaction.", 403);
    }
    if (record.status !== "pending") {
      throw interactionError("AI_INTERACTION_ALREADY_SETTLED", "Interaction is no longer pending.", 409);
    }
    const respondedAt = now();
    const patch = { responded_at: respondedAt, responded_by: user.id, response: json({ reason: "initiator_cancelled" }) };
    await writeAudit(user, "ai.interaction_cancelled", record, {}, ip, record.project_id);
    const claimed = await claimTerminal(record.id, "cancelled", patch);
    if (!claimed) {
      throw interactionError("AI_INTERACTION_ALREADY_SETTLED", "Interaction is no longer pending.", 409);
    }
    const updated = { ...record, ...patch, status: "cancelled" };
    wakeWaiters(record.id, { status: "cancelled" });
    return publicInteraction(updated);
  }

  async function sweepTimeouts({ referenceNow = new Date() } = {}) {
    pruneWaitTokens(referenceNow);
    const cutoff = referenceNow.toISOString();
    const pending = await rows("SELECT * FROM ai_interactions WHERE status = 'pending' AND expires_at <= @cutoff", { cutoff });
    let timedOut = 0;
    for (const item of pending) {
      const after = await markTimedOut(item);
      if (after.status === "timed_out") timedOut += 1;
    }
    return timedOut;
  }

  function start() {
    if (sweepTimer) return sweepTimer;
    sweepTimer = setInterval(() => {
      sweepTimeouts().catch((error) => {
        logger?.warn?.("AI interaction timeout sweep failed:", error?.code || error?.message || error);
      });
    }, sweepMs);
    sweepTimer?.unref?.();
    return sweepTimer;
  }

  function stop() {
    if (!sweepTimer) return;
    clearInterval(sweepTimer);
    sweepTimer = undefined;
    for (const [id] of waiters) wakeWaiters(id, { status: "cancelled" });
  }

  return {
    cancel,
    listForUser,
    loopbackHandler,
    respond,
    start,
    stop,
    sweepTimeouts,
    status: () => ({ pendingWaits: waiters.size, sweeping: Boolean(sweepTimer), waitTokens: waitTokens.size }),
  };
}

module.exports = {
  DEFAULT_INTERACTION_TIMEOUT_MS,
  DEFAULT_INTERACTION_WAIT_POLL_MS,
  KINDS,
  createAgentInteractionService,
  interactionError,
  normalizeApprovalPayload,
  normalizeApprovalResponse,
  normalizeQuestionPayload,
  normalizeQuestionResponse,
  publicInteraction,
};
