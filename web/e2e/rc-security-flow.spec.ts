import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * RC security / handoff / products coverage on disposable SQLite.
 *
 * Focus:
 * - login expiry (401 → login shell)
 * - cross-account session switch (no privilege leak)
 * - project membership boundaries (via API in browser origin)
 * - task / defect handoff happy path + outsider deny
 * - products page exposes only the supported three tabs
 */

type RoleKey = 'admin' | 'pm' | 'pdm' | 'dev' | 'qa';

const ACCOUNTS: Record<RoleKey, { email: string; password: string; name: string }> = {
  admin: { email: 'admin@example.com', password: 'Admin@123', name: '系统管理员' },
  pm: { email: 'pm@example.com', password: 'Pm@12345', name: '项目经理' },
  pdm: { email: 'pdm@example.com', password: 'Pdm@12345', name: '产品经理' },
  dev: { email: 'dev@example.com', password: 'Dev@12345', name: '开发工程师' },
  qa: { email: 'qa@example.com', password: 'Qa@12345', name: '测试工程师' },
};

const stamp = Date.now();

function dataOf(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null;
  const body = json as { data?: unknown };
  if (body.data && typeof body.data === 'object') return body.data as Record<string, unknown>;
  return json as Record<string, unknown>;
}

function idOf(json: unknown): string {
  const data = dataOf(json);
  const id = data?.id;
  return typeof id === 'string' ? id : '';
}

function versionOf(entity: Record<string, unknown> | null | undefined): number {
  const v = Number(entity?.version);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

async function loginUi(page: Page, role: RoleKey) {
  const account = ACCOUNTS[role];
  await page.goto('/');
  await page.locator('#login-email').fill(account.email);
  await page.locator('#login-password').fill(account.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.sidebar-nav')).toBeVisible({ timeout: 20_000 });
}

async function logoutUi(page: Page) {
  const logout = page.getByRole('button', { name: /退出|登出|注销/ }).first();
  if ((await logout.count()) > 0) {
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

async function openNav(page: Page, label: string) {
  await page.locator('.sidebar-nav').getByRole('button', { name: label, exact: true }).click();
}

async function apiLogin(request: APIRequestContext, role: RoleKey): Promise<string> {
  const account = ACCOUNTS[role];
  const res = await request.post('/api/auth/login', {
    data: { email: account.email, password: account.password },
  });
  expect(res.ok(), `login ${role} should succeed`).toBeTruthy();
  const json = await res.json();
  const token = String(dataOf(json)?.token || '');
  expect(token.length).toBeGreaterThan(10);
  return token;
}

async function apiJson(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  token: string,
  body?: unknown,
) {
  const res = await request.fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    data: body,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status(), json, data: dataOf(json) };
}

test.describe('RC session expiry and cross-account', () => {
  test('invalid token triggers 401 and returns to login', async ({ page }) => {
    test.setTimeout(90_000);
    await loginUi(page, 'admin');
    await expect(page.locator('.sidebar-nav')).toBeVisible();

    // Module-level token is only re-read from sessionStorage on boot — poison storage
    // then full reload so getMe/auth fetch uses the invalid JWT and 401 path runs.
    await page.evaluate(() => {
      sessionStorage.setItem('pm.token', 'definitely-invalid-token');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator('#login-email')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.sidebar-nav')).toHaveCount(0);

    const leftover = await page.evaluate(() => ({
      token: sessionStorage.getItem('pm.token'),
      user: sessionStorage.getItem('pm.user'),
    }));
    expect(leftover.token).toBeNull();
  });

  test('PM → QA switch does not leak delivery or settings', async ({ page }) => {
    test.setTimeout(90_000);
    await loginUi(page, 'pm');
    const pmNav = page.locator('.sidebar-nav');
    await expect(pmNav.getByRole('button', { name: '交付中心', exact: true })).toBeVisible();
    await expect(pmNav.getByRole('button', { name: '系统设置', exact: true })).toHaveCount(0);

    await logoutUi(page);
    await loginUi(page, 'qa');

    const qaNav = page.locator('.sidebar-nav');
    await expect(qaNav.getByRole('button', { name: '测试质量', exact: true })).toBeVisible();
    await expect(qaNav.getByRole('button', { name: '交付中心', exact: true })).toHaveCount(0);
    await expect(qaNav.getByRole('button', { name: '产品管理', exact: true })).toHaveCount(0);
    await expect(qaNav.getByRole('button', { name: '系统设置', exact: true })).toHaveCount(0);
    await expect(qaNav.getByRole('button', { name: '项目执行', exact: true })).toHaveCount(0);
  });

  test('DEV → PDM switch shows products and hides delivery', async ({ page }) => {
    test.setTimeout(90_000);
    await loginUi(page, 'dev');
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: '项目执行', exact: true })).toBeVisible();
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: '产品管理', exact: true })).toHaveCount(0);

    await logoutUi(page);
    await loginUi(page, 'pdm');
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: '产品管理', exact: true })).toBeVisible();
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: '交付中心', exact: true })).toHaveCount(0);
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: '系统设置', exact: true })).toHaveCount(0);
  });
});

