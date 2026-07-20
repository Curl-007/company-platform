function buildRiskCreate(input = {}, { id, projectId, now }) {
  return {
    id,
    project_id: projectId,
    title: String(input.title).trim(),
    description: String(input.description || ""),
    severity: input.severity || "medium",
    status: input.status || "open",
    owner_id: input.ownerId || null,
    owner_name: input.ownerName || "",
    mitigation_plan: String(input.mitigationPlan || ""),
    due_date: input.dueDate || null,
    created_at: now(),
    updated_at: now(),
    closed_at: null,
  };
}

function buildRiskUpdate(before, input = {}, { now }) {
  const status = input.status ?? before.status;
  return {
    id: before.id,
    title: input.title !== undefined ? String(input.title).trim() : before.title,
    description: input.description !== undefined ? String(input.description) : before.description,
    severity: input.severity ?? before.severity,
    status,
    ownerId: input.ownerId !== undefined ? input.ownerId || null : before.owner_id,
    ownerName: input.ownerName !== undefined ? input.ownerName || "" : before.owner_name,
    mitigationPlan: input.mitigationPlan !== undefined ? String(input.mitigationPlan || "") : before.mitigation_plan,
    dueDate: input.dueDate !== undefined ? input.dueDate || null : before.due_date,
    updatedAt: now(),
    closedAt: status === "closed" ? (before.closed_at || now()) : null,
  };
}

function buildDecisionCreate(input = {}, { id, projectId, actor, now }) {
  const status = input.status || "proposed";
  return {
    id,
    project_id: projectId,
    title: String(input.title).trim(),
    context: String(input.context || ""),
    decision: String(input.decision || ""),
    owner_id: input.ownerId || actor.id,
    owner_name: input.ownerName || actor.name,
    status,
    decided_at: status === "approved" || status === "rejected" ? now() : null,
    created_at: now(),
    updated_at: now(),
  };
}

module.exports = {
  buildDecisionCreate,
  buildRiskCreate,
  buildRiskUpdate,
};
