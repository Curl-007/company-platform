// AI data-masking rule service (防泄密关键字屏蔽/替换).
//
// The harness loopback proxy is the single HTTP egress for AI traffic, so it
// is also the single enforcement point for masking rules:
//   - request direction: block rules reject the call before it leaves the
//     process, replace rules rewrite matching strings in the JSON payload;
//   - response direction: replace rules strip echoed secrets from provider
//     text before it flows back to the dsh child.
// Rules persist in ai_masking_rules (snake_case storage); this module maps to
// camelCase API fields. Enabled rules are compiled once per process and held
// in a shared cache that every CRUD write invalidates, so administrator edits
// apply to the next proxied call without a restart. When rules cannot be
// loaded (for example the table is not migrated yet) the engine fails open:
// masking is a data-hygiene control, not an availability control.

const crypto = require("node:crypto");

const MASKING_RULE_MODES = Object.freeze(["replace", "block"]);
const MASKING_NAME_MAX_LENGTH = 256;
const MASKING_PATTERN_MAX_LENGTH = 512;
const MASKING_REPLACEMENT_MAX_LENGTH = 512;

function maskingError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

// Storage rows use snake_case + 0/1 integers; the API surface is camelCase.
function toPublicRule(record) {
  return {
    id: record.id,
    name: record.name,
    mode: record.mode,
    pattern: record.pattern,
    replacement: String(record.replacement || ""),
    isRegex: Number(record.is_regex) === 1,
    caseSensitive: Number(record.case_sensitive) === 1,
    enabled: Number(record.enabled) === 1,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function toStorageBooleans(rule) {
  return {
    is_regex: rule.isRegex ? 1 : 0,
    case_sensitive: rule.caseSensitive ? 1 : 0,
    enabled: rule.enabled ? 1 : 0,
  };
}

function createAiMaskingRuleRepository({ insert, row, rows, run }) {
  if (typeof insert !== "function" || typeof row !== "function" || typeof rows !== "function" || typeof run !== "function") {
    throw new Error("AI masking rule repository requires insert(), row(), rows(), and run() helpers.");
  }
  const COLUMNS = "id, name, mode, pattern, replacement, is_regex, case_sensitive, enabled, created_at, updated_at";
  return {
    async findById(id) {
      return row(`SELECT ${COLUMNS} FROM ai_masking_rules WHERE id = @id`, { id: String(id || "") });
    },
    async findByName(name) {
      return row(`SELECT ${COLUMNS} FROM ai_masking_rules WHERE name = @name`, { name: String(name || "") });
    },
    // Stable application order: replace rules run top to bottom by creation.
    async list() {
      return rows(`SELECT ${COLUMNS} FROM ai_masking_rules ORDER BY created_at, id`);
    },
    async listEnabled() {
      return rows(`SELECT ${COLUMNS} FROM ai_masking_rules WHERE enabled = 1 ORDER BY created_at, id`);
    },
    async create(record) {
      await insert("ai_masking_rules", record);
    },
    // fields: camelCase { name, mode, pattern, replacement, isRegex, caseSensitive, enabled, updatedAt }
    async update(id, fields) {
      const result = await run(
        `UPDATE ai_masking_rules
            SET name = @name, mode = @mode, pattern = @pattern, replacement = @replacement,
                is_regex = @isRegex, case_sensitive = @caseSensitive, enabled = @enabled,
                updated_at = @updatedAt
          WHERE id = @id`,
        {
          id: String(id || ""),
          name: fields.name,
          mode: fields.mode,
          pattern: fields.pattern,
          replacement: fields.replacement,
          isRegex: fields.isRegex ? 1 : 0,
          caseSensitive: fields.caseSensitive ? 1 : 0,
          enabled: fields.enabled ? 1 : 0,
          updatedAt: fields.updatedAt,
        },
      );
      return Number(result?.changes ?? result?.rowCount ?? 0) > 0;
    },
    async remove(id) {
      const result = await run("DELETE FROM ai_masking_rules WHERE id = @id", { id: String(id || "") });
      return Number(result?.changes ?? result?.rowCount ?? 0) > 0;
    },
  };
}

// Literal (non-regex) case-insensitive replace. Split/join on lowercased
// copies would destroy the original casing, so rebuild from match offsets.
function replaceLiteralInsensitive(text, search, replacement) {
  const lowerText = text.toLowerCase();
  const lowerSearch = search.toLowerCase();
  let result = "";
  let cursor = 0;
  for (;;) {
    const index = lowerText.indexOf(lowerSearch, cursor);
    if (index === -1) {
      result += text.slice(cursor);
      return result;
    }
    result += text.slice(cursor, index) + replacement;
    cursor = index + search.length;
  }
}

// Compiles a public-shape rule into { test(text), replace(text) } with
// caseSensitive/isRegex semantics. Regex replacements substitute literally
// (callback form), so "$&" in a replacement is never interpreted.
function compileMatcher(rule) {
  const pattern = String(rule.pattern || "");
  const replacement = String(rule.replacement || "");
  if (rule.isRegex) {
    let global;
    let probe;
    try {
      global = new RegExp(pattern, rule.caseSensitive ? "g" : "gi");
      probe = new RegExp(pattern, rule.caseSensitive ? "" : "i");
    } catch (error) {
      throw maskingError("AI_MASKING_RULE_PATTERN_INVALID", `Invalid regular expression: ${error?.message || error}`, 400);
    }
    return {
      test: (text) => probe.test(text),
      replace: (text) => text.replace(global, () => replacement),
    };
  }
  if (rule.caseSensitive) {
    return {
      test: (text) => text.includes(pattern),
      replace: (text) => (pattern ? text.split(pattern).join(replacement) : text),
    };
  }
  const lowerPattern = pattern.toLowerCase();
  return {
    test: (text) => text.toLowerCase().includes(lowerPattern),
    replace: (text) => (pattern ? replaceLiteralInsensitive(text, pattern, replacement) : text),
  };
}

function violationOf(rule) {
  return { ruleId: rule.id, name: rule.name, pattern: rule.pattern, mode: rule.mode };
}

// A policy is an immutable snapshot of compiled enabled rules. inspectText
// reports block-rule hits; maskText applies replace rules in order.
function createMaskingPolicy(compiledRules) {
  return {
    rules: compiledRules,
    inspectText(text) {
      const violations = [];
      for (const rule of compiledRules) {
        if (rule.mode !== "block") continue;
        if (rule.matcher.test(text)) violations.push(violationOf(rule));
      }
      return violations;
    },
    maskText(text) {
      let output = text;
      for (const rule of compiledRules) {
        if (rule.mode !== "replace") continue;
        output = rule.matcher.replace(output);
      }
      return output;
    },
    applyMasking(text) {
      return { text: this.maskText(text), violations: this.inspectText(text) };
    },
  };
}

// Single-flight cache: the first loader wins and its compiled rules are
// reused until invalidate() (every CRUD write) clears them.
function createMaskingRuleCache() {
  let cachedRules = null;
  let loadTask = null;
  return {
    async load(loader) {
      if (cachedRules) return cachedRules;
      loadTask ||= Promise.resolve().then(loader).then((rules) => {
        loadTask = null;
        cachedRules = rules;
        return rules;
      }, (error) => {
        loadTask = null;
        throw error;
      });
      return loadTask;
    },
    invalidate() {
      cachedRules = null;
    },
    status: () => ({ cached: Boolean(cachedRules), loading: Boolean(loadTask) }),
  };
}

// Shared across every service instance in this process so admin CRUD through
// the REST service invalidates the snapshot the proxy engine reads.
const sharedMaskingRuleCache = createMaskingRuleCache();

function normalizeBoolean(value) {
  return Boolean(value);
}

function normalizeRuleInput(body = {}, { partial = false } = {}) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const normalized = {};

  if (!partial || hasOwn("name")) {
    const name = String(body.name ?? "").trim();
    if (!name) throw maskingError("VALIDATION_FAILED", "AI masking rule name is required.", 400);
    if (name.length > MASKING_NAME_MAX_LENGTH) {
      throw maskingError("VALIDATION_FAILED", `AI masking rule name must be at most ${MASKING_NAME_MAX_LENGTH} characters.`, 400);
    }
    normalized.name = name;
  }
  if (!partial || hasOwn("mode")) {
    const mode = String(body.mode ?? "");
    if (!MASKING_RULE_MODES.includes(mode)) {
      throw maskingError("VALIDATION_FAILED", `AI masking rule mode must be one of: ${MASKING_RULE_MODES.join(", ")}.`, 400);
    }
    normalized.mode = mode;
  }
  if (!partial || hasOwn("pattern")) {
    const pattern = String(body.pattern ?? "");
    if (!pattern.trim()) throw maskingError("VALIDATION_FAILED", "AI masking rule pattern is required.", 400);
    if (pattern.length > MASKING_PATTERN_MAX_LENGTH) {
      throw maskingError("VALIDATION_FAILED", `AI masking rule pattern must be at most ${MASKING_PATTERN_MAX_LENGTH} characters.`, 400);
    }
    normalized.pattern = pattern;
  }
  if (!partial || hasOwn("replacement")) {
    const replacement = String(body.replacement ?? "");
    if (replacement.length > MASKING_REPLACEMENT_MAX_LENGTH) {
      throw maskingError("VALIDATION_FAILED", `AI masking rule replacement must be at most ${MASKING_REPLACEMENT_MAX_LENGTH} characters.`, 400);
    }
    // Only the replace mode consumes a replacement; normalizing here keeps
    // block rules from carrying a misleading payload.
    normalized.replacement = normalized.mode === undefined || normalized.mode === "replace" ? replacement : "";
  }
  const FLAG_DEFAULTS = { caseSensitive: false, enabled: true, isRegex: false };
  for (const flag of ["isRegex", "caseSensitive", "enabled"]) {
    if (partial && !hasOwn(flag)) continue;
    normalized[flag] = hasOwn(flag) ? normalizeBoolean(body[flag]) : FLAG_DEFAULTS[flag];
  }
  return normalized;
}

function assertCompilable(rule) {
  if (!rule.isRegex) return;
  try {
    new RegExp(rule.pattern, rule.caseSensitive ? "g" : "gi");
  } catch (error) {
    throw maskingError("VALIDATION_FAILED", `AI masking rule pattern is not a valid regular expression: ${error?.message || error}`, 400);
  }
}

function createMaskingRulesService({
  cache = sharedMaskingRuleCache,
  logger = console,
  nextId,
  now = () => new Date().toISOString(),
  repository,
}) {
  if (!repository || typeof repository.listEnabled !== "function" || typeof repository.findById !== "function") {
    throw new Error("AI masking rules service requires a masking rule repository.");
  }
  if (typeof nextId !== "function") throw new Error("AI masking rules service requires a nextId() helper.");

  async function loadPolicy() {
    const rules = await cache.load(async () => {
      const enabled = await repository.listEnabled();
      const compiled = [];
      for (const record of enabled) {
        const rule = toPublicRule(record);
        try {
          compiled.push({ ...rule, matcher: compileMatcher(rule) });
        } catch (error) {
          // Stored rows are validated on write; a hand-edited broken pattern
          // must never take down AI egress, so skip it and keep going.
          logger?.warn?.(`AI masking rule ${rule.id} (${rule.name}) skipped: ${error?.message || error}`);
        }
      }
      return compiled;
    });
    return createMaskingPolicy(rules);
  }

  async function applyToText(text) {
    const policy = await loadPolicy();
    return policy.applyMasking(String(text ?? ""));
  }

  async function requireUniqueName(name, excludeId) {
    const clash = await repository.findByName(name);
    if (clash && clash.id !== excludeId) {
      throw maskingError("VALIDATION_FAILED", `An AI masking rule named "${name}" already exists.`, 400);
    }
  }

  async function create(body = {}) {
    const rule = normalizeRuleInput(body, { partial: false });
    assertCompilable(rule);
    await requireUniqueName(rule.name, null);
    const timestamp = now();
    const record = {
      id: await nextId("MASK"),
      name: rule.name,
      mode: rule.mode,
      pattern: rule.pattern,
      replacement: rule.replacement,
      ...toStorageBooleans(rule),
      created_at: timestamp,
      updated_at: timestamp,
    };
    await repository.create(record);
    cache.invalidate();
    return toPublicRule(record);
  }

  async function get(id) {
    const record = await repository.findById(id);
    if (!record) throw maskingError("RESOURCE_NOT_FOUND", "AI masking rule not found.", 404);
    return toPublicRule(record);
  }

  async function list() {
    return (await repository.list()).map(toPublicRule);
  }

  async function update(id, body = {}) {
    const existing = await repository.findById(id);
    if (!existing) throw maskingError("RESOURCE_NOT_FOUND", "AI masking rule not found.", 404);
    const before = toPublicRule(existing);
    const patch = normalizeRuleInput(body, { partial: true });
    const merged = { ...before, ...patch };
    assertCompilable(merged);
    await requireUniqueName(merged.name, existing.id);
    const changed = await repository.update(id, {
      name: merged.name,
      mode: merged.mode,
      pattern: merged.pattern,
      replacement: merged.mode === "replace" ? merged.replacement : "",
      isRegex: merged.isRegex,
      caseSensitive: merged.caseSensitive,
      enabled: merged.enabled,
      updatedAt: now(),
    });
    if (!changed) throw maskingError("RESOURCE_NOT_FOUND", "AI masking rule not found.", 404);
    cache.invalidate();
    const after = await get(id);
    return { after, before };
  }

  async function remove(id) {
    const existing = await repository.findById(id);
    if (!existing) throw maskingError("RESOURCE_NOT_FOUND", "AI masking rule not found.", 404);
    const removed = toPublicRule(existing);
    await repository.remove(id);
    cache.invalidate();
    return removed;
  }

  return {
    applyToText,
    create,
    get,
    list,
    loadPolicy,
    remove,
    update,
  };
}

function defaultMaskingNextId() {
  return `MASK-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
}

// Fail-open engine for the harness proxy default wiring: rules are read from
// the process database on first use (the api/db facade is already loaded in
// the server process; requiring it lazily keeps unit tests side-effect free).
function createDefaultAiMaskingEngine({ logger = console } = {}) {
  let service;
  return {
    async loadPolicy() {
      try {
        service ||= createMaskingRulesService({
          logger,
          nextId: defaultMaskingNextId,
          repository: (() => {
            const database = require("../../../db");
            return createAiMaskingRuleRepository({
              insert: database.insert,
              row: database.row,
              rows: database.rows,
              run: database.run,
            });
          })(),
        });
        return await service.loadPolicy();
      } catch (error) {
        logger?.warn?.(`AI masking rules are unavailable; AI egress continues unmasked: ${error?.message || error}`);
        return createMaskingPolicy([]);
      }
    },
  };
}

module.exports = {
  MASKING_NAME_MAX_LENGTH,
  MASKING_PATTERN_MAX_LENGTH,
  MASKING_REPLACEMENT_MAX_LENGTH,
  MASKING_RULE_MODES,
  compileMatcher,
  createAiMaskingRuleRepository,
  createDefaultAiMaskingEngine,
  createMaskingPolicy,
  createMaskingRuleCache,
  createMaskingRulesService,
  sharedMaskingRuleCache,
  toPublicRule,
};