test.describe('RC products three tabs', () => {
  test('admin products tabs are 产品/项目集/组合 only', async ({ page }) => {
    test.setTimeout(90_000);
    await loginUi(page, 'admin');
    await openNav(page, '产品管理');
    await expect(page.getByRole('heading', { name: '产品管理' })).toBeVisible({ timeout: 15_000 });

    for (const tab of ['产品', '项目集', '组合'] as const) {
      await page
        .locator('.nav-tabs.products-page-tabs, .products-page-tabs, .nav-tabs')
        .getByRole('tab', { name: tab, exact: true })
        .click();
      await expect(page.locator('.nav-tabs .nav-tab.active')).toContainText(tab);
      await expect(page.locator('.panel, .card, .data-table, .page-header').first()).toBeVisible();
    }

    await expect(page.locator('.nav-tabs .nav-tab')).toHaveCount(3);
    await expect(page.getByRole('button', { name: '公司目标 / OKR', exact: true })).toHaveCount(0);
  });

  test('pdm can open products tabs without settings', async ({ page }) => {
    test.setTimeout(90_000);
    await loginUi(page, 'pdm');
    await expect(page.locator('.sidebar-nav').getByRole('button', { name: '系统设置', exact: true })).toHaveCount(0);
    await openNav(page, '产品管理');
    await expect(page.getByRole('heading', { name: '产品管理' })).toBeVisible({ timeout: 15_000 });
    for (const tab of ['产品', '项目集', '组合'] as const) {
      await page.locator('.nav-tabs').getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.locator('.nav-tabs .nav-tab.active')).toContainText(tab);
    }
  });
});

