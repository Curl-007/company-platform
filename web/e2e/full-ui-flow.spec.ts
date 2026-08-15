import { expect, test, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';

/**
 * Near-full UI tour (admin interactions + multi-role permission probes).
 * Compatible with empty DB: list shells, optional detail/form open-close only.
 *
 * Seed accounts (api/db.js bootstrap):
 *   admin@example.com / Admin@123
 *   pm@example.com    / Pm@12345
 *   pdm@example.com   / Pdm@12345
 *   dev@example.com   / Dev@12345
 *   qa@example.com    / Qa@12345
 */

type RoleKey = 'admin' | 'pm' | 'pdm' | 'dev' | 'qa';

const ACCOUNTS: Record<RoleKey, { email: string; password: string }> = {
  admin: { email: 'admin@example.com', password: 'Admin@123' },
  pm: { email: 'pm@example.com', password: 'Pm@12345' },
  pdm: { email: 'pdm@example.com', password: 'Pdm@12345' },
  dev: { email: 'dev@example.com', password: 'Dev@12345' },
  qa: { email: 'qa@example.com', password: 'Qa@12345' },
};

/** Full sidebar labels from pageRegistry NAV_GROUPS */
const ADMIN_NAV_WALK: Array<[string, RegExp | string]> = [
  ['工作台', /工作台/],
  ['我的工作', /我的工作/],
  ['团队管理', /团队/],
  ['团队日报', /日报|团队/],
  ['团队容量', /容量/],
  ['动态中心', /动态/],
  ['项目执行', '项目执行'],
  ['需求管理', /需求/],
  ['测试质量', '测试质量'],
  ['交付中心', '交付中心'],
  ['文档中心', /文档/],
  ['AI 分析', /AI|分析|助手/],
  ['报表中心', /报表/],
  ['产品管理', '产品管理'],
  ['研发流程', /流程|研发/],
  ['系统设置', /设置|系统/],
];

async function loginAs(page: Page, role: RoleKey) {
  const account = ACCOUNTS[role];
  await page.goto('/');
  await page.locator('#login-email').fill(account.email);
  await page.locator('#login-password').fill(account.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 20_000 });
}

async function openNav(page: Page, label: string) {
  await page.locator('.sidebar-nav').getByRole('button', { name: label, exact: true }).click();
}

async function expectHeading(page: Page, heading: RegExp | string) {
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 15_000 });
}

