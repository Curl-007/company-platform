const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const base = 'http://localhost:5173';
  const out = __dirname + '/shots';
  const fs = require('fs');
  fs.mkdirSync(out, { recursive: true });

  const pages = [
    ['dashboard', 'Dashboard'],
    ['projects', 'Projects'],
    ['products', 'Products'],
    ['requirements', 'Requirements'],
    ['testing', 'Testing'],
    ['documents', 'Documents'],
    ['organization', 'Organization'],
    ['ai', 'AI Analysis'],
    ['reports', 'Reports'],
    ['flow', 'Flow'],
    ['settings', 'Settings'],
  ];

  // Login via the UI
  await page.goto(base + '/#/login');
  await page.waitForTimeout(600);
  await page.screenshot({ path: out + '/00-login.png' });

  // Already pre-filled; submit
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  // Also capture mobile
  let i = 1;
  for (const [key, name] of pages) {
    await page.goto(base + '/#/' + key);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${String(i).padStart(2,'0')}-${key}.png` });
    console.log(`captured ${i}: ${name} (${key})`);
    i++;
  }

  // Mobile viewport capture (dashboard)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/#/dashboard');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: out + '/99-mobile-dashboard.png' });
  console.log('captured mobile dashboard');

  await browser.close();
  console.log('DONE');
})();
