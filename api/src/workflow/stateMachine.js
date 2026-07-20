const STATUS_VALUES = Object.freeze({
  project: Object.freeze(["planning", "active", "on_hold", "done", "archived"]),
  requirement: Object.freeze(["draft", "reviewing", "approved", "in_dev", "testing", "accepted", "closed", "cancelled"]),
  task: Object.freeze(["todo", "in_progress", "blocked", "code_review", "testing", "acceptance", "done", "cancelled"]),
  sprint: Object.freeze(["planned", "active", "closed"]),
  aiJob: Object.freeze(["queued", "running", "awaiting_review", "confirmed", "rejected", "failed", "retried"]),
});

const TRANSITIONS = Object.freeze({
  project: Object.freeze({
    planning: Object.freeze(["active", "on_hold", "archived"]),
    active: Object.freeze(["on_hold", "done"]),
    on_hold: Object.freeze(["active", "archived"]),
    done: Object.freeze(["archived"]),
    archived: Object.freeze([]),
  }),
  requirement: Object.freeze({
    draft: Object.freeze(["reviewing", "cancelled"]),
    reviewing: Object.freeze(["draft", "approved", "cancelled"]),
    approved: Object.freeze(["in_dev", "cancelled"]),
    in_dev: Object.freeze(["testing", "cancelled"]),
    testing: Object.freeze(["in_dev", "accepted", "cancelled"]),
    accepted: Object.freeze(["closed"]),
    closed: Object.freeze([]),
    cancelled: Object.freeze([]),
  }),
  task: Object.freeze({
    todo: Object.freeze(["in_progress", "cancelled"]),
    in_progress: Object.freeze(["blocked", "code_review", "cancelled"]),
    blocked: Object.freeze(["in_progress", "cancelled"]),
    code_review: Object.freeze(["in_progress", "testing", "cancelled"]),
    testing: Object.freeze(["in_progress", "acceptance", "cancelled"]),
    acceptance: Object.freeze(["testing", "done", "cancelled"]),
    done: Object.freeze([]),
    cancelled: Object.freeze([]),
  }),
  sprint: Object.freeze({
    planned: Object.freeze(["active", "closed"]),
    active: Object.freeze(["closed"]),
    closed: Object.freeze([]),
  }),
  aiJob: Object.freeze({
    queued: Object.freeze(["running", "failed"]),
    running: Object.freeze(["awaiting_review", "failed"]),
    awaiting_review: Object.freeze(["confirmed", "rejected"]),
    confirmed: Object.freeze([]),
    rejected: Object.freeze(["retried"]),
    failed: Object.freeze(["retried"]),
    retried: Object.freeze(["queued"]),
  }),
});

function isKnownStatus(resource, status) {
  return Boolean(STATUS_VALUES[resource]?.includes(status));
}

function canTransition(resource, from, to) {
  if (!isKnownStatus(resource, from) || !isKnownStatus(resource, to)) return false;
  if (from === to) return true;
  return TRANSITIONS[resource][from].includes(to);
}

function allowedTransitions(resource, from) {
  return TRANSITIONS[resource]?.[from] || [];
}

module.exports = {
  STATUS_VALUES,
  TRANSITIONS,
  allowedTransitions,
  canTransition,
  isKnownStatus,
};
