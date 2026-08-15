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
//   / navigate(page, non-empty <= 64) / openAiSidebar(open bool).

const UI_THEME_MODES = Object.freeze(["dark", "light"]);
const UI_FONT_FAMILIES = Object.freeze(["system", "sans", "noto", "misans", "puhui"]);
const UI_DENSITIES = Object.freeze(["compact", "comfortable"]);
const UI_FONT_SIZE_MIN = 13;
const UI_FONT_SIZE_MAX = 18;
const UI_CONTENT_PADDING_MIN = 0;
const UI_CONTENT_PADDING_MAX = 240;
const UI_NAVIGATE_PAGE_MAX = 64;
const ACCENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

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
      return { kind: "navigate", page };
    }
    case "openAiSidebar":
      if (typeof value.open !== "boolean") {
        throw uiDirectiveError("openAiSidebar open must be a boolean.");
      }
      return { kind: "openAiSidebar", open: value.open };
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
  assertUiDirective,
  parseUiDirective,
};
