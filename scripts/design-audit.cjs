/* Screenshot every page surface for design audit. Run: node scripts/design-audit.cjs <outDir> */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const OUT = process.argv[2] || path.join(require("node:os").tmpdir(), "design-audit");
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.AUDIT_BASE || "http://localhost:5173";

// All admin-visible routes in sidebar order.
const PAGES = [
  ["dashboard", "工作台"],
  ["mywork", "我的工作"],
  ["team", "团队管理"],
  ["teamlogs", "团队日报"],
  ["capacity", "团队容量"],
  ["dynamic", "动态中心"],
  ["projects", "项目执行"],
  ["requirements", "需求管理"],
  ["testing", "测试质量"],
  ["delivery", "交付中心"],
  ["documents", "文档中心"],
  ["ai", "AI分析"],
  ["dsh-ui", "DSH界面"],
  ["reports", "报表中心"],
  ["products", "产品管理"],
  ["flow", "研发流程"],
  ["settings", "系统设置"],
];

async function safeClick(page, selectors) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: "visible", timeout: 2200 });
      await loc.click({ timeout: 2200 });
      return sel;
    } catch { /* try next */ }
  }
  return null;
}

async function shot(page, name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`shot ${name}`);
}

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  if (page.url().includes("login") || (await page.locator("input[type=password]").count()) > 0) {
    await page.getByLabel(/邮箱|邮件|账号|Email/i).or(page.locator("input[type=email], input[name=email]").first()).first().fill("admin@example.com");
    await page.locator("input[type=password]").first().fill("Admin@123");
    await page.getByRole("button", { name: /登录|登 录|Login/i }).first().click();
    await page.waitForTimeout(2200);
  }
}

async function open(page, key) {
  await page.goto(`${BASE}/#/${key}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1300);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 940 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 160)));

  await login(page);
  await shot(page, "00-dashboard");

  for (const [key, label] of PAGES) {
    if (key === "dashboard") continue;
    await open(page, key);
    await shot(page, `page-${key}`);
  }

  // Detail interactions worth auditing per feature.
  await open(page, "projects");
  await safeClick(page, ["[class*='project-card']", "[class*='project-item']", "[class*='project-row']", "table tbody tr"]);
  await shot(page, "detail-project");

  await open(page, "requirements");
  await safeClick(page, ["[class*='requirement'] [class*='row'], [class*='req-'] [class*='item']", "table tbody tr"]);
  await shot(page, "detail-requirement");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  await open(page, "testing");
  await safeClick(page, ["[class*='test-case-item'], [class*='tc-item'], [class*='case-row']", "table tbody tr"]);
  await shot(page, "detail-testcase");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  await open(page, "team");
  await safeClick(page, ["[class*='member-card'], [class*='team-card'], [class*='member-item']", "table tbody tr"]);
  await shot(page, "detail-member");
  await page.keyboard.press("Escape");

  await open(page, "documents");
  await safeClick(page, ["[class*='doc-item'], [class*='document-item'], [class*='doc-card']", "table tbody tr"]);
  await shot(page, "detail-doc");

  await open(page, "teamlogs");
  await safeClick(page, ["[class*='summary'], [class*='member-summary'] [class*='open'], [class*='log-row']", "[class*='toolbar'] button"]);
  await shot(page, "detail-member-summary");

  await open(page, "flow");
  await shot(page, "detail-flow");

  await browser.close();
  console.log("DONE ->", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
