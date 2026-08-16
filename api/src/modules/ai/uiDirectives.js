// Server-side whitelist for the "dsh controls the frontend UI" directive
// channel. One validator is shared by every server entry point — the /ws/agent
// bridge (agent.ui frames), the REST test-fire route (POST /api/ai/ui-
// directives), and the execution gateway's ui-control capability — so an
// unknown kind or an out-of-range value is rejected before any socket write.
//
// Wire vocabulary mirrors the frozen web contract
// (web/src/features/ai/models/uiDirectiveModel.ts):
//   theme(mode) / fontSize(value 13-18) / fontFamily(value enum)
//   / density(value enum) / accentColor(value #rrggbb)
//   / contentPadding(value 0-240) / reduceMotion(value bool)
//   / navigate(page, optional bounded entity focus) / openAiSidebar(open bool)
//   / layout(surface + ordered block ids)
//   / surfaceStyle(surface + bounded design tokens)
//   / viewUpsert/viewRemove/viewOpen (closed declarative view schema).

const { findUiSurface, listUiPageIds } = require("./uiSurfaceRegistry");

const UI_THEME_MODES = Object.freeze(["dark", "light"]);
const UI_FONT_FAMILIES = Object.freeze(["system", "sans", "noto", "misans", "puhui"]);
const UI_DENSITIES = Object.freeze(["compact", "comfortable"]);
const UI_FONT_SIZE_MIN = 13;
const UI_FONT_SIZE_MAX = 18;
const UI_CONTENT_PADDING_MIN = 0;
const UI_CONTENT_PADDING_MAX = 240;
const UI_NAVIGATE_PAGE_MAX = 64;
const UI_NAVIGATE_FOCUS_MAX = 128;
const ACCENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const UI_ID_PATTERN = /^[a-z][a-z0-9.:-]*$/;
const UI_NAVIGATE_FOCUS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const UI_STAT_TONES = Object.freeze(["default", "positive", "warning", "negative"]);
const UI_NOTICE_TONES = Object.freeze(["info", "success", "warning", "danger"]);
const UI_VIEW_BLOCK_TYPES = Object.freeze(["stat", "text", "list", "table", "progress", "notice", "links"]);
const UI_SURFACE_VARIANTS = Object.freeze(["default", "quiet", "contrast"]);
const UI_PAGE_IDS = new Set(listUiPageIds());
const UI_LAYOUT_ORDER_MAX = 64;
const UI_VIEW_BLOCKS_MAX = 32;
const UI_VIEW_LIST_ITEMS_MAX = 50;
const UI_VIEW_TABLE_COLUMNS_MAX = 8;
const UI_VIEW_TABLE_ROWS_MAX = 100;
const UI_TEXT_MAX = 4000;

const UI_DIRECTIVE_KINDS = Object.freeze([
  "theme",
  "fontSize",
  "fontFamily",
  "density",
  "accentColor",
  "contentPadding",
  "reduceMotion",
  "navigate",
  "openAiSidebar",
  "layout",
  "surfaceStyle",
  "viewUpsert",
  "viewRemove",
  "viewOpen",
]);

function uiDirectiveError(message) {
  const error = new Error(message);
  error.code = "AI_UI_DIRECTIVE_INVALID";
  error.status = 400;
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIntegerInRange(value, min, max) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function normalizeText(value, field, { maxLength = UI_TEXT_MAX, required = true } = {}) {
  if (value === undefined || value === null) {
    if (!required) return "";
    throw uiDirectiveError(`${field} is required.`);
  }
  if (typeof value !== "string") throw uiDirectiveError(`${field} must be a string.`);
  const text = value.trim();
  if (required && !text) throw uiDirectiveError(`${field} must not be empty.`);
  if (text.length > maxLength) throw uiDirectiveError(`${field} must not exceed ${maxLength} characters.`);
  return text;
}

function normalizeId(value, field, maxLength = 64) {
  const id = normalizeText(value, field, { maxLength });
  if (!UI_ID_PATTERN.test(id)) {
    throw uiDirectiveError(`${field} must start with a lower-case letter and contain only lower-case letters, digits, dot, colon, or hyphen.`);
  }
  return id;
}

function assertLayoutSurface(surface, field) {
  const registered = findUiSurface(surface);
  if (registered?.supportsLayout === true) return registered;
  if (surface.startsWith("dsh-view:")) return null;
  throw uiDirectiveError(`${field} is not a registered layout surface.`);
}

function assertStyleSurface(surface, field) {
  const registered = findUiSurface(surface);
  if (registered?.supportsStyle === true) return registered;
  if (surface.startsWith("dsh-view:")) return null;
  throw uiDirectiveError(`${field} is not a registered style surface.`);
}

function normalizeScalar(value, field, maxLength = 500) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return normalizeText(value, field, { maxLength });
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === "") return undefined;
  return normalizeText(value, field, { maxLength });
}

