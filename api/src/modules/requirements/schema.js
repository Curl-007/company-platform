/**
 * Module-level request contract for requirements writes.
 * Single source for runtime validation; keep OpenAPI schemas in sync with these constants.
 */

const { REQUIREMENT_PRIORITIES } = require("../../domain/enums");

const REQUIREMENT_ASSIGNMENT_STATUSES = Object.freeze(["unassigned", "assigned"]);
const REQUIREMENT_ASSIGNEE_ROLES = Object.freeze(["dev", "qa"]);

const CREATE_FIELDS = Object.freeze({
  title: { type: "string", required: true, minLength: 1 },
  projectId: { type: "string", required: true, minLength: 1 },
  owner: { type: "string", optional: true },
  priority: { type: "enum", values: REQUIREMENT_PRIORITIES, optional: true },
  description: { type: "string", optional: true, nullable: true },
  acceptanceCriteria: { type: "stringArray", optional: true },
  productId: { type: "string", optional: true, nullable: true },
  portfolioId: { type: "string", optional: true, nullable: true },
  parentId: { type: "string", optional: true, nullable: true },
  assignee: { type: "string", optional: true, nullable: true },
  assigneeRole: { type: "enum", values: REQUIREMENT_ASSIGNEE_ROLES, optional: true, nullable: true },
});

const UPDATE_FIELDS = Object.freeze({
  version: { type: "integer", required: true, minimum: 1 },
  title: { type: "string", optional: true, minLength: 1 },
  description: { type: "string", optional: true, nullable: true },
  priority: { type: "enum", values: REQUIREMENT_PRIORITIES, optional: true },
  acceptanceCriteria: { type: "stringArray", optional: true },
  parentId: { type: "string", optional: true, nullable: true },
  assignee: { type: "string", optional: true, nullable: true },
  assigneeRole: { type: "enum", values: REQUIREMENT_ASSIGNEE_ROLES, optional: true, nullable: true },
  assignmentStatus: { type: "enum", values: REQUIREMENT_ASSIGNMENT_STATUSES, optional: true },
  completion: { type: "integer", optional: true, minimum: 0, maximum: 100 },
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message, field) {
  return { ok: false, message, field: field || null };
}

function asOptionalString(value, { allowEmpty = false } = {}) {
  if (value === null) return { ok: true, value: null };
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "string" && typeof value !== "number") {
    return fail("must be a string");
  }
  const trimmed = String(value).trim();
  if (!allowEmpty && trimmed.length === 0) return fail("must not be empty");
  return { ok: true, value: trimmed };
}

function asEnum(value, values, { nullable = false } = {}) {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") {
    if (nullable) return { ok: true, value: null };
    return fail(`must be one of: ${values.join(", ")}`);
  }
  if (!values.includes(value)) return fail(`must be one of: ${values.join(", ")}`);
  return { ok: true, value };
}

function asStringArray(value) {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) return fail("must be an array of strings");
  const items = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== "string") return fail(`item at index ${i} must be a string`);
    items.push(item.trim());
  }
  return { ok: true, value: items };
}

function asInteger(value, { minimum, maximum } = {}) {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value === "boolean" || value === null || value === "") {
    return fail("must be an integer");
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    return fail("must be an integer");
  }
  if (minimum !== undefined && number < minimum) return fail(`must be >= ${minimum}`);
  if (maximum !== undefined && number > maximum) return fail(`must be <= ${maximum}`);
  return { ok: true, value: number };
}

