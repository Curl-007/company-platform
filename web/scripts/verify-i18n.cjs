/* One-off i18n switch verification: login → zh → switch EN → verify nav/dashboard/
   AI page (chat history panel) → switch back. Run with node, needs dev server at 4010. */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: 'zh-CN' });
  await page.goto('http://localhost:4010/#/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await page.locator('#login-email').fill('admin@company.local');
  await page.locator('#login-password').fill('9sf4LY5gtrcpWqBU');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForTimeout(3000);

  const zhNav = await page.locator('.kaneo-sidebar-menu-button').first().textContent();
  const zhBrand = await page.locator('.kaneo-sidebar-brand-name').textContent();

  // Switch to EN
  await page.locator('.kaneo-sidebar-lang-btn', { hasText: 'EN' }).click();
  await page.waitForTimeout(2000);
  const htmlLang = await page.locator('html').getAttribute('lang');
  const enNav = await page.locator('.kaneo-sidebar-menu-button').first().textContent();
  const enBrand = await page.locator('.kaneo-sidebar-brand-name').textContent();
  const enHeading = await page.locator('h1').first().textContent();

  // AI page: chat history panel title must be the EN key value, not the raw key.
  await page.getByRole('button', { name: /AI/ }).first().click();
  await page.waitForTimeout(6000);
  const retry = page.getByRole('button', { name: 'Retry' });
  if (await retry.count()) { await retry.click(); await page.waitForTimeout(5000); }
  const historyTitle = await page.locator('.ai-chat-history .panel-title').first().textContent().catch(() => null);
  const historyPanelCount = await page.locator('.ai-chat-history').count();

  // Switch back to zh
  await page.locator('.kaneo-sidebar-lang-btn', { hasText: '中' }).click();
  await page.waitForTimeout(2000);
  const zhBack = await page.locator('.kaneo-sidebar-brand-name').textContent();

  console.log(JSON.stringify({
    zhNav, zhBrand,
    htmlLang, enNav, enBrand, enHeading,
    historyTitle, historyPanelCount,
    zhBack,
  }, null, 1));

  await browser.close();
})().catch((error) => { console.error('FAILED:', error.message); process.exit(1); });
