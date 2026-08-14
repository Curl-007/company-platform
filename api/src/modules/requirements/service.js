const {
  REQUIREMENT_ASSIGNMENT_STATUSES,
  validateRequirementCreate: validateRequirementCreateSchema,
  validateRequirementUpdate: validateRequirementUpdateSchema,
} = require("./schema");

const REFERENCE_FIELDS = Object.freeze(["productId", "portfolioId"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateReferenceId(value, field) {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string" && typeof value !== "number") {
    return { ok: false, message: `${field} must be a string.`, field };
  }
  const normalized = String(value).trim();
  if (!normalized) return { ok: false, message: `${field} must not be empty.`, field };
  return { ok: true, value: normalized };
}

function validateRequirementCreate(body = {}, options = {}) {
  return validateRequirementCreateSchema(body, options);
}

function validateRequirementUpdate(body = {}, options = {}) {
  if (!isPlainObject(body)) return validateRequirementUpdateSchema(body, options);

  const schemaBody = { ...body };
  for (const field of REFERENCE_FIELDS) delete schemaBody[field];
  const parsed = validateRequirementUpdateSchema(schemaBody, options);
  if (!parsed.ok) return parsed;

  for (const field of REFERENCE_FIELDS) {
    if (body[field] === undefined) continue;
    const reference = validateReferenceId(body[field], field);
    if (!reference.ok) return reference;
    parsed.data[field] = reference.value;
  }
  return parsed;
}

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
  let assignmentStatus;
  if (input.assignmentStatus === undefined) {
    assignmentStatus = before.assignment_status;
  } else {
    assignmentStatus = REQUIREMENT_ASSIGNMENT_STATUSES.includes(input.assignmentStatus)
      ? input.assignmentStatus
      : "unassigned";
  }

  let completion;
  if (input.completion === undefined) {
    completion = before.completion;
  } else {
    completion = Number(input.completion);
  }

  return {
    id: before.id,
    expectedVersion,
    title: input.title === undefined ? before.title : String(input.title).trim(),
    description: input.description === undefined ? before.description : input.description,
    priority: input.priority === undefined ? before.priority : input.priority,
    acceptanceCriteria: input.acceptanceCriteria === undefined
      ? before.acceptance_criteria
      : json(input.acceptanceCriteria),
    productId: input.productId === undefined ? before.product_id || null : input.productId || null,
    portfolioId: input.portfolioId === undefined ? before.portfolio_id || null : input.portfolioId || null,
    parentId: input.parentId === undefined ? before.parent_id : input.parentId || null,
    assignee: input.assignee === undefined ? before.assignee : input.assignee || null,
    assigneeRole: input.assigneeRole === undefined ? before.assignee_role : input.assigneeRole || null,
    assignmentStatus,
    completion,
  };
}

module.exports = {
  buildRequirementCreate,
  buildRequirementUpdate,
  validateRequirementCreate,
  validateRequirementUpdate,
};
