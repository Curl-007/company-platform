// Central registry of the domain capabilities that may be executed through
// the AI execution gateway. It replaces the previously hardcoded
// "project-snapshot" allow list in the Harness runtime, the child tool plugin,
// and the gateway itself.
//
// Permission strings follow src/security/accessControl.js:
// - "project:read" / "requirement:read" are the literal page-level read rules
//   (tasks have no task:* namespace in the platform; they are project-scoped).
// - defects-list is declared as "project:read" (not "defect:read"): every
//   gateway caller must already hold the "ai:*" baseline, and the only roles
//   that do (admin "*", pm "ai:*") map to the project namespace. PM owns
//   project delivery and must read defects; qa holds "defect:*" but no "ai:*",
//   so it never reached the defect check in the first place — the move widens
//   access for PM and removes no reachable grant.
// - Writes reuse the exact REST route guards: POST /api/requirements requires
//   "requirement:*" and POST /api/projects/:id/wbs/tasks requires "project:*".

const EXECUTION_CAPABILITY_MODES = Object.freeze(new Set(["read", "write"]));
const PLATFORM_ASSISTANT_CAPABILITY_ID = "platform-assistant";
const PLATFORM_ASSISTANT_CAPABILITY_VERSION = "1.0.0";

const EXECUTION_CAPABILITIES = Object.freeze([
  // The ordinary AI chat uses this session-scoped capability to reach the
  // registered platform-operation gateway. Individual REST permissions are
  // still checked by the original platform route for every operation.
  Object.freeze({
    id: PLATFORM_ASSISTANT_CAPABILITY_ID,
    version: PLATFORM_ASSISTANT_CAPABILITY_VERSION,
    permission: "ai:*",
    mode: "read",
    projectScoped: false,
  }),
  Object.freeze({ id: "project-snapshot", version: "1.0.0", permission: "project:read", mode: "read" }),
  Object.freeze({ id: "requirements-list", version: "1.0.0", permission: "requirement:read", mode: "read" }),
  Object.freeze({ id: "requirement-get", version: "1.0.0", permission: "requirement:read", mode: "read" }),
  Object.freeze({ id: "tasks-list", version: "1.0.0", permission: "project:read", mode: "read" }),
  Object.freeze({ id: "defects-list", version: "1.0.0", permission: "project:read", mode: "read" }),
  Object.freeze({ id: "requirement-create", version: "1.0.0", permission: "requirement:*", mode: "write" }),
  Object.freeze({ id: "task-create", version: "1.0.0", permission: "project:*", mode: "write" }),
  // Scheduled reminders (Sprint 5.2): the capability only reads the project
  // realm, but creating a reminder mutates a platform table, so it is a
  // registry-level write (mandatory audit + project-writability re-check).
  Object.freeze({ id: "reminders-list", version: "1.0.0", permission: "project:read", mode: "read" }),
  Object.freeze({ id: "reminder-create", version: "1.0.0", permission: "project:read", mode: "write" }),
  // UI control (dsh -> frontend directives): touching a user's live UI session
  // is a user-visible side effect outside the project realm, so — like
  // reminder-create — it is declared as a write: every execution is bound to
  // the one-use scoped token and lands in the audit trail. It touches no
  // project data (projectScoped: false exempts it from the gateway's project
  // scope/writability gates), hence the ai:* baseline only.
  Object.freeze({ id: "ui-control", version: "1.0.0", permission: "ai:*", mode: "write", projectScoped: false }),
  // Browser control (dsh -> headless browser): drives a Playwright browser to
  // open pages, extract text, screenshot, click/type/press (form flows). Like
  // ui-control it is a write side effect outside the project realm — audit
  // first, one-use scoped token, ai:* baseline. Navigation targets go through
  // the browser URL policy (public web + localhost/allowlist, private IPs
  // blocked).
  Object.freeze({ id: "browser-control", version: "1.0.0", permission: "ai:*", mode: "write", projectScoped: false }),
]);

const byIdAndVersion = new Map(
  EXECUTION_CAPABILITIES.map((capability) => [`${capability.id}@${capability.version}`, capability]),
);

function findExecutionCapability(id, version) {
  const key = `${String(id || "").trim()}@${String(version || "").trim()}`;
  return byIdAndVersion.get(key) || null;
}

module.exports = {
  EXECUTION_CAPABILITIES,
  EXECUTION_CAPABILITY_MODES,
  PLATFORM_ASSISTANT_CAPABILITY_ID,
  PLATFORM_ASSISTANT_CAPABILITY_VERSION,
  findExecutionCapability,
};
