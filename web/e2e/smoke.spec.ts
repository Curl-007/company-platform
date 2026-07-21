import { expect, test, type Page } from '@playwright/test';

/**
 * Browser smoke covering the manual checklist:
 * login → projects → products tabs → delivery → documents.
 * Assumes API on :4010 and Vite on :5173 (or Playwright webServer).
 */

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.locator('#login-email').fill('admin@example.com');
  await page.locator('#login-password').fill('Admin@123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: '工作台' })).toBeVisible();
}

async function openNav(page: Page, label: string) {
  await page.locator('.sidebar-nav').getByRole('button', { name: label, exact: true }).click();
}

test.describe('manual checklist automation', () => {
  test('login lands on shell with navigation', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator('.page-title')).toBeVisible({ timeout: 15_000 });
  });

  test('projects list and optional detail open', async ({ page }) => {
    await loginAsAdmin(page);
    await openNav(page, '项目执行');
    await expect(page.getByRole('heading', { name: '项目管理' })).toBeVisible({ timeout: 15_000 });

    // Prefer opening first project card/row if present; otherwise list empty is still a pass for shell load.
    const projectOpen = page.locator('button, a, [role="button"], tr, .card').filter({ hasText: /PRJ-|项目/ }).first();
    if (await projectOpen.count()) {
      await projectOpen.click({ timeout: 5_000 }).catch(() => undefined);
    }
    // Shell either shows list actions or detail back affordance
    await expect(page.locator('.page-title, .page-header, .panel, .data-table, .card').first()).toBeVisible();
  });

  test('products page three tabs switch', async ({ page }) => {
    await loginAsAdmin(page);
    await openNav(page, '产品管理');
    await expect(page.getByRole('heading', { name: '产品管理' })).toBeVisible({ timeout: 15_000 });

    // As-built: 产品 / 项目集 / 组合 only（公司目标入口已从产品页移除；API /api/strategic-goals 仍保留）
    for (const tab of ['产品', '项目集', '组合'] as const) {
      await page.locator('.nav-tabs.products-page-tabs, .products-page-tabs, .nav-tabs').getByRole('button', { name: tab, exact: true }).click();
      await expect(page.locator('.nav-tabs .nav-tab.active')).toContainText(tab);
    }
    await expect(page.locator('.nav-tabs').getByRole('button', { name: '公司目标', exact: true })).toHaveCount(0);
  });

  test('delivery center loads', async ({ page }) => {
    await loginAsAdmin(page);
    await openNav(page, '交付中心');
    // Page title is "构建发布中心" (nav label is 交付中心).
    await expect(page.getByRole('heading', { name: '构建发布中心' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.page-header, .panel, .card, .nav-tabs').first()).toBeVisible();
  });

  test('documents center loads', async ({ page }) => {
    await loginAsAdmin(page);
    await openNav(page, '文档中心');
    await expect(page.getByRole('heading', { name: /文档/ }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('reports center loads', async ({ page }) => {
    await loginAsAdmin(page);
    await openNav(page, '报表中心');
    await expect(page.getByRole('heading', { name: /报表/ }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('bad credentials show error on login', async ({ page }) => {
    await page.goto('/');
    await page.locator('#login-email').fill('admin@example.com');
    await page.locator('#login-password').fill('definitely-wrong');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.locator('.form-error')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.sidebar-nav')).toHaveCount(0);
  });
});
