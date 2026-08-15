const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const {
  createBrowserControlService,
  normalizeBrowserAction,
  resolveBrowserNavigationTarget,
} = require("../src/modules/ai/browserControl");

function fakePage({ title = "Fake Page", bodyText = "hello browser", screenshotError = null } = {}) {
  const calls = { goto: 0, click: 0, fill: 0, press: 0, screenshot: 0, evaluate: 0 };
  return {
    calls,
    async goto() { calls.goto += 1; },
    async title() { return title; },
    async evaluate() { calls.evaluate += 1; return bodyText; },
    async screenshot({ path: filePath }) {
      calls.screenshot += 1;
      if (screenshotError) throw screenshotError;
      fs.writeFileSync(filePath, "fake-png-bytes");
    },
    async click() { calls.click += 1; },
    async fill() { calls.fill += 1; },
    async press() { calls.press += 1; },
    url: () => "https://example.com/page",
  };
}

function fakeBrowser(factoryPage = () => fakePage()) {
  const contexts = [];
  const browser = {
    pages: [],
    async newContext() {
      const page = factoryPage();
      browser.pages.push(page);
      const context = {
        page,
        async newPage() { return page; },
        async close() {},
      };
      contexts.push(context);
      return context;
    },
    async close() {},
    on() {},
    contexts,
  };
  return browser;
}

function createService(overrides = {}) {
  const page = overrides.page || fakePage();
  const browser = overrides.browser || fakeBrowser(() => page);
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-browser-"));
  const service = createBrowserControlService({
    storageDir,
    masking: {
      applyToText: (text) => String(text).replace("secret-key", "[已脱敏]"),
    },
    playwrightFactory: () => ({ chromium: { launch: async () => browser } }),
    env: { BROWSER_ENABLED: "true", BROWSER_TIMEOUT_MS: "5000", BROWSER_TEXT_LIMIT: "200", ...(overrides.env || {}) },
  });
  return { service, browser, page, storageDir };
}

test("normalizeBrowserAction enforces the action whitelist", () => {
  assert.throws(() => normalizeBrowserAction({ action: "explode" }), /Unsupported browser action/);
  assert.throws(() => normalizeBrowserAction({}), /Unsupported browser action/);
  assert.throws(() => normalizeBrowserAction(null), /invalid/);
  assert.deepEqual(normalizeBrowserAction({ action: "text" }), { action: "text" });
});

test("normalizeBrowserAction requires per-action fields and bounds waitMs", () => {
  assert.throws(() => normalizeBrowserAction({ action: "open" }), /open requires a url/);
  assert.throws(() => normalizeBrowserAction({ action: "click" }), /click requires a selector/);
  assert.throws(() => normalizeBrowserAction({ action: "type", selector: "#a" }), /type requires text/);
  assert.throws(() => normalizeBrowserAction({ action: "press", selector: "#a" }), /press requires a key/);
  assert.deepEqual(
    normalizeBrowserAction({ action: "open", url: "https://example.com", waitMs: "999999" }),
    { action: "open", url: "https://example.com" },
  );
  assert.deepEqual(
    normalizeBrowserAction({ action: "type", selector: "#q", text: "hello", waitMs: "50" }),
    { action: "type", selector: "#q", text: "hello", waitMs: 50 },
  );
});

test("resolveBrowserNavigationTarget blocks bad schemes, credentials and private IPs", async () => {
  await assert.rejects(
    resolveBrowserNavigationTarget("javascript:alert(1)", { allowedPrivateHosts: new Set(["localhost"]) }),
    /only allows http\/https/,
  );
  await assert.rejects(
    resolveBrowserNavigationTarget("file:///etc/passwd", { allowedPrivateHosts: new Set(["localhost"]) }),
    /only allows http\/https/,
  );
  await assert.rejects(
    resolveBrowserNavigationTarget("https://user:pass@example.com/", { allowedPrivateHosts: new Set(["localhost"]) }),
    /cannot carry credentials/,
  );
  await assert.rejects(
    resolveBrowserNavigationTarget("http://192.168.1.10/", { allowedPrivateHosts: new Set(["localhost"]) }),
    /private or reserved address/,
  );
  await assert.rejects(
    resolveBrowserNavigationTarget("http://127.0.0.1:4010/", { allowedPrivateHosts: new Set(["example.com"]) }),
    /private or reserved address/,
  );
});

test("resolveBrowserNavigationTarget allows localhost and the allowlist", async () => {
  const local = await resolveBrowserNavigationTarget("http://localhost:4010/#/settings", {
    allowedPrivateHosts: new Set(["localhost"]),
  });
  assert.equal(local.hostname, "localhost");
  assert.equal(local.url.hash, "#/settings");

  const listed = await resolveBrowserNavigationTarget("http://192.168.3.18:8000/v1", {
    allowedPrivateHosts: new Set(["192.168.3.18"]),
  });
  assert.equal(listed.hostname, "192.168.3.18");
});

test("resolveBrowserNavigationTarget rejects hostnames resolving to private addresses", async () => {
  const lookup = (_hostname, _options, callback) => callback(null, [
    { address: "10.0.0.5", family: 4 },
  ]);
  await assert.rejects(
    resolveBrowserNavigationTarget("https://intranet.example.com/", {
      allowedPrivateHosts: new Set(["localhost"]),
      lookup,
    }),
    /private or reserved address/,
  );
});

