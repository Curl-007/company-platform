// Browser control service for the AI execution gateway (Sprint: browser
// capability). Drives a headless Playwright browser (system Chrome via
// channel) so the dsh agent can open pages, extract masked text, screenshot,
// and interact (click/type/press) with allowlisted targets.
//
// Security posture (mirrors outboundUrlPolicy):
//   - navigation targets: http/https only, no URL credentials, DNS resolved
//     and pinned at decision time, private/reserved IPs blocked unless the
//     host is localhost or in BROWSER_PRIVATE_HOST_ALLOWLIST;
//   - browser sessions are isolated per (actor, project), carry no platform
//     credentials, are serialized (BROWSER_MAX_PAGES) and closed after an
//     idle TTL; every action is audited by the gateway BEFORE it runs;
//   - page text passes the masking replace rules before reaching the model;
//   - screenshots are written under storage/browser/<invocationId>.png and
//     served only through the project-scoped artifact route.

/* global document */

const path = require("node:path");
const { isPublicIp, normalizeHostname, parseAllowedPrivateHosts } = require("./outboundUrlPolicy");

const BROWSER_ACTIONS = Object.freeze(new Set(["open", "text", "screenshot", "click", "type", "press"]));
const BROWSER_URL_MAX_LENGTH = 2048;
const BROWSER_SELECTOR_MAX_LENGTH = 256;
const BROWSER_TEXT_MAX_LENGTH = 2000;
const BROWSER_KEY_MAX_LENGTH = 32;
const BROWSER_WAIT_MS_MAX = 60_000;
const DEFAULT_BROWSER_TIMEOUT_MS = 30_000;
const DEFAULT_BROWSER_TEXT_LIMIT = 4000;
const DEFAULT_BROWSER_CHANNEL = "chrome";
const DEFAULT_BROWSER_MAX_PAGES = 1;
const DEFAULT_BROWSER_SESSION_TTL_MS = 5 * 60_000;
const DEFAULT_BROWSER_PRIVATE_HOST_ALLOWLIST = "localhost";

function browserError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function resolveBrowserConfig(env = process.env, logger = console) {
  const read = (name, fallback) => {
    const raw = String(env[name] || "").trim();
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      logger?.warn?.(`Browser control: invalid ${name}, using ${fallback}.`);
      return fallback;
    }
    return parsed;
  };
  return {
    enabled: String(env.BROWSER_ENABLED ?? "true").trim().toLowerCase() !== "false",
    channel: String(env.BROWSER_CHANNEL || DEFAULT_BROWSER_CHANNEL).trim() || DEFAULT_BROWSER_CHANNEL,
    timeoutMs: read("BROWSER_TIMEOUT_MS", DEFAULT_BROWSER_TIMEOUT_MS),
    maxPages: read("BROWSER_MAX_PAGES", DEFAULT_BROWSER_MAX_PAGES),
    textLimit: read("BROWSER_TEXT_LIMIT", DEFAULT_BROWSER_TEXT_LIMIT),
    sessionTtlMs: read("BROWSER_SESSION_TTL_MS", DEFAULT_BROWSER_SESSION_TTL_MS),
    allowedPrivateHosts: parseAllowedPrivateHosts(
      env.BROWSER_PRIVATE_HOST_ALLOWLIST ?? DEFAULT_BROWSER_PRIVATE_HOST_ALLOWLIST,
    ),
  };
}

/**
 * Validates a navigation target the same way provider base URLs are: scheme
 * http/https, no credentials, hostname allowlisted (localhost by default) or
 * resolving only to public addresses. Unlike provider URLs, query strings and
 * fragments are allowed (real pages need them). Returns the frozen target.
 */
async function resolveBrowserNavigationTarget(value, {
  allowedPrivateHosts,
  lookup = require("node:dns").lookup,
} = {}) {
  const source = String(value || "").trim();
  if (!source || source.length > BROWSER_URL_MAX_LENGTH) {
    throw browserError("AI_BROWSER_URL_INVALID", "Browser navigation URL is invalid.", 400);
  }
  let url;
  try {
    url = new URL(source);
  } catch {
    throw browserError("AI_BROWSER_URL_INVALID", "Browser navigation URL is invalid.", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw browserError("AI_BROWSER_URL_SCHEME_FORBIDDEN", "Browser navigation only allows http/https URLs.", 400);
  }
  if (url.username || url.password) {
    throw browserError("AI_BROWSER_URL_CREDENTIALS_FORBIDDEN", "Browser navigation URLs cannot carry credentials.", 400);
  }
  const hostname = normalizeHostname(url.hostname);
  const allowlist = allowedPrivateHosts instanceof Set
    ? allowedPrivateHosts
    : parseAllowedPrivateHosts(allowedPrivateHosts);

  if (allowlist.has(hostname) || hostname === "localhost" || hostname.endsWith(".localhost")) {
    return Object.freeze({ url, hostname });
  }
  if (require("node:net").isIP(hostname)) {
    if (!isPublicIp(hostname)) {
      throw browserError("AI_BROWSER_PRIVATE_ADDRESS_FORBIDDEN", "Browser navigation cannot target a private or reserved address.", 403);
    }
    return Object.freeze({ url, hostname });
  }
  const resolved = await new Promise((resolve, reject) => {
    lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(browserError("AI_BROWSER_DNS_LOOKUP_FAILED", "Browser navigation hostname did not resolve.", 502));
      else resolve(addresses || []);
    });
  });
  if (!resolved.length) {
    throw browserError("AI_BROWSER_DNS_LOOKUP_FAILED", "Browser navigation hostname did not resolve.", 502);
  }
  if (resolved.some((item) => !isPublicIp(item.address))) {
    throw browserError("AI_BROWSER_PRIVATE_ADDRESS_FORBIDDEN", "Browser navigation hostname resolves to a private or reserved address.", 403);
  }
  return Object.freeze({ url, hostname, addresses: Object.freeze(resolved.map((item) => Object.freeze({ ...item }))) });
}

