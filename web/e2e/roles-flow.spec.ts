import { expect, test, type Page } from '@playwright/test';

/**
 * Multi-role browser smoke:
 * - login each seed role
 * - assert shell + expected nav labels
 * - walk role-specific primary pages
 *
 * Seed accounts (api/db.js bootstrap):
 *   admin@example.com / Admin@123
 *   pm@example.com    / Pm@12345
 *   pdm@example.com   / Pdm@12345
 *   dev@example.com   / Dev@12345
 *   qa@example.com    / Qa@12345
 */

type RoleKey = 'admin' | 'pm' | 'pdm' | 'dev' | 'qa';

const ACCOUNTS: Record<RoleKey, { email: string; password: string; label: string }> = {
  admin: { email: 'admin@example.com', password: 'Admin@123', label: '管理员' },
  pm: { email: 'pm@example.com', password: 'Pm@12345', label: '项目经理' },
  pdm: { email: 'pdm@example.com', password: 'Pdm@12345', label: '产品经理' },
  dev: { email: 'dev@example.com', password: 'Dev@12345', label: '开发' },
  qa: { email: 'qa@example.com', password: 'Qa@12345', label: '测试' },
};

/** Nav labels that must be visible for each role (subset; server capabilities may add more for admin). */
const MUST_SEE: Record<RoleKey, string[]> = {
  admin: ['工作台', '产品管理', '项目执行', '系统设置'],
  pm: ['工作台', '项目执行', '需求管理', '交付中心'],
  pdm: ['工作台', '产品管理', '需求管理', '文档中心'],
  dev: ['工作台', '项目执行', '文档中心', '我的工作'],
  qa: ['工作台', '测试质量', '文档中心', '我的工作'],
};

/** Pages to open after login for each role: [navLabel, heading matcher] */
const WALK: Record<RoleKey, Array<[string, RegExp | string]>> = {
  admin: [
    ['工作台', /工作台/],
    ['产品管理', '产品管理'],
    ['项目执行', '项目管理'],
    ['系统设置', /设置|系统/],
  ],
  pm: [
    ['工作台', /工作台/],
    ['项目执行', '项目管理'],
    ['需求管理', /需求/],
    ['交付中心', '构建发布中心'],
  ],
  pdm: [
    ['工作台', /工作台/],
    ['产品管理', '产品管理'],
    ['需求管理', /需求/],
    ['文档中心', /文档/],
  ],
  dev: [
    ['工作台', /工作台/],
    ['项目执行', '项目管理'],
    ['我的工作', /我的工作/],
    ['文档中心', /文档/],
  ],
  qa: [
    ['工作台', /工作台/],
    ['测试质量', '测试管理'],
    ['我的工作', /我的工作/],
    ['文档中心', /文档/],
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
  // Prefer profile/logout UI if present; otherwise clear storage and go login.
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

test.describe('multi-role full-flow UI', () => {
  for (const role of Object.keys(ACCOUNTS) as RoleKey[]) {
    test(`${role} login and nav shell`, async ({ page }) => {
      await loginAs(page, role);
      await expect(page.locator('.page-title, .page-header').first()).toBeVisible({ timeout: 15_000 });

      for (const label of MUST_SEE[role]) {
        await expect(
          page.locator('.sidebar-nav').getByRole('button', { name: label, exact: true }),
        ).toBeVisible();
      }

      // QA should not see system settings
      if (role === 'qa') {
        await expect(
          page.locator('.sidebar-nav').getByRole('button', { name: '系统设置', exact: true }),
        ).toHaveCount(0);
      }
    });

    test(`${role} walk primary pages`, async ({ page }) => {
      await loginAs(page, role);
      for (const [nav, heading] of WALK[role]) {
        await openNav(page, nav);
        if (typeof heading === 'string') {
          await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
            timeout: 15_000,
          });
        } else {
          await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
            timeout: 15_000,
          });
        }
        await expect(page.locator('.page-header, .panel, .page-title, .card').first()).toBeVisible();
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
  });
});