test.describe('RC project membership and handoff (API via browser origin)', () => {
  test('task and defect handoff require project member roles', async ({ request }) => {
    test.setTimeout(120_000);

    const pmToken = await apiLogin(request, 'pm');
    const devToken = await apiLogin(request, 'dev');
    const qaToken = await apiLogin(request, 'qa');
    const pdmToken = await apiLogin(request, 'pdm');

    // Create project as PM
    const projectRes = await apiJson(request, 'POST', '/api/projects', pmToken, {
      name: `RC-Handoff-${stamp}`,
      owner: ACCOUNTS.pm.name,
      objective: 'RC disposable handoff coverage',
      description: 'e2e membership + handoff',
    });
    expect(projectRes.status, `create project: ${JSON.stringify(projectRes.json)}`).toBe(201);
    const projectId = idOf(projectRes.json);
    expect(projectId).toMatch(/^PRJ-/);

    // Members: only dev + qa on project (pdm intentionally not added as handoff target role)
    for (const [role, name] of [
      ['dev', ACCOUNTS.dev.name],
      ['qa', ACCOUNTS.qa.name],
    ] as const) {
      const member = await apiJson(request, 'POST', `/api/projects/${encodeURIComponent(projectId)}/members`, pmToken, {
        userName: name,
        role,
      });
      expect([200, 201], `add member ${role}`).toContain(member.status);
    }

    // Task owned by DEV
    const taskRes = await apiJson(request, 'POST', `/api/projects/${encodeURIComponent(projectId)}/wbs/tasks`, pmToken, {
      title: `RC移交任务-${stamp}`,
      type: 'task',
      owner: ACCOUNTS.dev.name,
      assigneeId: 'USR-DEV',
      estimatedHours: 2,
      wbsCode: '1.1',
    });
    expect(taskRes.status, `create task: ${JSON.stringify(taskRes.json)}`).toBe(201);
    const taskId = idOf(taskRes.json);
    expect(taskId).toBeTruthy();

    // Move to in_progress for submit_for_testing
    let task = taskRes.data;
    if (task?.status === 'todo' || task?.status === 'planned' || !task?.status || task?.status === 'backlog') {
      const start = await apiJson(request, 'PATCH', `/api/tasks/${encodeURIComponent(taskId)}/status`, pmToken, {
        status: 'in_progress',
        version: versionOf(task),
      });
      // Some seeds start already in_progress; accept 200 or already-in-state 409 soft
      if (start.status === 200) task = start.data;
      else {
        const got = await apiJson(request, 'GET', `/api/tasks/${encodeURIComponent(taskId)}`, pmToken);
        task = got.data;
      }
    } else {
      const got = await apiJson(request, 'GET', `/api/tasks/${encodeURIComponent(taskId)}`, pmToken);
      task = got.data;
    }
    expect(task?.id || taskId).toBeTruthy();

    // Happy path: DEV → QA
    const submit = await apiJson(request, 'POST', `/api/tasks/${encodeURIComponent(taskId)}/handoff`, devToken, {
      action: 'submit_for_testing',
      version: versionOf(task),
      assignee: ACCOUNTS.qa.name,
      assigneeId: 'USR-QA',
      reason: 'RC e2e submit',
    });
    expect(submit.status, `submit handoff: ${JSON.stringify(submit.json)}`).toBe(200);
    expect(submit.data?.status).toBe('testing');
    expect(submit.data?.owner).toBe(ACCOUNTS.qa.name);

    // Deny: handoff to PDM (active user but not project member with qa/dev role for this action)
    const denyPdm = await apiJson(request, 'POST', `/api/tasks/${encodeURIComponent(taskId)}/handoff`, qaToken, {
      action: 'return_for_fix',
      version: versionOf(submit.data),
      assignee: ACCOUNTS.pdm.name,
      assigneeId: 'USR-PDM',
      reason: 'should fail — not project dev member',
    });
    expect(denyPdm.status, `deny PDM target: ${JSON.stringify(denyPdm.json)}`).toBe(400);
    const denyMsg = String((denyPdm.json as { message?: string })?.message || '');
    expect(denyMsg.length).toBeGreaterThan(0);

    // Happy path: QA → DEV
    const ret = await apiJson(request, 'POST', `/api/tasks/${encodeURIComponent(taskId)}/handoff`, qaToken, {
      action: 'return_for_fix',
      version: versionOf(submit.data),
      assignee: ACCOUNTS.dev.name,
      assigneeId: 'USR-DEV',
      reason: 'RC e2e return',
    });
    expect(ret.status, `return handoff: ${JSON.stringify(ret.json)}`).toBe(200);
    expect(ret.data?.status).toBe('in_progress');
    expect(ret.data?.owner).toBe(ACCOUNTS.dev.name);

    // Defect handoff: QA create → assign_to_dev → assign_to_qa
    const bugRes = await apiJson(request, 'POST', '/api/defects', qaToken, {
      title: `RC移交缺陷-${stamp}`,
      projectId,
      severity: 'medium',
      assignee: ACCOUNTS.qa.name,
      assigneeRole: 'qa',
    });
    expect(bugRes.status, `create defect: ${JSON.stringify(bugRes.json)}`).toBe(201);
    const bugId = idOf(bugRes.json);
    expect(bugId).toBeTruthy();

    const toDev = await apiJson(request, 'POST', `/api/defects/${encodeURIComponent(bugId)}/handoff`, qaToken, {
      action: 'assign_to_dev',
      assignee: ACCOUNTS.dev.name,
      assigneeId: 'USR-DEV',
      version: versionOf(bugRes.data),
    });
    expect(toDev.status, `defect to dev: ${JSON.stringify(toDev.json)}`).toBe(200);
    expect(toDev.data?.assignee).toBe(ACCOUNTS.dev.name);
    expect(toDev.data?.assigneeRole).toBe('dev');

    // Outsider (PDM not project member) as handoff target must fail
    const outsider = await apiJson(request, 'POST', `/api/defects/${encodeURIComponent(bugId)}/handoff`, devToken, {
      action: 'assign_to_qa',
      assignee: ACCOUNTS.pdm.name,
      version: versionOf(toDev.data),
    });
    expect(outsider.status, `defect outsider: ${JSON.stringify(outsider.json)}`).toBe(400);

    const toQa = await apiJson(request, 'POST', `/api/defects/${encodeURIComponent(bugId)}/handoff`, devToken, {
      action: 'assign_to_qa',
      assignee: ACCOUNTS.qa.name,
      assigneeId: 'USR-QA',
      version: versionOf(toDev.data),
    });
    expect(toQa.status, `defect to qa: ${JSON.stringify(toQa.json)}`).toBe(200);
    expect(toQa.data?.assignee).toBe(ACCOUNTS.qa.name);
    expect(toQa.data?.assigneeRole).toBe('qa');

    // Free-form status on defect handoff rejected
    const freeStatus = await apiJson(request, 'POST', `/api/defects/${encodeURIComponent(bugId)}/handoff`, qaToken, {
      action: 'assign_to_dev',
      assignee: ACCOUNTS.dev.name,
      version: versionOf(toQa.data),
      status: 'closed',
    });
    expect(freeStatus.status).toBe(400);

    // PDM token alone: can login but cannot create project (permission boundary)
    const pdmProject = await apiJson(request, 'POST', '/api/projects', pdmToken, {
      name: `PDM-Denied-${stamp}`,
      owner: ACCOUNTS.pdm.name,
    });
    expect(pdmProject.status).toBe(403);
  });

  test('mywork shells for DEV/QA remain reachable after API handoff setup', async ({ page, request }) => {
    test.setTimeout(120_000);

    // Ensure at least one project member assignment exists for UI shells (idempotent add if project exists from prior test is fine;
    // create a small private project so empty disposable DB still has mywork shells).
    const pmToken = await apiLogin(request, 'pm');
    const projectRes = await apiJson(request, 'POST', '/api/projects', pmToken, {
      name: `RC-MyWork-${stamp}`,
      owner: ACCOUNTS.pm.name,
      objective: 'RC mywork shells',
    });
    const projectId = idOf(projectRes.json);
    if (projectId) {
      for (const [role, name] of [
        ['dev', ACCOUNTS.dev.name],
        ['qa', ACCOUNTS.qa.name],
      ] as const) {
        await apiJson(request, 'POST', `/api/projects/${encodeURIComponent(projectId)}/members`, pmToken, {
          userName: name,
          role,
        });
      }
      await apiJson(request, 'POST', `/api/projects/${encodeURIComponent(projectId)}/wbs/tasks`, pmToken, {
        title: `RC-MyWork-Task-${stamp}`,
        type: 'task',
        owner: ACCOUNTS.dev.name,
        assigneeId: 'USR-DEV',
        estimatedHours: 1,
        wbsCode: '2.1',
      });
    }

    await loginUi(page, 'dev');
    await openNav(page, '我的工作');
    await expect(page.getByRole('heading', { name: /我的工作/ })).toBeVisible({ timeout: 15_000 });
    const tabBar = page.locator('.mywork-tab-bar, .tab-bar.mywork-tab-bar, .tab-bar');
    await expect(tabBar).toBeVisible({ timeout: 20_000 });
    for (const tab of ['我的任务', '我的缺陷', '我的需求'] as const) {
      await tabBar.getByRole('button', { name: tab, exact: true }).click();
      await expect(tabBar.locator('.tab-item.active').first()).toContainText(tab);
    }

    await logoutUi(page);
    await loginUi(page, 'qa');
    await openNav(page, '我的工作');
    await expect(page.getByRole('heading', { name: /我的工作/ })).toBeVisible({ timeout: 15_000 });
    await tabBar.getByRole('button', { name: '我的缺陷', exact: true }).click();
    await expect(page.locator('.panel, .mywork-panels, .card').first()).toBeVisible();
  });
});