/**
 * Pure input normalization: action whitelist + per-action required fields +
 * bounded waitMs. Called by the gateway before auditing so a rejected action
 * never reaches the audit trail as an executed action.
 */
function normalizeBrowserAction(input = {}) {
  if (!isRecord(input)) throw browserError("AI_BROWSER_INPUT_INVALID", "Browser control input is invalid.", 400);
  const action = String(input.action || "").trim().toLowerCase();
  if (!BROWSER_ACTIONS.has(action)) {
    throw browserError("AI_BROWSER_ACTION_UNKNOWN", `Unsupported browser action: ${action || "(empty)"}.`, 400);
  }
  const next = { action };
  const url = String(input.url || "").trim();
  const selector = String(input.selector || "").trim();
  const text = String(input.text || "");
  const key = String(input.key || "").trim();
  const waitMs = boundedInt(input.waitMs, 0, { min: 0, max: BROWSER_WAIT_MS_MAX });

  if (action === "open") {
    if (!url) throw browserError("AI_BROWSER_INPUT_INVALID", "Browser open requires a url.", 400);
    if (url.length > BROWSER_URL_MAX_LENGTH) throw browserError("AI_BROWSER_INPUT_INVALID", "Browser url is too long.", 400);
    next.url = url;
  }
  if (action === "click" || action === "type" || action === "press") {
    if (!selector) throw browserError("AI_BROWSER_INPUT_INVALID", `Browser ${action} requires a selector.`, 400);
    if (selector.length > BROWSER_SELECTOR_MAX_LENGTH) throw browserError("AI_BROWSER_INPUT_INVALID", "Browser selector is too long.", 400);
    next.selector = selector;
  }
  if (action === "type") {
    if (!text) throw browserError("AI_BROWSER_INPUT_INVALID", "Browser type requires text.", 400);
    if (text.length > BROWSER_TEXT_MAX_LENGTH) throw browserError("AI_BROWSER_INPUT_INVALID", "Browser type text is too long.", 400);
    next.text = text;
  }
  if (action === "press") {
    if (!key) throw browserError("AI_BROWSER_INPUT_INVALID", "Browser press requires a key.", 400);
    if (key.length > BROWSER_KEY_MAX_LENGTH) throw browserError("AI_BROWSER_INPUT_INVALID", "Browser key is too long.", 400);
    next.key = key;
  }
  if (waitMs > 0) next.waitMs = waitMs;
  return next;
}