test("open navigates, extracts masked text and saves a screenshot", async () => {
  const { service, page, storageDir } = createService({
    page: fakePage({ title: "Example", bodyText: "welcome to the secret-key page" }),
  });
  const result = await service.executeAction(
    normalizeBrowserAction({ action: "open", url: "https://example.com/" }),
    { sessionKey: "USR-PM:PRJ-1", invocationId: "AIC-1" },
  );
  assert.equal(result.ok, true);
  assert.equal(result.action, "open");
  assert.equal(result.title, "Example");
  assert.equal(result.text, "welcome to the [已脱敏] page");
  assert.equal(result.screenshotKey, "AIC-1");
  assert.equal(page.calls.goto, 1);
  assert.ok(fs.existsSync(path.join(storageDir, "browser", "AIC-1.png")));
  fs.rmSync(storageDir, { recursive: true, force: true });
});

test("interaction actions route to the right playwright calls", async () => {
  const { service, page } = createService();
  await service.executeAction(normalizeBrowserAction({ action: "click", selector: "#submit" }), {
    sessionKey: "USR-PM:PRJ-1", invocationId: "AIC-2",
  });
  await service.executeAction(normalizeBrowserAction({ action: "type", selector: "#q", text: "hi" }), {
    sessionKey: "USR-PM:PRJ-1", invocationId: "AIC-3",
  });
  await service.executeAction(normalizeBrowserAction({ action: "press", selector: "#q", key: "Enter" }), {
    sessionKey: "USR-PM:PRJ-1", invocationId: "AIC-4",
  });
  await service.executeAction(normalizeBrowserAction({ action: "screenshot" }), {
    sessionKey: "USR-PM:PRJ-1", invocationId: "AIC-5",
  });
  assert.equal(page.calls.click, 1);
  assert.equal(page.calls.fill, 1);
  assert.equal(page.calls.press, 1);
  assert.equal(page.calls.screenshot, 1);
  await service.close();
});

test("text action extracts masked page text without navigating", async () => {
  const { service, page } = createService({
    page: fakePage({ bodyText: "plain text with secret-key inside" }),
  });
  const result = await service.executeAction(normalizeBrowserAction({ action: "text" }), {
    sessionKey: "USR-PM:PRJ-1", invocationId: "AIC-6",
  });
  assert.equal(result.text, "plain text with [已脱敏] inside");
  assert.equal(page.calls.goto, 0);
  await service.close();
});

test("disabled config rejects actions", async () => {
  const { service } = createService({ env: { BROWSER_ENABLED: "false" } });
  await assert.rejects(
    service.executeAction(normalizeBrowserAction({ action: "text" }), {
      sessionKey: "USR-PM:PRJ-1", invocationId: "AIC-7",
    }),
    /Browser control is disabled/,
  );
});

test("browser failures surface as AI_BROWSER_ACTION_FAILED", async () => {
  const { service } = createService({
    page: fakePage({ screenshotError: new Error("boom") }),
  });
  await assert.rejects(
    service.executeAction(normalizeBrowserAction({ action: "screenshot" }), {
      sessionKey: "USR-PM:PRJ-1", invocationId: "AIC-8",
    }),
    /boom/,
  );
  await service.close();
});

test("masking awaits an async applyToText (regression: [object Promise])", async () => {
  const page = fakePage({ bodyText: "async masked secret-key text" });
  const browser = fakeBrowser(() => page);
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-browser-"));
  const service = createBrowserControlService({
    storageDir,
    masking: {
      async applyToText(text) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return String(text).replace("secret-key", "[已脱敏]");
      },
    },
    playwrightFactory: () => ({ chromium: { launch: async () => browser } }),
    env: { BROWSER_ENABLED: "true", BROWSER_TIMEOUT_MS: "5000" },
  });
  const result = await service.executeAction(normalizeBrowserAction({ action: "text" }), {
    sessionKey: "USR-PM:PRJ-1", invocationId: "AIC-ASYNC",
  });
  assert.equal(result.text, "async masked [已脱敏] text");
  assert.notEqual(result.text, "[object Promise]");
  await service.close();
  fs.rmSync(storageDir, { recursive: true, force: true });
});

test("masking accepts the service's { text, violations } envelope", async () => {
  const { service } = createService({
    page: fakePage({ bodyText: "object envelope secret-key text" }),
    maskingOverride: true,
  });
  // Rebuild with an envelope-returning masking service.
  const page = fakePage({ bodyText: "object envelope secret-key text" });
  const browser = fakeBrowser(() => page);
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-browser-"));
  const svc = createBrowserControlService({
    storageDir,
    masking: {
      async applyToText(text) {
        return { text: String(text).replace("secret-key", "[已脱敏]"), violations: [] };
      },
    },
    playwrightFactory: () => ({ chromium: { launch: async () => browser } }),
    env: { BROWSER_ENABLED: "true", BROWSER_TIMEOUT_MS: "5000" },
  });
  const result = await svc.executeAction(normalizeBrowserAction({ action: "text" }), {
    sessionKey: "USR-PM:PRJ-1", invocationId: "AIC-ENV",
  });
  assert.equal(result.text, "object envelope [已脱敏] text");
  await svc.close();
  fs.rmSync(storageDir, { recursive: true, force: true });
});
