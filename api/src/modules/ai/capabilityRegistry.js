const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const CAPABILITY_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const CAPABILITY_STATUSES = new Set(["approved", "disabled"]);
const CAPABILITY_RISKS = new Set(["read_only"]);
const OUTPUT_TYPES = new Set(["array", "boolean", "number", "object", "string"]);

function capabilityError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertString(value, label, { maxLength = 1024, minLength = 1, pattern } = {}) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength || (pattern && !pattern.test(value))) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", `${label} is invalid.`, 500);
  }
}

function validateInputSchema(schema) {
  if (!isRecord(schema) || schema.type !== "object" || schema.additionalProperties !== false || !isRecord(schema.properties)) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability inputSchema must be a closed object schema.", 500);
  }
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (required.some((key) => typeof key !== "string" || !Object.hasOwn(schema.properties, key))) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability inputSchema.required is invalid.", 500);
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    assertString(key, "Capability input property", { maxLength: 80 });
    if (!isRecord(property) || property.type !== "string") {
      throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability input properties must be strings.", 500);
    }
    if (property.minLength !== undefined && (!Number.isSafeInteger(property.minLength) || property.minLength < 0)) {
      throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability input minLength is invalid.", 500);
    }
    if (property.maxLength !== undefined && (!Number.isSafeInteger(property.maxLength) || property.maxLength < (property.minLength || 0))) {
      throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability input maxLength is invalid.", 500);
    }
  }
}

function validateOutputSchema(schema, { requireClosedObject = false } = {}) {
  if (!isRecord(schema) || !OUTPUT_TYPES.has(schema.type)) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability output schema is invalid.", 500);
  }
  if (schema.type === "string" && schema.maxLength !== undefined
    && (!Number.isSafeInteger(schema.maxLength) || schema.maxLength < 1 || schema.maxLength > 32_000)) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability output string maxLength is invalid.", 500);
  }
  if (schema.type === "array") {
    validateOutputSchema(schema.items);
    return;
  }
  if (schema.type !== "object") return;

  const hasProperties = schema.properties !== undefined;
  if (requireClosedObject && (schema.additionalProperties !== false || !isRecord(schema.properties))) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability outputSchema must be a closed object schema.", 500);
  }
  if (!hasProperties) {
    if (schema.required !== undefined || schema.additionalProperties !== undefined) {
      throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability output object schema is invalid.", 500);
    }
    return;
  }
  if (!isRecord(schema.properties) || (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean")) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability output object schema is invalid.", 500);
  }
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (schema.required !== undefined && required.some((key) => typeof key !== "string" || !Object.hasOwn(schema.properties, key))) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability outputSchema.required is invalid.", 500);
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    assertString(key, "Capability output property", { maxLength: 80 });
    validateOutputSchema(property);
  }
}

function validateOutputValue(schema, value, path = "result") {
  switch (schema.type) {
    case "string":
      if (typeof value !== "string" || (schema.maxLength !== undefined && value.length > schema.maxLength)) {
        throw capabilityError("AI_CAPABILITY_OUTPUT_INVALID", `${path} must be a valid string.`, 502);
      }
      return;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw capabilityError("AI_CAPABILITY_OUTPUT_INVALID", `${path} must be a finite number.`, 502);
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        throw capabilityError("AI_CAPABILITY_OUTPUT_INVALID", `${path} must be a boolean.`, 502);
      }
      return;
    case "array":
      if (!Array.isArray(value)) {
        throw capabilityError("AI_CAPABILITY_OUTPUT_INVALID", `${path} must be an array.`, 502);
      }
      value.forEach((item, index) => validateOutputValue(schema.items, item, `${path}[${index}]`));
      return;
    case "object": {
      if (!isRecord(value)) {
        throw capabilityError("AI_CAPABILITY_OUTPUT_INVALID", `${path} must be an object.`, 502);
      }
      if (!schema.properties) return;
      const allowed = new Set(Object.keys(schema.properties));
      if (schema.additionalProperties === false && Object.keys(value).some((key) => !allowed.has(key))) {
        throw capabilityError("AI_CAPABILITY_OUTPUT_INVALID", `${path} contains unsupported fields.`, 502);
      }
      for (const key of schema.required || []) {
        if (!Object.hasOwn(value, key)) {
          throw capabilityError("AI_CAPABILITY_OUTPUT_INVALID", `${path}.${key} is required.`, 502);
        }
      }
      for (const [key, property] of Object.entries(schema.properties)) {
        if (Object.hasOwn(value, key)) validateOutputValue(property, value[key], `${path}.${key}`);
      }
      return;
    }
    default:
      throw capabilityError("AI_CAPABILITY_OUTPUT_INVALID", `${path} has an unsupported schema type.`, 502);
  }
}

function validateCapabilityOutput(manifest, output) {
  validateOutputValue(manifest.outputSchema, output);
  return clone(output);
}

