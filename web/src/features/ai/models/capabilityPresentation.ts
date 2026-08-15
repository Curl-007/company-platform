import type {
  AiCapabilityInputSchema,
  AiCapabilityManifest,
  AiCapabilityOutputSchema,
  AiCapabilityStringField,
} from '../../../types';

const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const CAPABILITY_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const INPUT_FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const MAX_CAPABILITY_FIELDS = 12;
const MAX_INPUT_LENGTH = 4096;

type UnknownRecord = Record<string, unknown>;

export interface CapabilityInputField {
  name: string;
  required: boolean;
  minLength: number;
  maxLength: number;
}

export interface CapabilityInputValidation {
  input: Record<string, string>;
  invalidFields: string[];
}

export interface CapabilityOutputEntry {
  name: string;
  value: string;
  /** The entry renders as a link (e.g. a screenshot artifact route). */
  link?: string;
}

/**
 * Rendered risk labels for the capability tray. read_only/project_write stay
 * informational; external_action (e.g. browser-control) is called out so the
 * user knows the capability drives side effects outside the project realm.
 */
export const CAPABILITY_RISK_LABELS: Record<string, string> = {
  read_only: 'read_only',
  project_write: 'project_write',
  external_action: 'external_action',
};

/** Fields whose value is an artifact reference served by a scoped route. */
const ARTIFACT_LINK_FIELDS: Record<string, (value: string) => string> = {
  screenshotKey: (value) => `/api/ai/browser/screenshots/${encodeURIComponent(value)}`,
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asBound(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_INPUT_LENGTH
    ? value
    : null;
}

function normalizeInputField(value: unknown): AiCapabilityStringField | null {
  if (!isRecord(value) || value.type !== 'string') return null;
  const minLength = asBound(value.minLength, 0);
  const maxLength = asBound(value.maxLength, 1024);
  if (minLength === null || maxLength === null || maxLength < minLength) return null;
  return {
    type: 'string',
    ...(value.minLength === undefined ? {} : { minLength }),
    ...(value.maxLength === undefined ? {} : { maxLength }),
  };
}

function normalizeInputSchema(value: unknown): AiCapabilityInputSchema | null {
  if (!isRecord(value) || value.type !== 'object' || value.additionalProperties !== false || !isRecord(value.properties)) {
    return null;
  }

  const entries = Object.entries(value.properties);
  if (entries.length > MAX_CAPABILITY_FIELDS) return null;
  const properties: Record<string, AiCapabilityStringField> = {};
  for (const [name, field] of entries) {
    if (!INPUT_FIELD_PATTERN.test(name)) return null;
    const normalized = normalizeInputField(field);
    if (!normalized) return null;
    properties[name] = normalized;
  }

  const required = value.required === undefined ? [] : value.required;
  if (!Array.isArray(required) || required.some((name) => typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(properties, name))) {
    return null;
  }
  const requiredFields = required as string[];

  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(requiredFields.length ? { required: [...new Set(requiredFields)] } : {}),
  };
}

function normalizeOutputSchema(value: unknown): AiCapabilityOutputSchema | null {
  if (!isRecord(value) || value.type !== 'object' || value.additionalProperties !== false || !isRecord(value.properties)) {
    return null;
  }

  const entries = Object.entries(value.properties);
  if (entries.length > MAX_CAPABILITY_FIELDS) return null;
  const properties: Record<string, { type: string }> = {};
  for (const [name, field] of entries) {
    if (!INPUT_FIELD_PATTERN.test(name) || !isRecord(field) || typeof field.type !== 'string' || !field.type.trim()) {
      return null;
    }
    properties[name] = { type: field.type };
  }
  return { type: 'object', additionalProperties: false, properties };
}

/**
 * Accept only the declarative subset the UI knows how to render. This is a
 * presentation guard, not an authorization decision; the BFF remains the
 * authority for every invocation.
 */
