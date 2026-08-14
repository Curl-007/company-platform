const { capabilityError } = require("./capabilityRegistry");

const AI_CAPABILITY_CONTROLS_SETTING_KEY = "ai_capability_controls";
const MAX_CONTROL_UPDATE_ATTEMPTS = 5;

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function normalizeControl(value = {}, fallback = {}) {
  const enabled = value.enabled !== undefined
    ? Boolean(value.enabled)
    : fallback.enabled !== undefined
      ? Boolean(fallback.enabled)
      : true;
  const reason = String(value.reason !== undefined ? value.reason : fallback.reason || "").trim().slice(0, 240);
  return {
    enabled,
    reason,
    updatedAt: value.updatedAt || fallback.updatedAt || null,
    updatedBy: value.updatedBy || fallback.updatedBy || null,
  };
}

function corruptControlStoreError() {
  return capabilityError(
    "AI_CAPABILITY_CONTROL_STORE_CORRUPT",
    "AI capability controls are unavailable until the control-plane record is repaired.",
    503,
  );
}

function isControlRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return false;
  if (value.reason !== undefined && (typeof value.reason !== "string" || value.reason.length > 240)) return false;
  if (value.updatedAt !== undefined && value.updatedAt !== null && typeof value.updatedAt !== "string") return false;
  if (value.updatedBy !== undefined && value.updatedBy !== null && typeof value.updatedBy !== "string") return false;
  return true;
}

function parseStoredControls(setting) {
  if (!setting) return {};
  if (typeof setting.value !== "string") throw corruptControlStoreError();
  let parsed;
  try {
    parsed = JSON.parse(setting.value);
  } catch {
    throw corruptControlStoreError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw corruptControlStoreError();
  for (const value of Object.values(parsed)) {
    if (!isControlRecord(value)) throw corruptControlStoreError();
  }
  return parsed;
}

function publicControl(manifest, control) {
  const enabled = manifest.status === "approved" && control.enabled;
  return {
    id: manifest.id,
    version: manifest.version,
    manifestStatus: manifest.status,
    enabled,
    status: enabled ? "approved" : "disabled",
    updatedAt: control.updatedAt || null,
  };
}

function createAiCapabilityControlStore({ json, now, registry, row, run }) {
  if (!registry || typeof registry.get !== "function") throw new Error("AI capability registry is required.");

  async function readSetting() {
    return row("SELECT value, updated_at FROM app_settings WHERE key = @key", { key: AI_CAPABILITY_CONTROLS_SETTING_KEY });
  }

  async function readAll() {
    return parseStoredControls(await readSetting());
  }

  async function get(id) {
    const manifest = registry.get(id);
    if (!manifest) throw capabilityError("RESOURCE_NOT_FOUND", "AI capability not found.", 404);
    const controls = await readAll();
    return normalizeControl(controls[manifest.id]);
  }

  async function list() {
    const controls = await readAll();
    return registry.list().map((manifest) => ({
      manifest,
      control: normalizeControl(controls[manifest.id]),
    }));
  }

  async function update(id, input = {}, actor = null) {
    const manifest = registry.get(id);
    if (!manifest) throw capabilityError("RESOURCE_NOT_FOUND", "AI capability not found.", 404);
    if (!hasOwn(input, "enabled") && !hasOwn(input, "reason")) {
      throw capabilityError("VALIDATION_FAILED", "enabled or reason is required.");
    }
    if (hasOwn(input, "enabled") && typeof input.enabled !== "boolean") {
      throw capabilityError("VALIDATION_FAILED", "enabled must be a boolean.");
    }
    if (hasOwn(input, "reason") && (typeof input.reason !== "string" || input.reason.length > 240)) {
      throw capabilityError("VALIDATION_FAILED", "reason must be a string no longer than 240 characters.");
    }

    for (let attempt = 0; attempt < MAX_CONTROL_UPDATE_ATTEMPTS; attempt += 1) {
      const setting = await readSetting();
      const controls = parseStoredControls(setting);
      const before = normalizeControl(controls[manifest.id]);
      const updatedAt = now();
      const after = normalizeControl({
        ...before,
        ...(hasOwn(input, "enabled") ? { enabled: input.enabled } : {}),
        ...(hasOwn(input, "reason") ? { reason: input.reason } : {}),
        updatedAt,
        updatedBy: actor?.id || null,
      });
      const nextControls = { ...controls, [manifest.id]: after };
      const value = json(nextControls);
      const result = setting
        ? await run(
          "UPDATE app_settings SET value = @value, updated_at = @updatedAt WHERE key = @key AND value = @expectedValue",
          { key: AI_CAPABILITY_CONTROLS_SETTING_KEY, value, updatedAt, expectedValue: setting.value },
        )
        : await run(
          "INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (@key, @value, @updatedAt)",
          { key: AI_CAPABILITY_CONTROLS_SETTING_KEY, value, updatedAt },
        );
      if (Number(result?.changes || 0) === 1) return { before, after, manifest };
    }
    throw capabilityError("AI_CAPABILITY_CONTROL_CONFLICT", "AI capability control changed concurrently. Retry the request.", 409);
  }

  return {
    get,
    list,
    publicControl,
    update,
  };
}

module.exports = {
  AI_CAPABILITY_CONTROLS_SETTING_KEY,
  MAX_CONTROL_UPDATE_ATTEMPTS,
  createAiCapabilityControlStore,
  parseStoredControls,
  normalizeControl,
  publicControl,
};
