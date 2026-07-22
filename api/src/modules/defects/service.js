function buildDefectCreate(input = {}, { id, reporter }) {
  return {
    id,
    title: String(input.title).trim(),
    severity: input.severity || "medium",
    status: input.status || "new",
    project_id: input.projectId,
    requirement_id: input.requirementId || null,
    assignee: input.assignee || null,
    assignee_role: input.assigneeRole || (input.assignee ? "dev" : null),
    found_in_build: input.foundInBuild || null,
    affected_version: input.affectedVersion || null,
    reporter,
    version: 1,
  };
}

/**
 * Cross-role defect handoff actions (mirror task handoff style).
 * Status is derived from action + current status; clients must not override freely.
 */
const DEFECT_HANDOFF_ACTIONS = Object.freeze({
  assign_to_dev: Object.freeze({
    targetRole: "dev",
    fromStatuses: Object.freeze(["new", "confirmed", "resolved", "verified", "in_fix"]),
    deriveStatus(currentStatus) {
      if (["new", "confirmed", "resolved", "verified"].includes(currentStatus)) return "in_fix";
      return currentStatus;
    },
    label: "指派开发修复",
  }),
  assign_to_qa: Object.freeze({
    targetRole: "qa",
    fromStatuses: Object.freeze(["new", "confirmed", "in_fix", "resolved"]),
    deriveStatus(currentStatus) {
      if (["new", "confirmed", "in_fix"].includes(currentStatus)) return "resolved";
      return currentStatus;
    },
    label: "指派测试验证",
  }),
});

function resolveDefectHandoffAction(action) {
  const key = String(action || "").trim();
  return DEFECT_HANDOFF_ACTIONS[key] || null;
}

function buildDefectHandoffUpdate(before, { expectedVersion, assignee, assigneeRole, status }) {
  return {
    id: before.id,
    expectedVersion,
    assignee: String(assignee || "").trim(),
    assigneeRole: assigneeRole || null,
    status,
  };
}

module.exports = {
  DEFECT_HANDOFF_ACTIONS,
  buildDefectCreate,
  buildDefectHandoffUpdate,
  resolveDefectHandoffAction,
};
