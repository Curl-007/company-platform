import { unwrap, unwrapPost, unwrapPatch, unwrapDel } from '../../../services/apiClient';

// ---------------------------------------------------------------------------
// AI content masking rule administration (admin REST, /api/ai/masking/*).
// replace rules rewrite matched content with `replacement`; block rules reject
// the request outright. Structurally validated here, same style as
// interactions.ts.
// ---------------------------------------------------------------------------

export type AiMaskingMode = 'replace' | 'block';

export interface AiMaskingRule {
  id: string;
  name: string;
  mode: AiMaskingMode;
  pattern: string;
  /** Only meaningful for replace rules; block rules normalize to null. */
  replacement: string | null;
  isRegex: boolean;
  caseSensitive: boolean;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AiMaskingRuleInput {
  name: string;
  mode: AiMaskingMode;
  pattern: string;
  replacement?: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  enabled?: boolean;
}

export interface AiMaskingViolation {
  ruleId: string;
  name: string;
  pattern: string;
  mode: AiMaskingMode;
}

export interface AiMaskingTestResult {
  masked: string;
  violations: AiMaskingViolation[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeAiMaskingRule(value: unknown): AiMaskingRule {
  if (!isRecord(value)) throw new TypeError('Invalid AI masking rule response.');
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const pattern = typeof value.pattern === 'string' ? value.pattern : '';
  if (!id || !name || !pattern) throw new TypeError('Invalid AI masking rule response.');
  const mode: AiMaskingMode = value.mode === 'block' ? 'block' : 'replace';
  const replacement = typeof value.replacement === 'string' && value.replacement.length > 0
    ? value.replacement
    : null;
  return {
    id,
    name,
    mode,
    pattern,
    replacement,
    isRegex: value.isRegex === true,
    caseSensitive: value.caseSensitive === true,
    enabled: value.enabled !== false,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
  };
}

function normalizeAiMaskingViolation(value: unknown): AiMaskingViolation {
  if (!isRecord(value)) throw new TypeError('Invalid AI masking test response.');
  const ruleId = typeof value.ruleId === 'string' ? value.ruleId.trim() : '';
  if (!ruleId) throw new TypeError('Invalid AI masking test response.');
  return {
    ruleId,
    name: typeof value.name === 'string' ? value.name : '',
    pattern: typeof value.pattern === 'string' ? value.pattern : '',
    mode: value.mode === 'block' ? 'block' : 'replace',
  };
}

/** GET /api/ai/masking/rules → data.items */
export async function fetchAiMaskingRules(signal?: AbortSignal): Promise<AiMaskingRule[]> {
  const response = await unwrap<unknown>('/api/ai/masking/rules', { signal });
  const items = isRecord(response) && Array.isArray(response.items) ? response.items : [];
  return items.map(normalizeAiMaskingRule);
}

/** POST /api/ai/masking/rules → data.item */
export async function createAiMaskingRule(input: AiMaskingRuleInput): Promise<AiMaskingRule> {
  const response = await unwrapPost<{ item?: unknown }>('/api/ai/masking/rules', input, { invalidateCache: false });
  return normalizeAiMaskingRule(response.item);
}

/** PATCH /api/ai/masking/rules/:id (partial fields) → data.item */
export async function updateAiMaskingRule(
  id: string,
  patch: Partial<AiMaskingRuleInput>,
): Promise<AiMaskingRule> {
  const response = await unwrapPatch<{ item?: unknown }>(
    `/api/ai/masking/rules/${encodeURIComponent(id)}`,
    patch,
    { invalidateCache: false },
  );
  return normalizeAiMaskingRule(response.item);
}

/** DELETE /api/ai/masking/rules/:id → data.ok === true */
export async function deleteAiMaskingRule(id: string): Promise<boolean> {
  const response = await unwrapDel<unknown>(`/api/ai/masking/rules/${encodeURIComponent(id)}`);
  return isRecord(response) && response.ok === true;
}

/** POST /api/ai/masking/test { text } → data.{ masked, violations } */
export async function testAiMasking(text: string): Promise<AiMaskingTestResult> {
  const response = await unwrapPost<unknown>('/api/ai/masking/test', { text }, { invalidateCache: false });
  if (!isRecord(response)) throw new TypeError('Invalid AI masking test response.');
  return {
    masked: typeof response.masked === 'string' ? response.masked : '',
    violations: Array.isArray(response.violations) ? response.violations.map(normalizeAiMaskingViolation) : [],
  };
}