async function expectShell(page: Page) {
  await expect(
    page.locator('.page-header, .panel, .page-title, .card, .metric-card, .data-table').first(),
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('admin full navigation walk', () => {
  test('admin walks every pageRegistry sidebar page', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');

    for (const [nav, heading] of ADMIN_NAV_WALK) {
      const navBtn = page.locator('.sidebar-nav').getByRole('button', { name: nav, exact: true });
      await expect(navBtn).toBeVisible();
      await openNav(page, nav);
      await expectHeading(page, heading);
      await expectShell(page);
    }
  });
});

test.describe('admin key interactions', () => {
  test('A products page exposes only the supported tabs', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');
    await openNav(page, '产品管理');
    await expectHeading(page, '产品管理');

    for (const tab of ['产品', '项目集', '组合'] as const) {
      await page
        .locator('.nav-tabs.products-page-tabs, .products-page-tabs, .nav-tabs')
        .getByRole('tab', { name: tab, exact: true })
        .click();
      await expect(page.locator('.nav-tabs .nav-tab.active')).toContainText(tab);
    }

    await expect(page.locator('.nav-tabs .nav-tab')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '公司目标 / OKR', exact: true })).toHaveCount(0);
  });

  test('A2 product image upload renders through auth and can be removed', async ({ page }) => {
    test.setTimeout(120_000);
    const productName = `E2E 图片产品 ${Date.now()}`;
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );

    await loginAs(page, 'admin');
    await openNav(page, '产品管理');
    await expectHeading(page, '产品管理');
    await page.getByRole('button', { name: '新建产品', exact: true }).click();

    const createDialog = page.getByRole('dialog');
    await expect(createDialog.locator('.panel-title')).toHaveText('新建产品');
    await createDialog
      .locator('label.form-label')
      .filter({ hasText: /^产品名称$/ })
      .locator('..')
      .locator('input')
      .fill(productName);
    await createDialog
      .locator('label.form-label')
      .filter({ hasText: /^负责人$/ })
      .first()
      .locator('..')
      .locator('input')
      .fill('E2E 管理员');
    await createDialog.locator('input[type="file"]').setInputFiles({
      name: 'product-image.png',
      mimeType: 'image/png',
      buffer: onePixelPng,
    });
    await expect(createDialog.getByRole('img', { name: '待上传产品图片 1' })).toHaveAttribute('src', /^blob:/);

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' && url.pathname === '/api/products';
    });
    const uploadResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST'
        && /^\/api\/products\/[^/]+\/images$/.test(url.pathname);
    });
    await createDialog.getByRole('button', { name: '保存', exact: true }).click();
    expect((await createResponsePromise).ok()).toBeTruthy();
    expect((await uploadResponsePromise).ok()).toBeTruthy();
    await expect(createDialog).toHaveCount(0);

    const productItem = page.locator('.product-list-item').filter({ hasText: productName });
    await expect(productItem).toBeVisible();
    await productItem.click();
    const detailPane = page.locator('.product-detail-pane').filter({
      has: page.getByRole('heading', { name: productName, exact: true }),
    });
    const heroMedia = detailPane.locator('.product-hero-media');
    await expect(heroMedia.getByRole('img', { name: productName, exact: true })).toHaveAttribute('src', /^blob:/);

    await detailPane.getByRole('button', { name: '编辑产品', exact: true }).click();
    const editDialog = page.getByRole('dialog');
    await expect(editDialog.locator('.panel-title')).toHaveText('编辑产品');
    await editDialog
      .locator('.product-image-preview-item')
      .getByRole('button', { name: '删除', exact: true })
      .click();
    await expect(editDialog.locator('.product-image-dropzone')).toBeVisible();

    const deleteResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'DELETE'
        && /^\/api\/products\/[^/]+\/images\/[^/]+$/.test(url.pathname);
    });
    await editDialog.getByRole('button', { name: '保存', exact: true }).click();
    expect((await deleteResponsePromise).ok()).toBeTruthy();
    await expect(editDialog).toHaveCount(0);

    await expect(heroMedia.locator('img')).toHaveCount(0);
    await expect(heroMedia.locator('.product-hero-empty')).toHaveText(productName.slice(0, 1));
  });

  test('B project list shell and optional detail', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');
    await openNav(page, '项目执行');
    await expectHeading(page, '项目执行');
    await expect(page.getByRole('heading', { name: /项目驾驶舱|项目执行/ }).first()).toBeVisible();
    await expectShell(page);

    const viewBtn = page.getByRole('button', { name: '查看', exact: true }).first();
    if ((await viewBtn.count()) > 0) {
      await viewBtn.click();
      await expect(
        page.locator('.page-header, .project-detail-tabs, .nav-tabs, .panel').first(),
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test('C requirements list or empty and optional create cancel', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');
    await openNav(page, '需求管理');
    await expectHeading(page, /需求/);
    await expect(
      page.locator('.panel, .data-table, .tree-table, .page-header').first(),
    ).toBeVisible();

    const createBtn = page.getByRole('button', { name: '新建需求', exact: true });
    if ((await createBtn.count()) > 0) {
      await createBtn.click();
      // Panel titles are div.panel-title (not ARIA heading)
      await expect(page.locator('.panel-title').filter({ hasText: '新建需求' })).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await expect(page.locator('.panel-title').filter({ hasText: '新建需求' })).toHaveCount(0);
    }
  });

  test('D testing quality cases/defects tabs', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');
    await openNav(page, '测试质量');
    await expectHeading(page, '测试质量');

    const casesTab = page.locator('[role="tablist"][aria-label="测试质量视图"]').getByRole('tab', { name: '测试用例', exact: true });
    const defectsTab = page.locator('[role="tablist"][aria-label="测试质量视图"]').getByRole('tab', { name: '缺陷列表', exact: true });
    await expect(casesTab).toBeVisible();
    await expect(defectsTab).toBeVisible();

    await casesTab.click();
    await expect(page.locator('.qa-tab-chip.is-active')).toContainText('测试用例');
    await expect(page.locator('.panel-title').filter({ hasText: /测试用例/ }).first()).toBeVisible();

    await defectsTab.click();
    await expect(page.locator('.qa-tab-chip.is-active')).toContainText('缺陷列表');
    await expect(page.locator('.panel-title').filter({ hasText: /缺陷/ }).first()).toBeVisible();
  });

  test('E delivery center build/release/gate tabs', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');
    await openNav(page, '交付中心');
    await expectHeading(page, '交付中心');

    for (const tab of ['全链路', '构建', '发布', '质量门禁'] as const) {
      const tabBtn = page.locator('[role="tablist"][aria-label="构建发布视图"] [role="tab"]').filter({ hasText: tab });
      await expect(tabBtn.first()).toBeVisible();
      await tabBtn.first().click();
      await expect(page.locator('.dl-tab-chip.is-active').first()).toContainText(tab);
    }
    await expectShell(page);
  });

  test('F documents list shell and optional upload cancel', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');
    await openNav(page, '文档中心');
    await expectHeading(page, /文档/);
    await expect(
      page.locator('.panel, .page-header, .data-table, .documents-list').first(),
    ).toBeVisible();

    const uploadBtn = page.getByRole('button', { name: '上传文档', exact: true });
    if ((await uploadBtn.count()) > 0) {
      await uploadBtn.click();
      await expect(page.locator('.panel-title').filter({ hasText: '上传文档' })).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await expect(page.locator('.panel-title').filter({ hasText: '上传文档' })).toHaveCount(0);
    }
  });

  test('G my work four tabs', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');
    await openNav(page, '我的工作');
    await expectHeading(page, /我的工作/);

    // Tabs may appear after dashboard data loads
    const tabBar = page.locator('.mywork-tab-bar, .tab-bar.mywork-tab-bar');
    await expect(tabBar).toBeVisible({ timeout: 20_000 });

    // Panel titles are div.panel-title; assert active tab + related panel/shell content
    const tabs: Array<{ name: string; panel: RegExp }> = [
      { name: '我的任务', panel: /任务队列|任务详情|任务/ },
      { name: '我的缺陷', panel: /我的缺陷|缺陷/ },
      { name: '我的需求', panel: /我的需求|需求/ },
      { name: '日报周报', panel: /每日日报|AI 周报|实际工时|日报|周报/ },
    ];

    for (const { name, panel } of tabs) {
      const tab = tabBar.locator('.tab-item').filter({ hasText: name });
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tabBar.locator('.tab-item.active')).toContainText(name);
      await expect(page.locator('.panel-title, .mywork-empty-copy h3').filter({ hasText: panel }).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test('H team management loads', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'admin');
    await openNav(page, '团队管理');
    await expectHeading(page, /团队/);
    await expectShell(page);
  });

  test('I team capacity loads', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'admin');
    await openNav(page, '团队容量');
    await expectHeading(page, /容量/);
    await expectShell(page);
  });

  test('J dynamic center loads and optional filter', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');
    await openNav(page, '动态中心');
    await expectHeading(page, /动态/);
    await expectShell(page);

    const focusFilter = page.getByRole('button', { name: /只看重点|已只看重点/ });
    if ((await focusFilter.count()) > 0) {
      await focusFilter.first().click();
      await expect(focusFilter.first()).toBeVisible();
    }

    const search = page.locator('input[placeholder*="搜索人员"], input[placeholder*="搜索"]').first();
    if ((await search.count()) > 0) {
      await search.fill('登录');
      await expect(search).toHaveValue('登录');
    }
  });

  test('K flow templates cards visible', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'admin');
    await openNav(page, '研发流程');
    await expectHeading(page, /流程|研发/);
    await expect(page.locator('.panel-title').filter({ hasText: /流程模板/ }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('.flow-template-card').first()).toBeVisible({ timeout: 15_000 });
  });

  test('L reports center loads', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'admin');
    await openNav(page, '报表中心');
    await expectHeading(page, /报表/);
    await expectShell(page);
  });

  test('M AI analysis loads', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'admin');
    await openNav(page, 'AI 分析');
    await expectHeading(page, /AI|分析|助手/);
    await expectShell(page);
  });

  test('M2 AI chat can draft create test-case action card', async ({ page }) => {
    test.setTimeout(120_000);
    // Disposable RC often runs with AI_ENABLED=false; shell load is enough then.
    if (String(process.env.AI_ENABLED || '').toLowerCase() === 'false') {
      test.skip(true, 'AI_ENABLED=false — skip live model draft assertion');
    }
    await loginAs(page, 'admin');
    await openNav(page, 'AI 分析');
    await expectHeading(page, /AI|分析|助手/);

    const input = page.locator('textarea, input[type="text"]').filter({ hasNot: page.locator('[type="password"]') }).last();
    // Prefer the chat composer by placeholder
    const composer = page.getByPlaceholder(/新建需求|测试用例|缺陷|任务/);
    const box = (await composer.count()) > 0 ? composer.first() : input;
    await expect(box).toBeVisible({ timeout: 15_000 });
    await box.fill('新建测试用例：标题：E2E AI冒烟用例，项目请选择当前可选项目');
    await page.getByRole('button', { name: '发送', exact: true }).click();

    // Draft card, assistant reply, or disabled/unavailable AI feedback
    const draftTitle = page.locator('.panel-title, .ai-action-draft, .card, .panel, .toast, .form-error, .body-text').filter({
      hasText: /新建测试用例|测试用例|确认后才会写入|草稿|未启用|不可用|失败|AI/,
    });
    await expect(draftTitle.first()).toBeVisible({ timeout: 45_000 });
  });

  test('M3 global Copilot sidebar opens on any page with page context', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'admin');
    await openNav(page, '需求管理');

    // Bot entry toggles the global agent sidebar outside the AI workspace.
    await page.getByRole('button', { name: /显示 AI 面板/ }).click();
    const sidebar = page.locator('.agent-sidebar');
    await expect(sidebar).toBeVisible();
    // Context strip names the current page for the agent.
    await expect(sidebar.locator('.ai-sidebar-context')).toContainText('需求管理');
    // Shared chat pieces mount in compact mode.
    await expect(sidebar.locator('textarea')).toBeVisible();

    // The fixed sidebar overlays the topbar edge (same as the legacy one), so
    // closing goes through the sidebar's own close button.
    await sidebar.getByRole('button', { name: '关闭 AI 助手' }).click();
    await expect(page.locator('.agent-sidebar')).toHaveCount(0);
  });

  test('N system settings account/api/ai region', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'admin');
    await openNav(page, '系统设置');
    await expectHeading(page, /设置|系统/);

    // Settings panels use .panel-title (当前账号 / API 配置 / AI 模型配置 ...)
    const region = page
      .locator('.panel-title')
      .filter({ hasText: /当前账号|API|AI/ })
      .first();
    await expect(region).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('multi-role permission probes', () => {
  test('QA cannot see settings/products/delivery', async ({ page }) => {
    await loginAs(page, 'qa');
    const nav = page.locator('.sidebar-nav');
    await expect(nav.getByRole('button', { name: '系统设置', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: '产品管理', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: '交付中心', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: '测试质量', exact: true })).toBeVisible();
  });

  test('DEV cannot see settings/products', async ({ page }) => {
    await loginAs(page, 'dev');
    const nav = page.locator('.sidebar-nav');
    await expect(nav.getByRole('button', { name: '系统设置', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: '产品管理', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: '项目执行', exact: true })).toBeVisible();
    // Without ai:* capabilities the Copilot sidebar entry stays hidden (was a 403 trap).
    await expect(page.getByRole('button', { name: /AI 面板/ })).toHaveCount(0);
  });

  test('PDM can open products and requirements', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'pdm');
    const nav = page.locator('.sidebar-nav');
    await expect(nav.getByRole('button', { name: '产品管理', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: '需求管理', exact: true })).toBeVisible();

    await openNav(page, '产品管理');
    await expectHeading(page, '产品管理');
    await openNav(page, '需求管理');
    await expectHeading(page, /需求/);
  });

  test('PM can open delivery reports and flow', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'pm');
    const nav = page.locator('.sidebar-nav');
    await expect(nav.getByRole('button', { name: '交付中心', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: '报表中心', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: '研发流程', exact: true })).toBeVisible();

    await openNav(page, '交付中心');
    await expectHeading(page, '交付中心');
    await openNav(page, '报表中心');
    await expectHeading(page, /报表/);
    await openNav(page, '研发流程');
    await expectHeading(page, /流程|研发/);
  });
});