function normalizeTone(value, field, allowed, fallback) {
  const tone = value === undefined ? fallback : value;
  if (!allowed.includes(tone)) throw uiDirectiveError(`${field} has an unsupported tone.`);
  return tone;
}

function normalizeViewBlock(value, index) {
  const field = `view.blocks[${index}]`;
  if (!isRecord(value)) throw uiDirectiveError(`${field} must be an object.`);
  const type = String(value.type || "");
  if (!UI_VIEW_BLOCK_TYPES.includes(type)) throw uiDirectiveError(`${field}.type is unsupported.`);
  const block = {
    id: normalizeId(value.id, `${field}.id`),
    type,
  };
  const title = optionalText(value.title, `${field}.title`, 120);
  if (title) block.title = title;

  if (type === "stat") {
    block.label = normalizeText(value.label, `${field}.label`, { maxLength: 160 });
    if (typeof value.value === "number" && Number.isFinite(value.value)) block.value = value.value;
    else block.value = normalizeText(value.value, `${field}.value`, { maxLength: 160 });
    if (value.tone !== undefined) block.tone = normalizeTone(value.tone, `${field}.tone`, UI_STAT_TONES, "default");
    const detail = optionalText(value.detail, `${field}.detail`, 500);
    if (detail) block.detail = detail;
  } else if (type === "text") {
    block.text = normalizeText(value.text, `${field}.text`, { maxLength: UI_TEXT_MAX });
  } else if (type === "list") {
    if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > UI_VIEW_LIST_ITEMS_MAX) {
      throw uiDirectiveError(`${field}.items must contain 1-${UI_VIEW_LIST_ITEMS_MAX} entries.`);
    }
    block.items = value.items.map((item, itemIndex) => normalizeText(item, `${field}.items[${itemIndex}]`, { maxLength: UI_TEXT_MAX }));
    if (value.ordered !== undefined) {
      if (typeof value.ordered !== "boolean") throw uiDirectiveError(`${field}.ordered must be a boolean.`);
      block.ordered = value.ordered;
    }
  } else if (type === "table") {
    if (!Array.isArray(value.columns) || value.columns.length < 1 || value.columns.length > UI_VIEW_TABLE_COLUMNS_MAX) {
      throw uiDirectiveError(`${field}.columns must contain 1-${UI_VIEW_TABLE_COLUMNS_MAX} entries.`);
    }
    block.columns = value.columns.map((column, columnIndex) => {
      if (!isRecord(column)) throw uiDirectiveError(`${field}.columns[${columnIndex}] must be an object.`);
      return {
        key: normalizeId(column.key, `${field}.columns[${columnIndex}].key`, 40),
        label: normalizeText(column.label, `${field}.columns[${columnIndex}].label`, { maxLength: 80 }),
      };
    });
    const keys = block.columns.map((column) => column.key);
    if (new Set(keys).size !== keys.length) throw uiDirectiveError(`${field}.columns keys must be unique.`);
    if (!Array.isArray(value.rows) || value.rows.length > UI_VIEW_TABLE_ROWS_MAX) {
      throw uiDirectiveError(`${field}.rows must contain at most ${UI_VIEW_TABLE_ROWS_MAX} entries.`);
    }
    block.rows = value.rows.map((row, rowIndex) => {
      if (!isRecord(row)) throw uiDirectiveError(`${field}.rows[${rowIndex}] must be an object.`);
      return Object.fromEntries(keys.map((key) => [
        key,
        row[key] === undefined || row[key] === null ? "" : normalizeScalar(row[key], `${field}.rows[${rowIndex}].${key}`),
      ]));
    });
  } else if (type === "progress") {
    block.label = normalizeText(value.label, `${field}.label`, { maxLength: 160 });
    if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0 || value.value > 100) {
      throw uiDirectiveError(`${field}.value must be a number from 0 to 100.`);
    }
    block.value = value.value;
    const detail = optionalText(value.detail, `${field}.detail`, 500);
    if (detail) block.detail = detail;
  } else if (type === "notice") {
    block.text = normalizeText(value.text, `${field}.text`, { maxLength: 1200 });
    if (value.tone !== undefined) block.tone = normalizeTone(value.tone, `${field}.tone`, UI_NOTICE_TONES, "info");
  } else if (type === "links") {
    if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > UI_VIEW_LIST_ITEMS_MAX) {
      throw uiDirectiveError(`${field}.items must contain 1-${UI_VIEW_LIST_ITEMS_MAX} entries.`);
    }
    block.items = value.items.map((item, itemIndex) => {
      const itemField = `${field}.items[${itemIndex}]`;
      if (!isRecord(item)) throw uiDirectiveError(`${itemField} must be an object.`);
      const page = normalizeText(item.page, `${itemField}.page`, { maxLength: UI_NAVIGATE_PAGE_MAX });
      if (!UI_PAGE_IDS.has(page)) throw uiDirectiveError(`${itemField}.page is not a registered page.`);
      const link = {
        label: normalizeText(item.label, `${itemField}.label`, { maxLength: 120 }),
        page,
      };
      return link;
    });
  }
  return block;
}