function createBrowserControlService({
  env = process.env,
  storageDir,
  masking,
  playwrightFactory = () => require("playwright"),
  fsImpl = require("node:fs"),
  logger = console,
} = {}) {
  const config = resolveBrowserConfig(env, logger);
  const screenshotDir = storageDir ? path.join(storageDir, "browser") : null;
  let browserPromise = null;
  let queue = Promise.resolve();

  function withPage(sessionKey) {
    if (!config.enabled) throw browserError("AI_BROWSER_DISABLED", "Browser control is disabled.", 403);
    if (!browserPromise) {
      browserPromise = (async () => {
        const { chromium } = playwrightFactory();
        const browser = await chromium.launch({ channel: config.channel, headless: true });
        browser.on("disconnected", () => {
          browserPromise = null;
          sessions.clear();
        });
        return browser;
      })();
    }
    return browserPromise.then(async (browser) => {
      let session = sessions.get(sessionKey);
      if (!session) {
        const context = await browser.newContext();
        session = { context, page: null, lastUsed: Date.now() };
        sessions.set(sessionKey, session);
      }
      session.lastUsed = Date.now();
      return session;
    });
  }

  // One browser session per (actor, project); idle sessions are closed by the
  // TTL sweep. Serialized by `queue` so concurrent invocations never share a
  // page mid-action.
  const sessions = new Map();

  async function maskText(text) {
    if (!text) return text;
    try {
      if (typeof masking?.applyToText === "function") {
        // The masking service returns { text, violations }; accept a plain
        // string too so injectable/test implementations stay simple.
        const masked = await masking.applyToText(String(text));
        if (typeof masked === "string") return masked;
        if (masked && typeof masked === "object" && typeof masked.text === "string") return masked.text;
      }
    } catch {
      // Masking must never break the capability; the raw excerpt is returned.
    }
    return text;
  }

  async function currentPage(session) {
    if (session.page) return session.page;
    session.page = await session.context.newPage();
    return session.page;
  }

  async function saveScreenshot(page, invocationId) {
    if (!screenshotDir) return null;
    fsImpl.mkdirSync(screenshotDir, { recursive: true });
    const filePath = path.join(screenshotDir, `${invocationId}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    return invocationId;
  }

  async function runAction(normalized, { sessionKey, invocationId }) {
    const { action } = normalized;
    const session = await withPage(sessionKey);
    const started = Date.now();
    const deadline = started + config.timeoutMs;
    const page = await currentPage(session);

    async function bounded(fn) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw browserError("AI_BROWSER_TIMEOUT", "Browser action timed out.", 504);
      return Promise.race([
        fn(),
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(browserError("AI_BROWSER_TIMEOUT", "Browser action timed out.", 504)), remaining);
          timer.unref?.();
        }),
      ]);
    }

    try {
      if (action === "open") {
        const target = await resolveBrowserNavigationTarget(normalized.url, { allowedPrivateHosts: config.allowedPrivateHosts });
        await bounded(() => page.goto(target.url.toString(), { waitUntil: "domcontentloaded", timeout: Math.min(config.timeoutMs, 15_000) }));
        if (normalized.waitMs) await bounded(() => new Promise((resolve) => setTimeout(resolve, normalized.waitMs)));
        const title = (await page.title()) || "";
        const rawText = await page.evaluate(() => document.body?.innerText ?? "");
        const screenshotKey = await saveScreenshot(page, invocationId);
        return {
          ok: true,
          action,
          url: page.url(),
          title: title.slice(0, 2000),
          text: String(await maskText(rawText)).slice(0, config.textLimit),
          ...(screenshotKey ? { screenshotKey } : {}),
        };
      }
      if (action === "text") {
        const rawText = await page.evaluate(() => document.body?.innerText ?? "");
        return { ok: true, action, url: page.url(), text: String(await maskText(rawText)).slice(0, config.textLimit) };
      }
      if (action === "screenshot") {
        const screenshotKey = await saveScreenshot(page, invocationId);
        return { ok: true, action, url: page.url(), ...(screenshotKey ? { screenshotKey } : {}) };
      }
      if (action === "click") {
        await bounded(() => page.click(normalized.selector, { timeout: Math.min(config.timeoutMs, 10_000) }));
        return { ok: true, action, url: page.url() };
      }
      if (action === "type") {
        await bounded(() => page.fill(normalized.selector, normalized.text, { timeout: Math.min(config.timeoutMs, 10_000) }));
        return { ok: true, action, url: page.url() };
      }
      if (action === "press") {
        await bounded(() => page.press(normalized.selector, normalized.key, { timeout: Math.min(config.timeoutMs, 10_000) }));
        return { ok: true, action, url: page.url() };
      }
      throw browserError("AI_BROWSER_ACTION_UNKNOWN", `Unsupported browser action: ${action}.`, 400);
    } catch (error) {
      if (error?.code?.startsWith?.("AI_BROWSER_")) throw error;
      throw browserError("AI_BROWSER_ACTION_FAILED", String(error?.message || "Browser action failed.").slice(0, 300), 502);
    }
  }

  function executeAction(normalized, { sessionKey, invocationId }) {
    const task = queue.then(() => runAction(normalized, { sessionKey, invocationId }));
    // Keep the chain alive even when one action rejects.
    queue = task.then(() => undefined, () => undefined);
    return task;
  }

  // Idle session sweep + shutdown. Called by the gateway on an interval and
  // by the server lifecycle on close.
  function sweepSessions() {
    const now = Date.now();
    for (const [key, session] of sessions) {
      if (now - session.lastUsed > config.sessionTtlMs) {
        sessions.delete(key);
        void session.context.close().catch(() => {});
      }
    }
  }

  async function close() {
    for (const [key, session] of sessions) {
      sessions.delete(key);
      await session.context.close().catch(() => {});
    }
    if (browserPromise) {
      const browser = await browserPromise.catch(() => null);
      browserPromise = null;
      if (browser) await browser.close().catch(() => {});
    }
  }

  return {
    config,
    normalizeAction: normalizeBrowserAction,
    executeAction,
    resolveNavigationTarget: resolveBrowserNavigationTarget,
    sweepSessions,
    close,
    status: () => ({ enabled: config.enabled, channel: config.channel, sessions: sessions.size }),
  };
}

module.exports = {
  BROWSER_ACTIONS,
  createBrowserControlService,
  normalizeBrowserAction,
  resolveBrowserConfig,
  resolveBrowserNavigationTarget,
};