function validateAgainst(body, fieldMap, { allowUnknown = false } = {}) {
  if (!isPlainObject(body)) return fail("Request body must be a JSON object.");

  if (!allowUnknown) {
    for (const key of Object.keys(body)) {
      if (!(key in fieldMap)) {
        return fail(`Unknown field: ${key}`, key);
      }
    }
  }

  const data = {};
  for (const [name, rule] of Object.entries(fieldMap)) {
    const raw = body[name];
    if (raw === undefined) {
      if (rule.required) return fail(`${name} is required.`, name);
      continue;
    }

    let result;
    if (rule.type === "string") {
      if (raw === null) {
        if (rule.nullable) {
          data[name] = null;
          continue;
        }
        return fail(`${name} must be a string.`, name);
      }
      result = asOptionalString(raw, { allowEmpty: (rule.minLength || 0) === 0 });
      if (!result.ok) return fail(`${name} ${result.message}.`, name);
      if (rule.minLength && result.value !== null && result.value.length < rule.minLength) {
        return fail(`${name} must not be empty.`, name);
      }
      data[name] = result.value;
      continue;
    }

    if (rule.type === "enum") {
      result = asEnum(raw, rule.values, { nullable: Boolean(rule.nullable) });
      if (!result.ok) return fail(`${name} ${result.message}.`, name);
      data[name] = result.value;
      continue;
    }

    if (rule.type === "stringArray") {
      result = asStringArray(raw);
      if (!result.ok) return fail(`${name} ${result.message}.`, name);
      data[name] = result.value;
      continue;
    }

    if (rule.type === "integer") {
      result = asInteger(raw, { minimum: rule.minimum, maximum: rule.maximum });
      if (!result.ok) return fail(`${name} ${result.message}.`, name);
      data[name] = result.value;
      continue;
    }

    return fail(`Unsupported schema type for ${name}.`, name);
  }

  return { ok: true, data };
}

/**
 * Validate and normalize POST /requirements body.
 */
function validateRequirementCreate(body = {}, options = {}) {
  const priorities = options.priorities || REQUIREMENT_PRIORITIES;
  const fields = {
    ...CREATE_FIELDS,
    priority: { ...CREATE_FIELDS.priority, values: priorities },
  };
  const result = validateAgainst(body || {}, fields, { allowUnknown: false });
  if (!result.ok) return result;

  // Title/projectId are required; re-assert after normalization.
  if (!result.data.title) return fail("Requirement title is required and cannot be empty.", "title");
  if (!result.data.projectId) return fail("Requirement projectId is required.", "projectId");

  return { ok: true, data: result.data };
}

/**
 * Validate and normalize PATCH /requirements/:id body (including version).
 */
function validateRequirementUpdate(body = {}, options = {}) {
  const priorities = options.priorities || REQUIREMENT_PRIORITIES;
  const fields = {
    ...UPDATE_FIELDS,
    priority: { ...UPDATE_FIELDS.priority, values: priorities },
  };
  const result = validateAgainst(body || {}, fields, { allowUnknown: false });
  if (!result.ok) return result;

  if (result.data.version === undefined) {
    return fail("A positive integer version is required when updating a requirement.", "version");
  }

  // Version-only bodies remain valid (optimistic no-op / concurrency probe).
  if (Object.prototype.hasOwnProperty.call(body || {}, "title") && !result.data.title) {
    return fail("title must not be empty.", "title");
  }

  return { ok: true, data: result.data };
}

/**
 * OpenAPI-oriented property descriptors derived from the same constants.
 * Useful for documentation alignment / future generators.
 */
function openApiRequirementSchemas() {
  return {
    assignmentStatuses: [...REQUIREMENT_ASSIGNMENT_STATUSES],
    assigneeRoles: [...REQUIREMENT_ASSIGNEE_ROLES],
    priorities: [...REQUIREMENT_PRIORITIES],
    createRequired: ["title", "projectId"],
    updateRequired: ["version"],
    createFields: CREATE_FIELDS,
    updateFields: UPDATE_FIELDS,
  };
}

module.exports = {
  CREATE_FIELDS,
  REQUIREMENT_ASSIGNEE_ROLES,
  REQUIREMENT_ASSIGNMENT_STATUSES,
  UPDATE_FIELDS,
  openApiRequirementSchemas,
  validateRequirementCreate,
  validateRequirementUpdate,
};