function normalizeViewSpec(value) {
  if (!isRecord(value)) throw uiDirectiveError("view must be an object.");
  if (!Array.isArray(value.blocks) || value.blocks.length < 1 || value.blocks.length > UI_VIEW_BLOCKS_MAX) {
    throw uiDirectiveError(`view.blocks must contain 1-${UI_VIEW_BLOCKS_MAX} blocks.`);
  }
  const blocks = value.blocks.map(normalizeViewBlock);
  const blockIds = blocks.map((block) => block.id);
  if (new Set(blockIds).size !== blockIds.length) throw uiDirectiveError("view block ids must be unique.");
  const id = normalizeId(value.id, "view.id", 48);
  const surface = value.surface === undefined ? `dsh-view:${id}` : normalizeId(value.surface, "view.surface", 64);
  if (!surface.startsWith("dsh-view:")) throw uiDirectiveError("view.surface must use the dsh-view: namespace.");
  const view = {
    blocks,
    id,
    surface,
    title: normalizeText(value.title, "view.title", { maxLength: 80 }),
  };
  const description = optionalText(value.description, "view.description", 240);
  if (description) view.description = description;
  return view;
}

// Throws AI_UI_DIRECTIVE_INVALID (HTTP 400 semantics) on any out-of-whitelist
// payload and otherwise returns a fresh object carrying only the whitelisted
// fields — unknown extra properties are dropped, never forwarded to sockets.
function assertUiDirective(value) {
  if (!isRecord(value)) throw uiDirectiveError("UI directive must be an object.");
  switch (value.kind) {
    case "theme":
      if (!UI_THEME_MODES.includes(value.mode)) {
        throw uiDirectiveError(`theme mode must be one of: ${UI_THEME_MODES.join(", ")}.`);
      }
      return { kind: "theme", mode: value.mode };
    case "fontSize":
      if (!isIntegerInRange(value.value, UI_FONT_SIZE_MIN, UI_FONT_SIZE_MAX)) {
        throw uiDirectiveError(`fontSize value must be an integer between ${UI_FONT_SIZE_MIN} and ${UI_FONT_SIZE_MAX}.`);
      }
      return { kind: "fontSize", value: value.value };
    case "fontFamily":
      if (!UI_FONT_FAMILIES.includes(value.value)) {
        throw uiDirectiveError(`fontFamily value must be one of: ${UI_FONT_FAMILIES.join(", ")}.`);
      }
      return { kind: "fontFamily", value: value.value };
    case "density":
      if (!UI_DENSITIES.includes(value.value)) {
        throw uiDirectiveError(`density value must be one of: ${UI_DENSITIES.join(", ")}.`);
      }
      return { kind: "density", value: value.value };
    case "accentColor":
      if (typeof value.value !== "string" || !ACCENT_COLOR_PATTERN.test(value.value)) {
        throw uiDirectiveError("accentColor value must be a #rrggbb hex string.");
      }
      return { kind: "accentColor", value: value.value.toLowerCase() };
    case "contentPadding":
      if (!isIntegerInRange(value.value, UI_CONTENT_PADDING_MIN, UI_CONTENT_PADDING_MAX)) {
        throw uiDirectiveError(`contentPadding value must be an integer between ${UI_CONTENT_PADDING_MIN} and ${UI_CONTENT_PADDING_MAX}.`);
      }
      return { kind: "contentPadding", value: value.value };
    case "reduceMotion":
      if (typeof value.value !== "boolean") {
        throw uiDirectiveError("reduceMotion value must be a boolean.");
      }
      return { kind: "reduceMotion", value: value.value };
    case "navigate": {
      if (typeof value.page !== "string") throw uiDirectiveError("navigate page must be a string.");
      const page = value.page.trim();
      if (!page) throw uiDirectiveError("navigate page must not be empty.");
      if (page.length > UI_NAVIGATE_PAGE_MAX) {
        throw uiDirectiveError(`navigate page must not exceed ${UI_NAVIGATE_PAGE_MAX} characters.`);
      }
      if (!UI_PAGE_IDS.has(page)) throw uiDirectiveError("navigate page is not registered.");
      if (value.focus === undefined || value.focus === null || value.focus === "") {
        return { kind: "navigate", page };
      }
      if (typeof value.focus !== "string") throw uiDirectiveError("navigate focus must be a string.");
      const focus = value.focus.trim();
      if (!focus || focus.length > UI_NAVIGATE_FOCUS_MAX || !UI_NAVIGATE_FOCUS_PATTERN.test(focus)) {
        throw uiDirectiveError("navigate focus must be a bounded platform entity id.");
      }
      return { kind: "navigate", page, focus };
    }
    case "openAiSidebar":
      if (typeof value.open !== "boolean") {
        throw uiDirectiveError("openAiSidebar open must be a boolean.");
      }
      return { kind: "openAiSidebar", open: value.open };
    case "layout": {
      const surface = normalizeId(value.surface, "layout surface");
      const registered = assertLayoutSurface(surface, "layout surface");
      if (!Array.isArray(value.order) || value.order.length < 1 || value.order.length > UI_LAYOUT_ORDER_MAX) {
        throw uiDirectiveError(`layout order must contain 1-${UI_LAYOUT_ORDER_MAX} block ids.`);
      }
      const order = value.order.map((id, index) => normalizeId(id, `layout order[${index}]`));
      if (new Set(order).size !== order.length) throw uiDirectiveError("layout order must not contain duplicate block ids.");
      if (registered && order.some((id) => !registered.blocks.includes(id))) {
        throw uiDirectiveError("layout order contains a block that is not registered for this surface.");
      }
      return { kind: "layout", surface, order };
    }
    case "surfaceStyle": {
      const surface = normalizeId(value.surface, "surfaceStyle surface");
      assertStyleSurface(surface, "surfaceStyle surface");
      if (!isRecord(value.style)) throw uiDirectiveError("surfaceStyle style must be an object.");
      const variant = value.style.variant === undefined ? "default" : value.style.variant;
      const columns = value.style.columns === undefined ? 2 : value.style.columns;
      const gap = value.style.gap === undefined ? 16 : value.style.gap;
      if (!UI_SURFACE_VARIANTS.includes(variant)) throw uiDirectiveError("surfaceStyle variant is unsupported.");
      if (!isIntegerInRange(columns, 1, 3)) throw uiDirectiveError("surfaceStyle columns must be an integer from 1 to 3.");
      if (!isIntegerInRange(gap, 8, 32)) throw uiDirectiveError("surfaceStyle gap must be an integer from 8 to 32.");
      const style = { variant, columns, gap };
      return { kind: "surfaceStyle", surface, style };
    }
    case "viewUpsert":
      return { kind: "viewUpsert", view: normalizeViewSpec(value.view) };
    case "viewRemove":
      return { kind: "viewRemove", viewId: normalizeId(value.viewId, "viewRemove viewId", 48) };
    case "viewOpen":
      return { kind: "viewOpen", viewId: normalizeId(value.viewId, "viewOpen viewId", 48) };
    default:
      throw uiDirectiveError(`Unknown UI directive kind: ${String(value.kind)}.`);
  }
}

// Null-based variant for callers that prefer dropping invalid payloads (for
// example the dsh tool wrapper, which converts the null into its own local
// validation error before any network I/O).
function parseUiDirective(value) {
  try {
    return assertUiDirective(value);
  } catch {
    return null;
  }
}

module.exports = {
  ACCENT_COLOR_PATTERN,
  UI_CONTENT_PADDING_MAX,
  UI_CONTENT_PADDING_MIN,
  UI_DIRECTIVE_KINDS,
  UI_DENSITIES,
  UI_FONT_FAMILIES,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
  UI_NAVIGATE_PAGE_MAX,
  UI_THEME_MODES,
  UI_NOTICE_TONES,
  UI_STAT_TONES,
  UI_SURFACE_VARIANTS,
  UI_VIEW_BLOCK_TYPES,
  assertUiDirective,
  normalizeViewSpec,
  parseUiDirective,
};
