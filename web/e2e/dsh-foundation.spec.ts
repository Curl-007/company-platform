import { expect, test, type Page } from '@playwright/test';

const ADMIN = { email: 'admin@example.com', password: 'Admin@123' };

const ZH_NAV = [
  '工作台', '我的工作', '团队管理', '团队日报', '团队容量', '动态中心',
  '项目执行', '需求管理', '测试质量', '交付中心', '文档中心', 'AI 分析',
  'DSH 界面', '报表中心', '产品管理', '研发流程', '系统设置',
] as const;

const EN_NAV = [
  'Dashboard', 'My Work', 'Team', 'Team Logs', 'Capacity', 'Activity',
  'Projects', 'Requirements', 'Testing', 'Delivery', 'Documents', 'AI Analysis',
  'DSH UI', 'Reports', 'Products', 'Workflow', 'Settings',
] as const;

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.locator('#login-email').fill(ADMIN.email);
  await page.locator('#login-password').fill(ADMIN.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 20_000 });
}

async function emitDirective(page: Page, directive: unknown): Promise<number> {
  const result = await page.evaluate(async (candidate) => {
    const token = sessionStorage.getItem('pm.token');
    const response = await fetch('/api/ai/ui-directives', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ directive: candidate }),
    });
    const payload = await response.json();
    return { delivered: Number(payload?.data?.delivered ?? 0), status: response.status };
  }, directive);
  expect(result.status).toBe(200);
  return result.delivered;
}

async function emitWhenSubscribed(page: Page, directive: unknown) {
  await expect.poll(() => emitDirective(page, directive), {
    timeout: 15_000,
    intervals: [200, 400, 800, 1_000],
  }).toBeGreaterThan(0);
}

test.describe('DSH frontend foundation', () => {
  test('all admin navigation labels switch between Chinese and English', async ({ page }) => {
    await loginAsAdmin(page);
    const nav = page.locator('.sidebar-nav');
    for (const label of ZH_NAV) {
      await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    await page.locator('.kaneo-sidebar-lang-btn').filter({ hasText: 'EN' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', /^en/i);
    for (const label of EN_NAV) {
      await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  });

  test('AI analysis survives a hard refresh without manual retry', async ({ page }) => {
    await loginAsAdmin(page);
    await page.locator('.sidebar-nav').getByRole('button', { name: 'AI 分析', exact: true }).click();
    await expect(page.locator('.ai-chat-page')).toBeVisible({ timeout: 45_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.ai-chat-page')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('.page-state-retry')).toHaveCount(0);
  });

  test('DSH creates, opens and restores a declarative view through the live UI channel', async ({ page }) => {
    await loginAsAdmin(page);
    const view = {
      id: 'e2e-risk-room',
      title: 'E2E 风险驾驶舱',
      description: '由 DSH 声明创建',
      blocks: [
        { id: 'high-risk', type: 'stat', label: '高风险项目', value: 3, tone: 'negative' },
        { id: 'delivery', type: 'progress', label: '交付进度', value: 68 },
      ],
    };

    await emitWhenSubscribed(page, { kind: 'viewUpsert', view });
    await emitWhenSubscribed(page, { kind: 'viewOpen', viewId: view.id });
    await expect(page).toHaveURL(/#\/dsh-ui/);
    await expect(page.getByRole('heading', { name: 'E2E 风险驾驶舱', exact: true })).toBeVisible();
    await expect(page.getByText('高风险项目', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '68');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'E2E 风险驾驶舱', exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test('DSH page style applies immediately and survives refresh', async ({ page }) => {
    await loginAsAdmin(page);
    const directive = {
      kind: 'surfaceStyle',
      surface: 'dashboard',
      style: { variant: 'contrast', columns: 2, gap: 20 },
    };
    await emitWhenSubscribed(page, directive);

    const surface = page.locator('[data-layout-surface="dashboard"]');
    await expect(surface).toHaveAttribute('data-dsh-surface-variant', 'contrast');
    await expect(surface).toHaveCSS('box-shadow', /rgb/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(surface).toHaveAttribute('data-dsh-surface-variant', 'contrast', { timeout: 20_000 });
  });

  test('detail section move persists after refresh', async ({ page }) => {
    await loginAsAdmin(page);
    const projectId = await page.evaluate(async () => {
      const token = sessionStorage.getItem('pm.token');
      const headers = { Authorization: `Bearer ${token}` };
      const response = await fetch('/api/projects', { headers });
      const payload = await response.json();
      const projects = Array.isArray(payload?.data?.items)
        ? payload.data.items
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      if (projects[0]?.id) return String(projects[0].id);

      const createResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `DSH E2E Project ${Date.now()}`,
          owner: '系统管理员',
          objective: 'Verify DSH-managed detail layout persistence',
        }),
      });
      const created = await createResponse.json();
      if (createResponse.status !== 201) {
        throw new Error(`Could not create DSH E2E project: ${createResponse.status}`);
      }
      return String(created?.data?.id ?? '');
    });
    expect(projectId).not.toBe('');

    await emitWhenSubscribed(page, { kind: 'navigate', page: 'projects', focus: projectId });
    await expect(page).toHaveURL(new RegExp(`#\\/projects\\?focus=${projectId}$`));
    const surface = page.locator('[data-layout-surface="projects.detail"]');
    await expect(surface).toBeVisible({ timeout: 20_000 });
    const sections = surface.locator(':scope > [data-layout-section-id]');
    const original = await sections.evaluateAll((items) => items.map((item) => item.getAttribute('data-layout-section-id')));
    expect(original.length).toBeGreaterThan(1);

    await surface.getByRole('button', { name: '调整区块布局' }).click();
    await sections.first().locator('.sortable-section-move').nth(1).click();
    await expect.poll(async () => (await sections.first().getAttribute('data-layout-section-id'))).toBe(original[1]);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(surface).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await sections.first().getAttribute('data-layout-section-id'))).toBe(original[1]);
  });
});
