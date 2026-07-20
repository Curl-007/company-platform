function buildRequirementCreate(input = {}, { id, json }) {
  return {
    id,
    title: String(input.title).trim(),
    description: input.description || "",
    status: "draft",
    priority: input.priority || "medium",
    project_id: input.projectId,
    product_id: input.productId || null,
    portfolio_id: input.portfolioId || null,
    parent_id: input.parentId || null,
    owner: input.owner || "Product Office",
    assignee: input.assignee || null,
    assignee_role: input.assigneeRole || null,
    assignment_status: input.assignee ? "assigned" : "unassigned",
    completion: 0,
    linked_tasks: json([]),
    acceptance_criteria: json(Array.isArray(input.acceptanceCriteria) ? input.acceptanceCriteria : []),
    version: 1,
  };
}

function buildRequirementUpdate(before, input = {}, { expectedVersion, json }) {
  return {
    id: before.id,
    expectedVersion,
    title: input.title === undefined ? before.title : String(input.title).trim(),
    description: input.description === undefined ? before.description : input.description,
    priority: input.priority === undefined ? before.priority : input.priority,
    acceptanceCriteria: input.acceptanceCriteria === undefined ? before.acceptance_criteria : json(input.acceptanceCriteria),
    parentId: input.parentId === undefined ? before.parent_id : input.parentId || null,
    assignee: input.assignee === undefined ? before.assignee : input.assignee || null,
    assigneeRole: input.assigneeRole === undefined ? before.assignee_role : input.assigneeRole || null,
    assignmentStatus: input.assignmentStatus === undefined ? before.assignment_status : input.assignmentStatus || "unassigned",
    completion: input.completion === undefined ? before.completion : Number(input.completion) || 0,
  };
}

module.exports = {
  buildRequirementCreate,
  buildRequirementUpdate,
};
