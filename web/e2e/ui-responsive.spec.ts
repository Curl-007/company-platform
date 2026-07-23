import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#login-email').fill('admin@example.com');
  await page.locator('#login-password').fill('Admin@123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.sidebar-nav')).toBeAttached();
}

async function openMobilePage(page: Page, label: string) {
  await page.getByRole('button', { name: '打开导航' }).click();
  const sidebar = page.locator('#primary-sidebar');
  await expect(sidebar).toHaveClass(/mobile-open/);
  await sidebar.getByRole('button', { name: label, exact: true }).click();
  await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
}

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}

async function attachViewport(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, {
    path,
    contentType: 'image/png',
  });
}

async function attachVisibleViewport(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, {
    path,
    contentType: 'image/png',
  });
}

test.describe('professional workbench responsive shell', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile dashboard, products and delivery stay inside the viewport', async ({ page }, testInfo) => {
    await login(page);

    await expect(page.locator('html')).toHaveAttribute('data-work-theme', 'scholar');
    await expect(page.locator('html')).toHaveAttribute('data-work-mode', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-work-density', 'standard');
    await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
    await expectNoPageOverflow(page);
    await attachViewport(page, testInfo, 'mobile-dashboard');

    const themeTrigger = page.getByRole('button', { name: '打开主题设置' });
    await themeTrigger.click();
    const themeDialog = page.getByRole('dialog', { name: '主题设置' });
    await expect(themeDialog).toBeVisible();
    const themeBox = await themeDialog.boundingBox();
    expect(themeBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(themeBox?.width ?? 999).toBeLessThanOrEqual(390);
    await attachVisibleViewport(page, testInfo, 'mobile-theme-settings');
    await page.keyboard.press('Escape');
    await expect(themeDialog).not.toBeVisible();
    await expect(themeTrigger).toBeFocused();

    await openMobilePage(page, '产品管理');
    await expect(page.getByRole('heading', { name: '产品管理' })).toBeVisible();
    const productTabs = page.getByRole('tablist', { name: '产品管理视图' });
    await expect(productTabs.getByRole('tab')).toHaveCount(3);
    await productTabs.getByRole('tab', { name: '产品' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(productTabs.getByRole('tab', { name: '项目集' })).toHaveAttribute('aria-selected', 'true');
    await expectNoPageOverflow(page);
    await attachViewport(page, testInfo, 'mobile-products');

    await openMobilePage(page, '交付中心');
    await expect(page.getByRole('heading', { name: '构建发布中心' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: '构建发布视图' })).toBeVisible();
    await expectNoPageOverflow(page);
    await attachViewport(page, testInfo, 'mobile-delivery');
  });
});

test.describe('professional workbench desktop shell', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('login and dashboard use the production design preset', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    await attachViewport(page, testInfo, 'desktop-login');

    await page.locator('#login-email').fill('admin@example.com');
    await page.locator('#login-password').fill('Admin@123');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-work-theme', 'scholar');
    await expectNoPageOverflow(page);
    await attachViewport(page, testInfo, 'desktop-dashboard');
  });

  test('theme settings apply, persist and reset while issue pages keep their hierarchy', async ({ page }, testInfo) => {
    await login(page);

    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-work-theme', 'scholar');
    await expect(root).toHaveAttribute('data-work-mode', 'light');
    await expect(root).toHaveAttribute('data-work-density', 'standard');
    await expect(page.locator('body')).toHaveCSS('font-size', '15px');

    const trigger = page.getByRole('button', { name: '打开主题设置' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '主题设置' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: '关闭主题设置' })).toBeFocused();

    const themeBackgrounds = new Set<string>();
    for (const [label, id] of [
      ['极光全息', 'aurora'],
      ['赛博霓虹', 'cyber'],
      ['暖阳极简', 'sunset'],
      ['森林自然', 'forest'],
      ['专业工作台', 'scholar'],
    ] as const) {
      await dialog.getByRole('button', { name: new RegExp(label) }).click();
      await expect(root).toHaveAttribute('data-work-theme', id);
      themeBackgrounds.add(await root.evaluate((element) => getComputedStyle(element).getPropertyValue('--bg-page')));
    }
    expect(themeBackgrounds.size).toBe(5);

    const lightBackground = await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor);
    await dialog.getByRole('button', { name: '深色', exact: true }).click();
    await expect(root).toHaveAttribute('data-work-mode', 'dark');
    const darkBackground = await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(darkBackground).not.toBe(lightBackground);
    await dialog.getByRole('button', { name: '浅色', exact: true }).click();
    await expect(root).toHaveAttribute('data-work-mode', 'light');

    const panelBody = page.locator('.panel-body').first();
    const standardPadding = await panelBody.evaluate((element) => getComputedStyle(element).paddingTop);
    const compactToggle = dialog.getByRole('button', { name: /紧凑布局/ });
    await compactToggle.click();
    await expect(compactToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(root).toHaveAttribute('data-work-density', 'compact');
    const compactPadding = await panelBody.evaluate((element) => getComputedStyle(element).paddingTop);
    expect(compactPadding).not.toBe(standardPadding);

    const borderBefore = await page.locator('.panel').first().evaluate((element) => getComputedStyle(element).borderTopColor);
    const contrastToggle = dialog.getByRole('button', { name: /高对比/ });
    await contrastToggle.click();
    await expect(contrastToggle).toHaveAttribute('aria-pressed', 'true');
    const borderAfter = await page.locator('.panel').first().evaluate((element) => getComputedStyle(element).borderTopColor);
    expect(borderAfter).not.toBe(borderBefore);

    const backgroundBefore = await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundImage);
    const ambientToggle = dialog.getByRole('button', { name: /环境光/ });
    await ambientToggle.click();
    await expect(ambientToggle).toHaveAttribute('aria-pressed', 'true');
    const backgroundAfter = await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(backgroundAfter).not.toBe(backgroundBefore);

    await dialog.getByRole('button', { name: /减少动效/ }).click();
    await expect(root).toHaveAttribute('data-work-motion', 'reduced');
    await dialog.getByRole('button', { name: '现代无衬线', exact: true }).click();
    await expect(root).toHaveAttribute('data-work-font', 'sans');

    await dialog.getByRole('button', { name: '增大字号' }).click();
    await dialog.getByRole('button', { name: '增大字号' }).click();
    await expect(page.locator('body')).toHaveCSS('font-size', '17px');

    const gutter = dialog.getByRole('slider', { name: '内容边距' });
    await gutter.focus();
    await page.keyboard.press('ArrowRight');
    await expect(gutter).toHaveAttribute('aria-valuenow', '28');
    await expect(root).toHaveCSS('--content-padding', '28px');

    await dialog.getByRole('button', { name: '迷你', exact: true }).click();
    await expect(root).toHaveAttribute('data-work-nav-layout', 'mini');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();

    await page.reload();
    await expect(root).toHaveAttribute('data-work-theme', 'scholar');
    await expect(root).toHaveAttribute('data-work-density', 'compact');
    await expect(root).toHaveAttribute('data-work-contrast', 'high');
    await expect(root).toHaveAttribute('data-work-font', 'sans');
    await expect(root).toHaveAttribute('data-work-nav-layout', 'mini');
    await expect(page.locator('body')).toHaveCSS('font-size', '17px');

    await page.getByRole('button', { name: '打开主题设置' }).click();
    await page.getByRole('button', { name: '恢复默认' }).click();
    await expect(root).toHaveAttribute('data-work-theme', 'scholar');
    await expect(root).toHaveAttribute('data-work-mode', 'light');
    await expect(root).toHaveAttribute('data-work-density', 'standard');
    await expect(root).toHaveAttribute('data-work-contrast', 'default');
    await expect(root).toHaveAttribute('data-work-ambient', 'off');
    await expect(root).toHaveAttribute('data-work-font', 'system');
    await expect(root).toHaveAttribute('data-work-nav-layout', 'expanded');
    await expect(page.locator('body')).toHaveCSS('font-size', '15px');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: '动态中心', exact: true }).click();
    await expect(page.getByRole('heading', { name: '动态中心' })).toBeVisible();
    const importantCard = page.locator('.dynamic-timeline-item.is-important .dynamic-timeline-content').first();
    await expect(importantCard).toBeVisible();
    const importantBackground = await importantCard.evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(importantBackground).not.toContain('18, 18, 26');
    await importantCard.scrollIntoViewIfNeeded();
    await attachVisibleViewport(page, testInfo, 'desktop-dynamic-fixed');

    await page.evaluate(() => window.scrollTo(0, 700));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.getByRole('button', { name: '我的工作', exact: true }).click();
    await expect(page.getByRole('heading', { name: '我的工作' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const emptyPanel = page.locator('.mywork-empty-panel');
    if (await emptyPanel.count()) {
      await expect(emptyPanel).toBeVisible();
      await expect(page.locator('.mywork-panels')).toHaveCount(0);
      const box = await emptyPanel.boundingBox();
      expect(box?.height ?? 999).toBeLessThan(320);
    }
    await expectNoPageOverflow(page);
    await attachViewport(page, testInfo, 'desktop-theme-and-issue-fixes');
  });

  test('reported empty, governance, progress and pipeline issues stay fixed', async ({ page }, testInfo) => {
    await page.route('**/api/dashboard/personal', async (route) => {
      const response = await route.fetch();
      const body = await response.json() as { data?: Record<string, unknown> } & Record<string, unknown>;
      const dashboard = (body.data ?? body) as Record<string, unknown>;
      dashboard.myDefects = [];
      dashboard.requirementProgress = [];
      await route.fulfill({ response, json: body });
    });

    await login(page);

    await page.getByRole('button', { name: '我的工作', exact: true }).click();
    await expect(page.getByRole('heading', { name: '我的工作' })).toBeVisible();

    await page.getByRole('button', { name: '我的缺陷', exact: true }).click();
    await expect(page.getByRole('heading', { name: '当前没有待处理缺陷' })).toBeVisible();
    await expect(page.locator('.mywork-empty-panel')).toHaveCount(1);
    await expect(page.locator('.mywork-split')).toHaveCount(0);

    await page.getByRole('button', { name: '我的需求', exact: true }).click();
    await expect(page.getByRole('heading', { name: '当前没有待跟进需求' })).toBeVisible();
    await expect(page.locator('.mywork-empty-panel')).toHaveCount(1);
    await expect(page.locator('.mywork-split')).toHaveCount(0);
    await expectNoPageOverflow(page);
    await attachVisibleViewport(page, testInfo, 'desktop-mywork-empty-fixed');

    await page.getByRole('button', { name: '团队管理', exact: true }).click();
    await expect(page.getByRole('heading', { name: '团队管理' })).toBeVisible();
    const governanceIcons = page.locator('.team-governance-icon');
    await expect(governanceIcons).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const icon = governanceIcons.nth(index);
      await expect(icon).toHaveCSS('display', 'grid');
      const centers = await icon.evaluate((element) => {
        const host = element.getBoundingClientRect();
        const svg = element.querySelector('svg')?.getBoundingClientRect();
        return svg ? {
          dx: Math.abs((host.left + host.width / 2) - (svg.left + svg.width / 2)),
          dy: Math.abs((host.top + host.height / 2) - (svg.top + svg.height / 2)),
        } : null;
      });
      expect(centers).not.toBeNull();
      expect(centers?.dx ?? 99).toBeLessThanOrEqual(1);
      expect(centers?.dy ?? 99).toBeLessThanOrEqual(1);
    }
    await attachVisibleViewport(page, testInfo, 'desktop-team-governance-fixed');

    await page.getByRole('button', { name: '部门目录', exact: true }).click();
    const departmentDialog = page.getByRole('dialog', { name: '部门目录' });
    await expect(departmentDialog).toBeVisible();
    await expect(departmentDialog.getByRole('button', { name: '新建部门', exact: true })).toHaveCount(0);
    await expect(departmentDialog.locator('#department-name')).toBeFocused();
    await expect(departmentDialog.locator('.department-form-actions')).toBeVisible();
    await attachVisibleViewport(page, testInfo, 'desktop-team-and-department-fixed');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: '需求管理', exact: true }).click();
    await expect(page.getByRole('heading', { name: '需求管理' })).toBeVisible();
    const completionCells = page.locator('.requirement-completion-cell');
    const completionCount = await completionCells.count();
    for (let index = 0; index < completionCount; index += 1) {
      const cell = completionCells.nth(index);
      await expect(cell.getByRole('progressbar')).toBeAttached();
      await expect(cell.locator('.progress-bar-label')).toHaveCount(0);
      const percentTokens = (await cell.innerText()).match(/\d+%/g) ?? [];
      expect(percentTokens).toHaveLength(1);
    }

    await page.getByRole('button', { name: '交付中心', exact: true }).click();
    await expect(page.getByRole('heading', { name: '构建发布中心' })).toBeVisible();
    const pipeline = page.locator('.delivery-pipeline');
    await expect(pipeline.locator('.delivery-stage')).toHaveCount(4);
    const pipelineWidth = await pipeline.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(pipelineWidth.scroll).toBeLessThanOrEqual(pipelineWidth.client + 1);
    await expectNoPageOverflow(page);
    await attachViewport(page, testInfo, 'desktop-reported-issues-fixed');
  });
});
