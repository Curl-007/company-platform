const openapi = require("../../../openapi.json");

const HTTP_METHODS = Object.freeze(["get", "post", "put", "patch", "delete"]);
const WRITE_METHODS = new Set(["post", "put", "patch", "delete"]);

// These routes are transport, identity, secret-management, or AI-runtime
// control surfaces. They are intentionally not callable by a model through
// the platform business tool. All remaining JSON business routes stay in the
// registry and continue to enforce their existing REST permissions.
const EXCLUDED_PREFIXES = Object.freeze([
  "/api/admin/ai-",
  "/api/ai/",
  "/api/auth/",
  "/api/health",
  "/api/meta/",
  "/api/objects/",
]);

const EXCLUDED_OPERATIONS = new Set([
  "POST /api/activity/page-view",
  "POST /api/documents/{id}/object",
  "POST /api/documents/{id}/upload-url",
  "POST /api/products/{id}/images",
  "GET /api/products/{id}/images/{imageId}/content",
]);

const DOMAIN_ALIASES = Object.freeze({
  "audit-logs": "governance",
  builds: "delivery",
  delivery: "delivery",
  org: "organization",
  portfolios: "strategy",
  programs: "strategy",
  releases: "delivery",
  "strategic-goals": "strategy",
  "test-cases": "testing",
  "test-plans": "testing",
  "test-runs": "testing",
  tests: "testing",
  users: "organization",
});

const DOMAIN_LABELS = Object.freeze({
  capacity: "capacity and workload",
  dashboard: "dashboards",
  defects: "defects",
  delivery: "builds, releases, and delivery gates",
  documents: "documents",
  flow: "workflow and delivery flow",
  governance: "audit and governance",
  organization: "organization, people, and users",
  products: "products",
  projects: "projects",
  reports: "reports",
  requirements: "requirements",
  sprints: "sprints",
  strategy: "goals, programs, and portfolios",
  tasks: "tasks",
  testing: "test plans, cases, runs, and quality",
  "time-entries": "time entries",
  "work-logs": "work logs",
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value, field) {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw platformOperationError("VALIDATION_FAILED", `${field} must be an object.`);
  return value;
}

function platformOperationError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeText(value, field, maxLength = 256) {
  if (typeof value !== "string") throw platformOperationError("VALIDATION_FAILED", `${field} must be a string.`);
  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw platformOperationError("VALIDATION_FAILED", `${field} is invalid.`);
  }
  return text;
}

function containsUnsafeKey(value) {
  if (Array.isArray(value)) return value.some(containsUnsafeKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, item]) => (
    key === "__proto__" || key === "constructor" || key === "prototype" || containsUnsafeKey(item)
  ));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function operationKey(method, path) {
  return `${String(method).toUpperCase()} ${path}`;
}

function operationId(method, path) {
  return `${String(method).toLowerCase()}_${path
    .replace(/^\/api\//, "")
    .replace(/[{}]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()}`;
}

function domainForPath(path) {
  const firstSegment = String(path).split("/").filter(Boolean)[1] || "platform";
  return DOMAIN_ALIASES[firstSegment] || firstSegment;
}

