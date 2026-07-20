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
  };
}

module.exports = { buildDefectCreate };