export function normalizeAiCapabilityManifest(value: unknown): AiCapabilityManifest | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !CAPABILITY_ID_PATTERN.test(value.id)) return null;
  if (typeof value.version !== 'string' || !CAPABILITY_VERSION_PATTERN.test(value.version)) return null;
  if (value.status !== 'approved' || value.requiresConfirmation !== false) return null;
  const risk = value.risk;
  if (risk !== 'read_only' && risk !== 'project_write' && risk !== 'external_action') return null;
  if (!Array.isArray(value.scopes) || value.scopes.length === 0 || value.scopes.length > 16) return null;
  if (value.scopes.some((scope) => typeof scope !== 'string' || !scope.trim() || scope.length > 120)) return null;

  const inputSchema = normalizeInputSchema(value.inputSchema);
  const outputSchema = normalizeOutputSchema(value.outputSchema);
  if (!inputSchema || !outputSchema) return null;

  const scopes = value.scopes as string[];
  return {
    id: value.id,
    version: value.version,
    status: 'approved',
    risk,
    scopes: [...new Set(scopes)],
    inputSchema,
    outputSchema,
    requiresConfirmation: false,
  };
}

/** Supports the planned `{ capabilities }` envelope and an array-only rollout. */
export function normalizeAiCapabilityList(value: unknown): AiCapabilityManifest[] {
  const candidates = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.capabilities)
      ? value.capabilities
      : [];
  const seen = new Set<string>();
  const capabilities: AiCapabilityManifest[] = [];
  for (const candidate of candidates) {
    const capability = normalizeAiCapabilityManifest(candidate);
    if (capability && !seen.has(capability.id)) {
      seen.add(capability.id);
      capabilities.push(capability);
    }
  }
  return capabilities;
}

export function capabilityInputFields(capability: AiCapabilityManifest): CapabilityInputField[] {
  const required = new Set(capability.inputSchema.required ?? []);
  return Object.entries(capability.inputSchema.properties)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, field]) => ({
      name,
      required: required.has(name),
      minLength: field.minLength ?? 0,
      maxLength: field.maxLength ?? 1024,
    }));
}

/** Keep browser-submitted values within the declared BFF input contract. */
export function validateCapabilityInput(
  capability: AiCapabilityManifest,
  values: Record<string, string>,
): CapabilityInputValidation {
  const input: Record<string, string> = {};
  const invalidFields: string[] = [];

  for (const field of capabilityInputFields(capability)) {
    const value = String(values[field.name] ?? '').trim();
    if (!value) {
      if (field.required) invalidFields.push(field.name);
      continue;
    }
    if (value.length < field.minLength || value.length > field.maxLength) {
      invalidFields.push(field.name);
      continue;
    }
    input[field.name] = value;
  }

  return { input, invalidFields };
}

function matchesOutputType(value: unknown, type: string): boolean {
  switch (type) {
    case 'array': return Array.isArray(value);
    case 'boolean': return typeof value === 'boolean';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'object': return isRecord(value);
    case 'string': return typeof value === 'string';
    default: return false;
  }
}

function formatOutputValue(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return serialized.length > MAX_INPUT_LENGTH ? `${serialized.slice(0, MAX_INPUT_LENGTH)}...` : serialized;
}

/** Render only fields declared by the approved manifest, never arbitrary BFF output. */
export function capabilityOutputEntries(
  capability: AiCapabilityManifest,
  result: unknown,
): CapabilityOutputEntry[] {
  if (!isRecord(result)) return [];

  return Object.entries(capability.outputSchema.properties).flatMap(([name, schema]) => {
    const value = result[name];
    if (!matchesOutputType(value, schema.type)) return [];
    const entry: CapabilityOutputEntry = { name, value: formatOutputValue(value) };
    const linkBuilder = ARTIFACT_LINK_FIELDS[name];
    if (typeof value === 'string' && linkBuilder && value.trim()) {
      entry.link = linkBuilder(value.trim());
    }
    return [entry];
  });
}