function pathParameters(path) {
  return [...String(path).matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function resolveLocalRef(document, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  return ref.slice(2).split("/").reduce((value, rawSegment) => {
    if (!isRecord(value)) return null;
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    return Object.prototype.hasOwnProperty.call(value, segment) ? value[segment] : null;
  }, document);
}

const PUBLIC_SCHEMA_SCALAR_KEYS = Object.freeze([
  "type", "format", "description", "default", "nullable", "readOnly", "writeOnly",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength",
  "minItems", "maxItems", "uniqueItems", "pattern", "minProperties", "maxProperties",
]);

function publicSchema(document, rawSchema, seenRefs = new Set(), depth = 0) {
  if (!isRecord(rawSchema)) return {};
  if (depth > 10) return { description: "Nested schema omitted after the catalog depth limit." };
  if (rawSchema.$ref) {
    const ref = String(rawSchema.$ref);
    if (seenRefs.has(ref)) return { $ref: ref };
    const resolved = resolveLocalRef(document, ref);
    if (!isRecord(resolved)) return { $ref: ref };
    const nextSeen = new Set(seenRefs);
    nextSeen.add(ref);
    return { schemaRef: ref, ...publicSchema(document, resolved, nextSeen, depth + 1) };
  }

  const schema = {};
  for (const key of PUBLIC_SCHEMA_SCALAR_KEYS) {
    const value = rawSchema[key];
    if (["string", "number", "boolean"].includes(typeof value)) schema[key] = value;
  }
  if (Array.isArray(rawSchema.enum)) schema.enum = cloneJson(rawSchema.enum);
  if (Array.isArray(rawSchema.required)) schema.required = rawSchema.required.map(String);
  if (isRecord(rawSchema.properties)) {
    schema.properties = Object.fromEntries(Object.entries(rawSchema.properties).map(([name, value]) => (
      [name, publicSchema(document, value, seenRefs, depth + 1)]
    )));
  }
  if (isRecord(rawSchema.items)) schema.items = publicSchema(document, rawSchema.items, seenRefs, depth + 1);
  for (const keyword of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(rawSchema[keyword])) {
      schema[keyword] = rawSchema[keyword].map((value) => publicSchema(document, value, seenRefs, depth + 1));
    }
  }
  if (typeof rawSchema.additionalProperties === "boolean") {
    schema.additionalProperties = rawSchema.additionalProperties;
  } else if (isRecord(rawSchema.additionalProperties)) {
    schema.additionalProperties = publicSchema(document, rawSchema.additionalProperties, seenRefs, depth + 1);
  }
  return schema;
}

function resolvedParameter(document, rawParameter) {
  if (!isRecord(rawParameter)) return null;
  if (!rawParameter.$ref) return rawParameter;
  const resolved = resolveLocalRef(document, rawParameter.$ref);
  return isRecord(resolved) ? resolved : null;
}

function publicRequestContract(document, pathItem, definition) {
  const parameters = new Map();
  for (const rawParameter of [...(pathItem.parameters || []), ...(definition.parameters || [])]) {
    const parameter = resolvedParameter(document, rawParameter);
    if (!parameter || !["path", "query"].includes(parameter.in) || typeof parameter.name !== "string") continue;
    parameters.set(`${parameter.in}:${parameter.name}`, parameter);
  }
  const contract = {};
  for (const location of ["path", "query"]) {
    const entries = [...parameters.values()].filter((parameter) => parameter.in === location);
    if (!entries.length) continue;
    contract[location] = Object.fromEntries(entries.map((parameter) => [parameter.name, {
      required: location === "path" || parameter.required === true,
      ...(parameter.description ? { description: String(parameter.description) } : {}),
      schema: publicSchema(document, parameter.schema),
    }]));
  }
  const bodyDefinition = definition.requestBody?.$ref
    ? resolveLocalRef(document, definition.requestBody.$ref)
    : definition.requestBody;
  const bodySchema = bodyDefinition?.content?.["application/json"]?.schema;
  if (isRecord(bodySchema)) {
    contract.body = {
      required: bodyDefinition.required === true,
      schema: publicSchema(document, bodySchema),
    };
  }
  return contract;
}

function isEligibleOperation(method, path) {
  const key = operationKey(method, path);
  if (EXCLUDED_OPERATIONS.has(key)) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function buildOperations(document = openapi) {
  const operations = [];
  for (const [path, item] of Object.entries(document?.paths || {})) {
    if (!isRecord(item)) continue;
    for (const method of HTTP_METHODS) {
      const definition = item[method];
      if (!isRecord(definition) || !isEligibleOperation(method, path)) continue;
      const id = operationId(method, path);
      operations.push(Object.freeze({
        action: id,
        domain: domainForPath(path),
        hasBody: Boolean(definition.requestBody),
        method: method.toUpperCase(),
        path,
        pathParameters: Object.freeze(pathParameters(path)),
        request: Object.freeze(publicRequestContract(document, item, definition)),
        summary: String(definition.summary || definition.description || `${method.toUpperCase()} ${path}`).replace(/\s+/g, " ").trim().slice(0, 240),
        write: WRITE_METHODS.has(method),
      }));
    }
  }
  operations.sort((left, right) => left.action.localeCompare(right.action));
  const ids = new Set();
  for (const operation of operations) {
    if (ids.has(operation.action)) {
      throw new Error(`Duplicate platform operation action: ${operation.action}`);
    }
    ids.add(operation.action);
  }
  return Object.freeze(operations);
}

const PLATFORM_OPERATIONS = buildOperations();
const operationsByAction = new Map(PLATFORM_OPERATIONS.map((operation) => [operation.action, operation]));
const operationsByDomain = new Map();
for (const operation of PLATFORM_OPERATIONS) {
  const list = operationsByDomain.get(operation.domain) || [];
  list.push(operation);
  operationsByDomain.set(operation.domain, list);
}

const PLATFORM_DOMAINS = Object.freeze([...operationsByDomain.entries()]
  .map(([id, operations]) => Object.freeze({
    id,
    label: DOMAIN_LABELS[id] || id.replace(/-/g, " "),
    operations: Object.freeze([...operations]),
  }))
  .sort((left, right) => left.id.localeCompare(right.id)));

function listPlatformOperations(domain) {
  const normalized = String(domain || "").trim();
  if (!normalized) return PLATFORM_OPERATIONS;
  const entries = operationsByDomain.get(normalized);
  return entries ? Object.freeze([...entries]) : Object.freeze([]);
}

function listPlatformDomains() {
  return PLATFORM_DOMAINS;
}

function findPlatformOperation(action, domain) {
  const operation = operationsByAction.get(String(action || "").trim()) || null;
  if (!operation) return null;
  if (domain && operation.domain !== String(domain).trim()) return null;
  return operation;
}

function normalizeScalarQuery(value, field) {
  if (typeof value === "string") {
    if (value.length > 4000) throw platformOperationError("VALIDATION_FAILED", `${field} is too long.`);
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  throw platformOperationError("VALIDATION_FAILED", `${field} must be a JSON scalar.`);
}

function normalizeQuery(raw) {
  const source = safeObject(raw, "request.query");
  const keys = Object.keys(source);
  if (keys.length > 32) throw platformOperationError("VALIDATION_FAILED", "request.query has too many fields.");
  const query = {};
  for (const key of keys) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(key)) {
      throw platformOperationError("VALIDATION_FAILED", "request.query contains an invalid key.");
    }
    const value = source[key];
    if (Array.isArray(value)) {
      if (value.length > 32) throw platformOperationError("VALIDATION_FAILED", `request.query.${key} has too many values.`);
      query[key] = value.map((item) => normalizeScalarQuery(item, `request.query.${key}`));
    } else {
      query[key] = normalizeScalarQuery(value, `request.query.${key}`);
    }
  }
  return query;
}

function normalizePlatformRequest(operation, request) {
  const source = safeObject(request, "request");
  const allowed = new Set(["body", "path", "query"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw platformOperationError("VALIDATION_FAILED", "request contains unsupported fields.");
  }
  if (containsUnsafeKey(source)) {
    throw platformOperationError("VALIDATION_FAILED", "request contains unsafe property names.");
  }

  const rawPath = safeObject(source.path, "request.path");
  const requiredPath = new Set(operation.pathParameters);
  if (Object.keys(rawPath).some((key) => !requiredPath.has(key))) {
    throw platformOperationError("VALIDATION_FAILED", "request.path contains unsupported fields.");
  }
  const path = {};
  for (const parameter of operation.pathParameters) {
    path[parameter] = normalizeText(rawPath[parameter], `request.path.${parameter}`, 256);
  }

  if (!operation.hasBody && source.body !== undefined) {
    throw platformOperationError("VALIDATION_FAILED", "This operation does not accept a JSON body.");
  }
  const body = source.body === undefined ? undefined : cloneJson(source.body);
  const serializedBody = body === undefined ? "" : JSON.stringify(body);
  if (serializedBody.length > 64 * 1024) {
    throw platformOperationError("VALIDATION_FAILED", "request.body is too large.", 413);
  }

  return Object.freeze({
    ...(body !== undefined ? { body } : {}),
    path: Object.freeze(path),
    query: Object.freeze(normalizeQuery(source.query)),
  });
}

function buildPlatformRequestUrl(baseUrl, operation, request) {
  let resolvedPath = operation.path;
  for (const parameter of operation.pathParameters) {
    resolvedPath = resolvedPath.replace(`{${parameter}}`, encodeURIComponent(request.path[parameter]));
  }
  const url = new URL(resolvedPath, baseUrl);
  for (const [key, value] of Object.entries(request.query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) url.searchParams.append(key, item);
  }
  return url;
}

function publicPlatformOperation(operation) {
  return {
    action: operation.action,
    domain: operation.domain,
    hasBody: operation.hasBody,
    method: operation.method,
    path: operation.path,
    pathParameters: [...operation.pathParameters],
    request: cloneJson(operation.request),
    summary: operation.summary,
    write: operation.write,
  };
}

module.exports = {
  EXCLUDED_OPERATIONS,
  EXCLUDED_PREFIXES,
  PLATFORM_DOMAINS,
  PLATFORM_OPERATIONS,
  buildOperations,
  buildPlatformRequestUrl,
  findPlatformOperation,
  isEligibleOperation,
  listPlatformDomains,
  listPlatformOperations,
  normalizePlatformRequest,
  platformOperationError,
  publicPlatformOperation,
};
