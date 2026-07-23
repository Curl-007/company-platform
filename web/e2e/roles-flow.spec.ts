import { expect, test, type Page } from '@playwright/test';

/**
 * Expanded multi-role browser smoke:
 * - login each seed role
 * - assert must-see / must-not-see nav
 * - walk ALL capability-primary pages for that role
 * - session switch PM -> QA
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

const MUST_SEE: Record<RoleKey, string[]> = {
  admin: ['工作台', '我的工作', '团队管理', '产品管理', '项目执行', '需求管理', '测试质量', '交付中心', '文档中心', '报表中心', '系统设置'],
  pm: ['工作台', '项目执行', '需求管理', '交付中心', '报表中心', '团队容量', '研发流程'],
  pdm: ['工作台', '产品管理', '需求管理', '文档中心'],
  dev: ['工作台', '项目执行', '文档中心', '我的工作', '交付中心'],
  qa: ['工作台', '测试质量', '文档中心', '我的工作'],
};

const MUST_NOT_SEE: Record<RoleKey, string[]> = {
  admin: [],
  pm: ['系统设置'],
  pdm: ['系统设置', '测试质量', '交付中心'],
  dev: ['系统设置', '产品管理'],
  qa: ['系统设置', '产品管理', '项目执行', '交付中心'],
};

/** [navLabel, heading matcher] — role primary surface tour */
const WALK: Record<RoleKey, Array<[string, RegExp | string]>> = {
  admin: [
    ['工作台', /工作台/],
    ['我的工作', /我的工作/],
    ['团队管理', /团队/],
    ['团队日报', /日报|团队/],
    ['团队容量', /容量/],
    ['动态中心', /动态/],
    ['项目执行', '项目管理'],
    ['需求管理', /需求/],
    ['测试质量', '测试管理'],
    ['交付中心', '构建发布中心'],
    ['文档中心', /文档/],
    ['AI 分析', /AI|分析|助手/],
    ['报表中心', /报表/],
    ['产品管理', '产品管理'],
    ['研发流程', /流程|研发/],
    ['系统设置', /设置|系统/],
  ],
  pm: [
    ['工作台', /工作台/],
    ['项目执行', '项目管理'],
    ['需求管理', /需求/],
    ['测试质量', '测试管理'],
    ['交付中心', '构建发布中心'],
    ['团队容量', /容量/],
    ['团队日报', /日报|团队/],
    ['报表中心', /报表/],
    ['研发流程', /流程|研发/],
    ['文档中心', /文档/],
  ],
  pdm: [
    ['工作台', /工作台/],
    ['产品管理', '产品管理'],
    ['需求管理', /需求/],
    ['项目执行', '项目管理'],
    ['文档中心', /文档/],
    ['动态中心', /动态/],
    ['我的工作', /我的工作/],
  ],
  dev: [
    ['工作台', /工作台/],
    ['我的工作', /我的工作/],
    ['项目执行', '项目管理'],
    ['需求管理', /需求/],
    ['交付中心', '构建发布中心'],
    ['文档中心', /文档/],
    ['动态中心', /动态/],
  ],
  qa: [
    ['工作台', /工作台/],
    ['我的工作', /我的工作/],
    ['测试质量', '测试管理'],
    ['文档中心', /文档/],
    ['动态中心', /动态/],
  ],
};

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

async function logoutIfPossible(page: Page) {
  const logout = page.getByRole('button', { name: /退出|登出|注销/ }).first();
  if (await logout.count()) {
    await logout.click().catch(() => undefined);
  }
  await page.evaluate(() => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.goto('/');
  await expect(page.locator('#login-email')).toBeVisible({ timeout: 15_000 });
}

async function expectHeading(page: Page, heading: RegExp | string) {
  if (typeof heading === 'string') {
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 15_000 });
  } else {
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 15_000 });
  }
}

test.describe('multi-role full-flow UI', () => {
  for (const role of Object.keys(ACCOUNTS) as RoleKey[]) {
    test(`${role} login, must-see and must-not-see nav`, async ({ page }) => {
      await loginAs(page, role);
      await expect(page.locator('.page-title, .page-header').first()).toBeVisible({ timeout: 15_000 });

      for (const label of MUST_SEE[role]) {
        await expect(
          page.locator('.sidebar-nav').getByRole('button', { name: label, exact: true }),
        ).toBeVisible();
      }
      for (const label of MUST_NOT_SEE[role]) {
        await expect(
          page.locator('.sidebar-nav').getByRole('button', { name: label, exact: true }),
        ).toHaveCount(0);
      }
    });

    test(`${role} walk capability pages`, async ({ page }) => {
      test.setTimeout(120_000);
      await loginAs(page, role);
      for (const [nav, heading] of WALK[role]) {
        const navBtn = page.locator('.sidebar-nav').getByRole('button', { name: nav, exact: true });
        // Skip if capability does not expose the page for this seed permission set
        if ((await navBtn.count()) === 0) continue;
        await openNav(page, nav);
        await expectHeading(page, heading);
        await expect(page.locator('.page-header, .panel, .page-title, .card, .metric-card').first()).toBeVisible();
      }
    });
  }

  test('sequential role logins clear session between users', async ({ page }) => {
    await loginAs(page, 'pm');
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: '交付中心', exact: true })).toBeVisible();
    await logoutIfPossible(page);

    await loginAs(page, 'qa');
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: '测试质量', exact: true })).toBeVisible();
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: '系统设置', exact: true })).toHaveCount(0);
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: '交付中心', exact: true })).toHaveCount(0);
  });

  test('admin products page exposes only the three supported tabs', async ({ page }) => {
    await loginAs(page, 'admin');
    await openNav(page, '产品管理');
    await expect(page.getByRole('heading', { name: '产品管理' })).toBeVisible({ timeout: 15_000 });
    for (const tab of ['产品', '项目集', '组合'] as const) {
      await page.locator('.nav-tabs.products-page-tabs, .products-page-tabs, .nav-tabs').getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.locator('.nav-tabs .nav-tab.active')).toContainText(tab);
    }
    await expect(page.locator('.nav-tabs .nav-tab')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '公司目标 / OKR', exact: true })).toHaveCount(0);
  });
});