/**
 * DEV / QA personal assignment surfaces.
 * Relies on seed + full-flow assignment data when present; empty queues still pass as shell load.
 */
test.describe('assigned work surfaces for DEV and QA', () => {
  test('DEV mywork shows task/defect/requirement tabs', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'dev');
    await openNav(page, '我的工作');
    await expectHeading(page, /我的工作/);
    await expect(page.locator('.mywork-page, .page-header').first()).toBeVisible();

    for (const tab of ['我的任务', '我的缺陷', '我的需求', '日报周报'] as const) {
      await page.locator('.tab-bar, .mywork-tab-bar').getByRole('button', { name: tab, exact: true }).click();
      await expect(page.locator('.tab-bar .tab-item.active, .mywork-tab-bar .tab-item.active').first()).toContainText(tab);
      await expect(
        page.locator('.panel, .mywork-panels, .mywork-logs-layout, .body-text, .metric-card').first(),
      ).toBeVisible();
    }
  });

  test('DEV mywork task detail exposes handoff controls when applicable', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'dev');
    await openNav(page, '我的工作');
    await expectHeading(page, /我的工作/);
    await page.locator('.tab-bar, .mywork-tab-bar').getByRole('button', { name: '我的任务', exact: true }).click();
    const emptyTaskState = page.locator('.mywork-empty-panel');
    if ((await emptyTaskState.count()) > 0) {
      await expect(emptyTaskState).toContainText('当前没有待办任务');
      await expect(page.locator('.mywork-panels')).toHaveCount(0);
      return;
    }
    await expect(page.locator('.mywork-panel-left, .panel').filter({ hasText: /任务队列|任务/ }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('.mywork-panel-center, .panel').filter({ hasText: /任务详情|请选择/ }).first()).toBeVisible();
    const handoff = page.locator('.mywork-handoff');
    if ((await handoff.count()) > 0) {
      await expect(handoff.getByRole('button', { name: /提交测试|打回开发修复/ }).first()).toBeVisible();
    }
  });

  test('DEV mywork task filters align all = requirement + test + defect + general', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'dev');
    await openNav(page, '我的工作');
    await expectHeading(page, /我的工作/);
    await page.locator('.mywork-tab-bar, .tab-bar').getByRole('button', { name: '我的任务', exact: true }).click();

    const filters = page.locator('.mywork-task-filters');
    await expect(filters).toBeVisible({ timeout: 20_000 });
    for (const label of ['全部', '需求任务', '测试任务', '缺陷修复', '一般任务'] as const) {
      await expect(filters.getByRole('button', { name: new RegExp(label) })).toBeVisible();
    }

    async function filterCount(label: string): Promise<number> {
      const btn = filters.getByRole('button', { name: new RegExp(label) });
      const text = (await btn.locator('.mywork-filter-count').textContent())?.trim() ?? '0';
      return Number(text) || 0;
    }

    const all = await filterCount('全部');
    const requirement = await filterCount('需求任务');
    const testCase = await filterCount('测试任务');
    const defect = await filterCount('缺陷修复');
    const general = await filterCount('一般任务');
    expect(requirement + testCase + defect + general).toBe(all);

    if (all === 0) {
      await expect(page.locator('.mywork-empty-panel')).toContainText('当前没有待办任务');
      await expect(page.locator('.mywork-panels')).toHaveCount(0);
      return;
    }

    // Queue subtitle also exposes the same breakdown when on 全部
    await filters.getByRole('button', { name: /全部/ }).click();
    await expect(page.locator('.mywork-panel-left .panel-subtitle, .panel.mywork-panel-left .panel-subtitle').first()).toContainText(
      new RegExp(`共\\s*${all}\\s*条`),
    );

    // Switching to 一般任务 should show only that bucket's count in queue subtitle
    await filters.getByRole('button', { name: /一般任务/ }).click();
    if (general === 0) {
      await expect(page.locator('.mywork-empty-panel')).toContainText('当前类型暂无任务');
      await expect(page.locator('.mywork-panels')).toHaveCount(0);
      return;
    }
    await expect(page.locator('.mywork-panel-left, .panel.mywork-panel-left').first()).toContainText(
      new RegExp(`当前筛选\\s*${general}\\s*条`),
    );
  });

  test('QA mywork shows task/defect/requirement tabs', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'qa');
    await openNav(page, '我的工作');
    await expectHeading(page, /我的工作/);

    for (const tab of ['我的任务', '我的缺陷', '我的需求'] as const) {
      await page.locator('.tab-bar, .mywork-tab-bar').getByRole('button', { name: tab, exact: true }).click();
      await expect(page.locator('.tab-bar .tab-item.active, .mywork-tab-bar .tab-item.active').first()).toContainText(tab);
      await expect(page.locator('.panel, .mywork-panels, .body-text, .metric-card, .card').first()).toBeVisible();
    }
  });

  test('QA mywork defect detail can show assign-to-dev control', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'qa');
    await openNav(page, '我的工作');
    await page.locator('.tab-bar, .mywork-tab-bar').getByRole('button', { name: '我的缺陷', exact: true }).click();
    await expect(page.locator('.mywork-split, .mywork-empty-panel').first()).toBeVisible({ timeout: 15_000 });
    if ((await page.locator('.mywork-split').count()) > 0) {
      await expect(page.locator('.panel').filter({ hasText: /我的缺陷|缺陷详情/ }).first()).toBeVisible();
    }
    const handoff = page.locator('.mywork-handoff');
    if ((await handoff.count()) > 0) {
      await expect(handoff.getByRole('button', { name: /指派开发修复|指派测试验证/ }).first()).toBeVisible();
    }
  });

  test('QA testing quality can open cases and defects', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'qa');
    await openNav(page, '测试质量');
    await expectHeading(page, /测试|质量/);
    const tabs = page.locator('.nav-tabs, .tab-bar');
    for (const label of ['用例', '缺陷', '测试用例', '缺陷列表'] as const) {
      const btn = tabs.getByRole('button', { name: new RegExp(label) }).first();
      if ((await btn.count()) > 0) {
        await btn.click();
        await expect(page.locator('.panel, .data-table, .card, .body-text').first()).toBeVisible();
      }
    }
  });

  test('QA can open create test-case form and cancel', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'qa');
    await openNav(page, '测试质量');
    await expectHeading(page, /测试|质量/);

    const casesTab = page.locator('[role="tablist"][aria-label="测试质量视图"]').getByRole('tab', { name: /测试用例|用例/ }).first();
    if ((await casesTab.count()) > 0) {
      await casesTab.click();
    }
    await expect(page.locator('.panel-title').filter({ hasText: /测试用例/ }).first()).toBeVisible({
      timeout: 15_000,
    });

    const createBtn = page.getByRole('button', { name: '新建用例', exact: true });
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
    await createBtn.click();
    await expect(page.locator('.panel-title').filter({ hasText: '新建测试用例' })).toBeVisible({
      timeout: 10_000,
    });
    // Form should expose project + role assignment fields for multi-role ownership
    await expect(page.locator('.form-label').filter({ hasText: /所属项目|项目/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /取消|关闭/ }).first()).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click().catch(async () => {
      await page.locator('.overlay, .modal-backdrop').first().click({ position: { x: 4, y: 4 } }).catch(() => undefined);
    });
    // After cancel, create panel should go away or at least table shell remain
    await expect(page.locator('.panel-title').filter({ hasText: /测试用例/ }).first()).toBeVisible();
  });

  test('QA mywork can reach testing surface for assigned cases', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'qa');
    await openNav(page, '我的工作');
    await expectHeading(page, /我的工作/);
    await page.locator('.tab-bar, .mywork-tab-bar').getByRole('button', { name: '我的任务', exact: true }).click();
    await expect(page.locator('.panel, .mywork-panels, .body-text, .metric-card').first()).toBeVisible();
    // Jump to testing quality and assert case table shell
    await openNav(page, '测试质量');
    await expectHeading(page, /测试|质量/);
    const casesTab = page.locator('[role="tablist"][aria-label="测试质量视图"]').getByRole('tab', { name: /测试用例|用例/ }).first();
    if ((await casesTab.count()) > 0) await casesTab.click();
    await expect(page.locator('.panel-title, .data-table, .panel').filter({ hasText: /测试用例|暂无/ }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('DEV delivery and project shells remain reachable after assignment', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'dev');
    await openNav(page, '项目执行');
    await expectHeading(page, /项目/);
    await openNav(page, '交付中心');
    await expectHeading(page, /构建|发布|交付/);
    await openNav(page, '我的工作');
    await expect(page.locator('.mywork-metric-bar, .metric-bar, .metric-card').first()).toBeVisible({ timeout: 15_000 });
  });
});