function validateCapabilityManifest(manifest) {
  if (!isRecord(manifest)) throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability manifest must be an object.", 500);
  assertString(manifest.id, "Capability id", { maxLength: 64, pattern: CAPABILITY_ID_PATTERN });
  assertString(manifest.version, "Capability version", { maxLength: 32, pattern: CAPABILITY_VERSION_PATTERN });
  if (!CAPABILITY_STATUSES.has(manifest.status)) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability status is invalid.", 500);
  }
  if (!CAPABILITY_RISKS.has(manifest.risk)) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability risk is invalid.", 500);
  }
  if (!Array.isArray(manifest.scopes) || manifest.scopes.length === 0 || manifest.scopes.some((scope) => typeof scope !== "string" || !scope.trim() || scope.length > 120)) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability scopes are invalid.", 500);
  }
  if (!Array.isArray(manifest.requiredPermissions) || manifest.requiredPermissions.length === 0 || manifest.requiredPermissions.some((permission) => typeof permission !== "string" || !permission.trim() || permission.length > 120)) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability requiredPermissions are invalid.", 500);
  }
  if (manifest.requiresConfirmation !== false) {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Read-only capabilities cannot require confirmation.", 500);
  }
  validateInputSchema(manifest.inputSchema);
  validateOutputSchema(manifest.outputSchema, { requireClosedObject: true });
  if (!isRecord(manifest.runtime) || manifest.runtime.kind !== "company_harness_tool") {
    throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", "Capability runtime must be a company Harness tool.", 500);
  }
  assertString(manifest.runtime.toolName, "Capability toolName", { maxLength: 80, pattern: /^[a-z][a-z0-9_]{1,63}$/ });
  return clone(manifest);
}

const PROJECT_SNAPSHOT_MANIFEST = Object.freeze(validateCapabilityManifest({
  id: "project-snapshot",
  version: "1.0.0",
  status: "approved",
  risk: "read_only",
  scopes: ["project-management"],
  requiredPermissions: ["ai:*"],
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["projectId"],
    properties: {
      projectId: { type: "string", minLength: 1, maxLength: 128 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "generatedBy", "modelFallback", "risks", "project", "metrics", "evidence"],
    properties: {
      summary: { type: "string", maxLength: 4000 },
      generatedBy: { type: "string", maxLength: 80 },
      modelFallback: { type: "boolean" },
      risks: { type: "array", items: { type: "string" } },
      project: { type: "object" },
      metrics: { type: "object" },
      evidence: { type: "array", items: { type: "string" } },
    },
  },
  requiresConfirmation: false,
  runtime: {
    kind: "company_harness_tool",
    toolName: "project_snapshot",
  },
}));

function publicManifest(manifest) {
  return {
    id: manifest.id,
    version: manifest.version,
    status: manifest.status,
    risk: manifest.risk,
    scopes: [...manifest.scopes],
    inputSchema: clone(manifest.inputSchema),
    outputSchema: clone(manifest.outputSchema),
    requiresConfirmation: manifest.requiresConfirmation,
  };
}

function normalizeInvocationInput(manifest, value) {
  if (!isRecord(value)) throw capabilityError("VALIDATION_FAILED", "Capability input must be an object.");
  const schema = manifest.inputSchema;
  const allowed = new Set(Object.keys(schema.properties));
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw capabilityError("VALIDATION_FAILED", "Capability input contains unsupported fields.");
  }
  const normalized = {};
  for (const key of schema.required || []) {
    if (!Object.hasOwn(value, key)) throw capabilityError("VALIDATION_FAILED", `${key} is required.`);
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!Object.hasOwn(value, key)) continue;
    const raw = value[key];
    if (typeof raw !== "string") throw capabilityError("VALIDATION_FAILED", `${key} must be a string.`);
    const trimmed = raw.trim();
    if (trimmed.length < (property.minLength || 0) || trimmed.length > (property.maxLength || 1024)) {
      throw capabilityError("VALIDATION_FAILED", `${key} has an invalid length.`);
    }
    normalized[key] = trimmed;
  }
  return normalized;
}

function createCapabilityRegistry(manifests = [PROJECT_SNAPSHOT_MANIFEST]) {
  const byId = new Map();
  for (const raw of manifests) {
    const manifest = validateCapabilityManifest(raw);
    if (byId.has(manifest.id)) throw capabilityError("AI_CAPABILITY_MANIFEST_INVALID", `Duplicate capability id: ${manifest.id}`, 500);
    byId.set(manifest.id, Object.freeze(manifest));
  }

  return {
    get(id) {
      return byId.get(String(id || "")) || null;
    },
    list() {
      return [...byId.values()];
    },
    normalizeInvocationInput(id, input) {
      const manifest = this.get(id);
      if (!manifest) throw capabilityError("RESOURCE_NOT_FOUND", "AI capability not found.", 404);
      return normalizeInvocationInput(manifest, input);
    },
    validateInvocationOutput(id, output) {
      const manifest = this.get(id);
      if (!manifest) throw capabilityError("RESOURCE_NOT_FOUND", "AI capability not found.", 404);
      return validateCapabilityOutput(manifest, output);
    },
    publicManifest,
  };
}

module.exports = {
  CAPABILITY_ID_PATTERN,
  CAPABILITY_VERSION_PATTERN,
  PROJECT_SNAPSHOT_MANIFEST,
  capabilityError,
  createCapabilityRegistry,
  validateCapabilityOutput,
  normalizeInvocationInput,
  publicManifest,
  validateCapabilityManifest,
};
