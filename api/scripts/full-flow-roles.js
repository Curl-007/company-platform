/**
 * Expanded multi-role full-flow operational smoke against a running API.
 *
 * Seed accounts (bootstrap, non-production empty DB):
 *   admin@example.com / Admin@123
 *   pm@example.com    / Pm@12345
 *   pdm@example.com   / Pdm@12345
 *   dev@example.com   / Dev@12345
 *   qa@example.com    / Qa@12345
 *
 * Covers:
 *   login + capabilities + denials
 *   product / project / members / sprint / wbs task
 *   requirement status
 *   test-case + test-run + defect status
 *   build status + release
 *   work-log + time-entry (dev)
 *   team / audit / flow / reports / capacity reads
 *   role read-backs
 *
 * Usage: npm run smoke:roles
 *        node api/scripts/full-flow-roles.js
 */

const BASE = process.env.SMOKE_API_BASE || "http://127.0.0.1:4010";
const stamp = Date.now();
const today = new Date().toISOString().slice(0, 10);
const results = [];

const ACCOUNTS = {
  admin: { email: "admin@example.com", password: "Admin@123", role: "admin", name: "系统管理员" },
  pm: { email: "pm@example.com", password: "Pm@12345", role: "pm", name: "项目经理" },
  pdm: { email: "pdm@example.com", password: "Pdm@12345", role: "pdm", name: "产品经理" },
  dev: { email: "dev@example.com", password: "Dev@12345", role: "dev", name: "开发工程师" },
  qa: { email: "qa@example.com", password: "Qa@12345", role: "qa", name: "测试工程师" },
};

const EXPECTED_PAGES = {
  admin: ["dashboard", "settings", "projects", "products", "team", "capacity", "ai", "flow"],
  pm: ["dashboard", "projects", "requirements", "delivery", "reports", "team", "capacity", "flow"],
  pdm: ["dashboard", "products", "requirements", "documents"],
  dev: ["dashboard", "projects", "documents", "delivery", "mywork"],
  qa: ["dashboard", "testing", "documents", "mywork"],
};

const FORBIDDEN_PAGES = {
  qa: ["settings", "products", "capacity"],
  pdm: ["settings", "testing"],
  dev: ["settings", "products"],
};

function record(name, ok, detail) {
  results.push({ name, ok, detail: String(detail || "").slice(0, 500) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + String(detail).slice(0, 260) : ""}`);
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

function itemsOf(json) {
  if (Array.isArray(json?.data?.items)) return json.data.items;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

function idOf(json) {
  return json?.data?.id || null;
}

async function login(account) {
  const { status, json } = await req("POST", "/api/auth/login", {
    body: { email: account.email, password: account.password },
  });
  const token = json?.data?.token || null;
  const user = json?.data?.user || null;
  record(
    `login ${account.role}`,
    status === 200 && Boolean(token) && user?.role === account.role,
    `status=${status} role=${user?.role || "?"} name=${user?.name || "?"}`,
  );
  return { token, user, status, json };
}

async function capabilities(role, token) {
  const { status, json } = await req("GET", "/api/auth/capabilities", { token });
  const pages = json?.data?.pages || [];
  const ops = json?.data?.operations || [];
  const perms = json?.data?.permissions || [];
  record(
    `capabilities ${role}`,
    status === 200 && Array.isArray(pages),
    `status=${status} pages=${pages.length} ops=${ops.length}`,
  );
  return { pages, ops, perms };
}

function printSummary() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log("\n========== FULL-FLOW ROLES SUMMARY ==========");
  console.log(`PASS ${pass}  FAIL ${fail}  TOTAL ${results.length}`);
  if (fail) {
    console.log("Failed:");
    results.filter((r) => !r.ok).forEach((r) => console.log(` - ${r.name}: ${r.detail}`));
  }
  return fail;
}

async function expectStatus(name, promise, okStatuses, detailFn) {
  const { status, json } = await promise;
  const okList = Array.isArray(okStatuses) ? okStatuses : [okStatuses];
  const ok = okList.includes(status);
  const extra = detailFn ? detailFn(json, status) : `status=${status} code=${json?.errorCode || ""} msg=${json?.message || ""}`;
  record(name, ok, extra);
  return { status, json, ok };
}

async function main() {
  {
    const { status, json } = await req("GET", "/api/health");
    record("GET /api/health", status === 200 && json?.data?.status === "ok", `status=${status}`);
    if (status !== 200) process.exit(printSummary() ? 1 : 0);
  }

  const sessions = {};
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    sessions[key] = await login(account);
  }

  for (const [key, hints] of Object.entries(EXPECTED_PAGES)) {
    const token = sessions[key]?.token;
    if (!token) {
      record(`role pages ${key}`, false, "no token");
      continue;
    }
    const { pages } = await capabilities(key, token);
    const missing = hints.filter((p) => !pages.includes(p));
    const forbiddenHit = (FORBIDDEN_PAGES[key] || []).filter((p) => pages.includes(p));
    record(
      `role pages ${key}`,
      missing.length === 0 && forbiddenHit.length === 0,
      missing.length || forbiddenHit.length
        ? `missing=${missing.join(",") || "-"} forbiddenSeen=${forbiddenHit.join(",") || "-"}`
        : `ok pages=${pages.length}`,
    );
  }

  // Denials
  if (sessions.qa?.token) {
    await expectStatus(
      "deny QA create project",
      req("POST", "/api/projects", {
        token: sessions.qa.token,
        body: { name: `QA-Denied-${stamp}`, owner: ACCOUNTS.qa.name, objective: "should fail" },
      }),
      403,
    );
    await expectStatus(
      "deny QA create product",
      req("POST", "/api/products", {
        token: sessions.qa.token,
        body: { name: `QA-Prod-Denied-${stamp}`, owner: ACCOUNTS.qa.name },
      }),
      403,
    );
  }
  if (sessions.dev?.token) {
    await expectStatus(
      "deny DEV open settings-ish users list",
      req("GET", "/api/users", { token: sessions.dev.token }),
      403,
    );
  }
  if (sessions.pdm?.token) {
    await expectStatus(
      "deny PDM create build",
      req("POST", "/api/builds", {
        token: sessions.pdm.token,
        body: { projectId: "PRJ-NONE", name: "nope" },
      }),
      [403, 404],
    );
  }

  let projectId = null;
  let productId = null;
  let requirementId = null;
  let sprintId = null;
  let taskId = null;
  let testCaseId = null;
  let defectId = null;
  let buildId = null;
  let releaseId = null;
  let docId = null;
  let workLogId = null;
  let timeEntryId = null;

  // PM project
  if (sessions.pm?.token) {
    const created = await expectStatus(
      "PM create project",
      req("POST", "/api/projects", {
        token: sessions.pm.token,
        body: {
          name: `全流程项目-${stamp}`,
          owner: ACCOUNTS.pm.name,
          objective: "多角色扩展全流程演练",
          description: "full-flow-roles expanded",
          startDate: "2026-07-01",
          endDate: "2026-12-31",
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    projectId = idOf(created.json);
  }

  // PM members
  if (sessions.pm?.token && projectId) {
    for (const [role, name] of [
      ["pdm", ACCOUNTS.pdm.name],
      ["dev", ACCOUNTS.dev.name],
      ["qa", ACCOUNTS.qa.name],
    ]) {
      await expectStatus(
        `PM add member ${role}`,
        req("POST", `/api/projects/${encodeURIComponent(projectId)}/members`, {
          token: sessions.pm.token,
          body: { userName: name, role },
        }),
        [200, 201],
      );
    }
  }

  // PM sprint + WBS task
  if (sessions.pm?.token && projectId) {
    const sprint = await expectStatus(
      "PM create sprint",
      req("POST", `/api/projects/${encodeURIComponent(projectId)}/sprints`, {
        token: sessions.pm.token,
        body: {
          name: `Sprint-${stamp}`,
          goal: "full flow sprint",
          startDate: "2026-07-22",
          endDate: "2026-08-05",
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    sprintId = idOf(sprint.json);

    const task = await expectStatus(
      "PM create WBS task",
      req("POST", `/api/projects/${encodeURIComponent(projectId)}/wbs/tasks`, {
        token: sessions.pm.token,
        body: {
          title: `全流程任务-${stamp}`,
          type: "task",
          owner: ACCOUNTS.dev.name,
          assigneeId: sessions.dev?.user?.id,
          estimatedHours: 8,
          sprintId: sprintId || undefined,
          wbsCode: "1.1",
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    taskId = idOf(task.json);

    if (taskId) {
      // status transition — try common first hop todo -> in_progress (may be kanban label)
      const st = await req("PATCH", `/api/tasks/${encodeURIComponent(taskId)}/status`, {
        token: sessions.pm.token,
        body: { status: "in_progress" },
      });
      record(
        "PM patch task status in_progress",
        st.status === 200 || st.status === 409 || st.status === 400,
        `status=${st.status} code=${st.json?.errorCode || ""} (400/409 ok if transition constrained)`,
      );
    }
  }

  // PDM product + requirement
  if (sessions.pdm?.token) {
    const product = await expectStatus(
      "PDM create product",
      req("POST", "/api/products", {
        token: sessions.pdm.token,
        body: {
          name: `全流程产品-${stamp}`,
          owner: ACCOUNTS.pdm.name,
          version: "0.1.0",
          stage: "planning",
          description: "full-flow product",
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    productId = idOf(product.json);
  }

  if (sessions.pdm?.token && projectId) {
    const reqCreated = await expectStatus(
      "PDM create requirement",
      req("POST", "/api/requirements", {
        token: sessions.pdm.token,
        body: {
          title: `全流程需求-${stamp}`,
          projectId,
          owner: ACCOUNTS.pdm.name,
          priority: "high",
          description: "multi-role expanded requirement",
          productId: productId || undefined,
          assignee: ACCOUNTS.dev.name,
          assigneeRole: "dev",
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    requirementId = idOf(reqCreated.json);

    if (requirementId) {
      const st = await req("PATCH", `/api/requirements/${encodeURIComponent(requirementId)}/status`, {
        token: sessions.pdm.token,
        body: { status: "in_progress" },
      });
      record(
        "PDM patch requirement status",
        st.status === 200 || st.status === 400 || st.status === 409,
        `status=${st.status} code=${st.json?.errorCode || ""}`,
      );
    }
  }

  // QA test case + run + defect lifecycle
  if (sessions.qa?.token && projectId) {
    const tc = await expectStatus(
      "QA create test-case",
      req("POST", "/api/test-cases", {
        token: sessions.qa.token,
        body: {
          title: `全流程用例-${stamp}`,
          projectId,
          requirementId: requirementId || undefined,
          description: "happy path",
          steps: ["打开", "操作", "断言"],
          expectedResult: "通过",
          owner: ACCOUNTS.qa.name,
          assigneeRole: "qa",
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    testCaseId = idOf(tc.json);

    if (testCaseId) {
      await expectStatus(
        "QA create test-run passed",
        req("POST", "/api/test-runs", {
          token: sessions.qa.token,
          body: { testCaseId, result: "passed", notes: "full-flow auto" },
        }),
        201,
      );
      const runs = await req("GET", `/api/test-cases/${encodeURIComponent(testCaseId)}/runs`, {
        token: sessions.qa.token,
      });
      const runItems = itemsOf(runs.json);
      record("QA list test-case runs", runs.status === 200 && runItems.length >= 1, `status=${runs.status} n=${runItems.length}`);
    }

    const bug = await expectStatus(
      "QA create defect",
      req("POST", "/api/defects", {
        token: sessions.qa.token,
        body: {
          title: `全流程缺陷-${stamp}`,
          projectId,
          requirementId: requirementId || undefined,
          severity: "high",
          assignee: ACCOUNTS.dev.name,
          assigneeRole: "dev",
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    defectId = idOf(bug.json);

    if (defectId) {
      const st = await req("PATCH", `/api/defects/${encodeURIComponent(defectId)}/status`, {
        token: sessions.qa.token,
        body: { status: "confirmed" },
      });
      record("QA patch defect status confirmed", st.status === 200, `status=${st.status} code=${st.json?.errorCode || ""}`);
    }
  }

  // DEV build + status + work log + time entry
  if (sessions.dev?.token && projectId) {
    const build = await expectStatus(
      "DEV create build",
      req("POST", "/api/builds", {
        token: sessions.dev.token,
        body: {
          projectId,
          name: `全流程构建-${stamp}`,
          version: "1.0.0-flow",
          notes: "multi-role expanded build",
          linkedStories: requirementId ? [requirementId] : [],
          linkedBugs: defectId ? [defectId] : [],
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    buildId = idOf(build.json);

    if (buildId) {
      const st = await req("PATCH", `/api/builds/${encodeURIComponent(buildId)}/status`, {
        token: sessions.dev.token,
        body: { status: "testing" },
      });
      record(
        "DEV patch build status testing",
        st.status === 200 || st.status === 400,
        `status=${st.status} code=${st.json?.errorCode || ""}`,
      );
    }

    const log = await expectStatus(
      "DEV create work-log",
      req("POST", "/api/work-logs", {
        token: sessions.dev.token,
        body: {
          content: `全流程日报 ${stamp}：完成构建与联调。`,
          projectId,
          logDate: today,
          blockers: "无",
          nextPlan: "配合测试与发布",
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || json?.data?.id || "?"}`,
    );
    workLogId = idOf(log.json) || log.json?.data?.id || null;

    const te = await expectStatus(
      "DEV create time-entry",
      req("POST", "/api/time-entries", {
        token: sessions.dev.token,
        body: {
          projectId,
          taskId: taskId || undefined,
          workDate: today,
          hours: 2.5,
          category: "delivery",
          workNature: "planned",
          note: "full-flow coding",
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    timeEntryId = idOf(te.json);

    // Admin cannot submit daily log (role restriction)
  }

  if (sessions.admin?.token) {
    const denyLog = await req("POST", "/api/work-logs", {
      token: sessions.admin.token,
      body: { content: "admin should not submit daily log", logDate: today },
    });
    record("deny ADMIN create work-log", denyLog.status === 403, `status=${denyLog.status} code=${denyLog.json?.errorCode || ""}`);
  }

  // PM release from build
  if (sessions.pm?.token && buildId) {
    const rel = await expectStatus(
      "PM create release",
      req("POST", "/api/releases", {
        token: sessions.pm.token,
        body: {
          name: `全流程发布-${stamp}`,
          version: "1.0.0",
          buildId,
          productId: productId || undefined,
          releaseType: "official",
          releaseNotes: "expanded full flow release",
          linkedStories: requirementId ? [requirementId] : [],
          linkedBugs: defectId ? [defectId] : [],
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    releaseId = idOf(rel.json);

    if (releaseId) {
      const gates = await req("GET", "/api/delivery/gates", { token: sessions.pm.token });
      record("PM list delivery gates", gates.status === 200, `status=${gates.status}`);
      const report = await req("GET", `/api/releases/${encodeURIComponent(releaseId)}/report`, {
        token: sessions.pm.token,
      });
      record(
        "PM get release report",
        report.status === 200 || report.status === 404,
        `status=${report.status}`,
      );
    }
  }

  // Admin document + team/org reads + audit + flow + reports
  if (sessions.admin?.token) {
    const content = Buffer.from(`# full-flow ${stamp}\nexpanded role flow`).toString("base64");
    const doc = await expectStatus(
      "ADMIN create document",
      req("POST", "/api/documents", {
        token: sessions.admin.token,
        body: {
          title: `全流程文档-${stamp}`,
          type: "note",
          owner: ACCOUNTS.admin.name,
          fileName: "full-flow.md",
          fileType: "text/markdown",
          contentBase64: `data:text/markdown;base64,${content}`,
          projectId: projectId || undefined,
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    docId = idOf(doc.json);

    await expectStatus("ADMIN list team members", req("GET", "/api/team/members", { token: sessions.admin.token }), 200);
    await expectStatus("ADMIN list org departments", req("GET", "/api/org/departments", { token: sessions.admin.token }), 200);
    await expectStatus("ADMIN list users", req("GET", "/api/users", { token: sessions.admin.token }), 200);
    await expectStatus("ADMIN list audit-logs", req("GET", "/api/audit-logs?limit=20", { token: sessions.admin.token }), 200);
    await expectStatus("ADMIN list flow templates", req("GET", "/api/flow/templates", { token: sessions.admin.token }), 200);
    await expectStatus("ADMIN flow overview", req("GET", "/api/flow/overview", { token: sessions.admin.token }), 200);
    await expectStatus("ADMIN reports summary", req("GET", "/api/reports/summary", { token: sessions.admin.token }), 200);
    await expectStatus("ADMIN capacity overview", req("GET", "/api/capacity/overview", { token: sessions.admin.token }), 200);
    await expectStatus("ADMIN meta enums", req("GET", "/api/meta/enums", { token: sessions.admin.token }), 200);
  }

  // Role-specific reads
  if (projectId) {
    for (const key of ["pm", "pdm", "dev", "qa", "admin"]) {
      const token = sessions[key]?.token;
      if (!token) continue;
      const one = await req("GET", `/api/projects/${encodeURIComponent(projectId)}`, { token });
      if (one.status === 200 && (one.json?.data?.id === projectId || one.json?.data?.name)) {
        record(`read project as ${key}`, true, `status=${one.status}`);
      } else {
        const list = await req("GET", "/api/projects", { token });
        const found = itemsOf(list.json).some((p) => p.id === projectId);
        record(`read project as ${key}`, list.status === 200 && found, `get=${one.status} listFound=${found}`);
      }
    }

    if (sessions.pm?.token) {
      await expectStatus(
        "PM project flow",
        req("GET", `/api/projects/${encodeURIComponent(projectId)}/flow`, { token: sessions.pm.token }),
        200,
      );
      await expectStatus(
        "PM project members",
        req("GET", `/api/projects/${encodeURIComponent(projectId)}/members`, { token: sessions.pm.token }),
        200,
      );
      await expectStatus(
        "PM project tasks",
        req("GET", `/api/projects/${encodeURIComponent(projectId)}/tasks`, { token: sessions.pm.token }),
        200,
      );
      await expectStatus(
        "PM project kanban",
        req("GET", `/api/projects/${encodeURIComponent(projectId)}/kanban`, { token: sessions.pm.token }),
        200,
      );
    }
  }

  if (requirementId && sessions.dev?.token) {
    const list = await req("GET", "/api/requirements", { token: sessions.dev.token });
    const found = itemsOf(list.json).some((r) => r.id === requirementId);
    record("DEV list requirements contains created", list.status === 200 && found, `status=${list.status} found=${found}`);
  }
  if (testCaseId && sessions.qa?.token) {
    const list = await req("GET", "/api/test-cases", { token: sessions.qa.token });
    const found = itemsOf(list.json).some((t) => t.id === testCaseId);
    record("QA list test-cases contains created", list.status === 200 && found, `status=${list.status} found=${found}`);
  }
  if (buildId && sessions.dev?.token) {
    const list = await req("GET", "/api/builds", { token: sessions.dev.token });
    const found = itemsOf(list.json).some((b) => b.id === buildId);
    record("DEV list builds contains created", list.status === 200 && found, `status=${list.status} found=${found}`);
  }
  if (releaseId && sessions.pm?.token) {
    const list = await req("GET", "/api/releases", { token: sessions.pm.token });
    const found = itemsOf(list.json).some((r) => r.id === releaseId);
    record("PM list releases contains created", list.status === 200 && found, `status=${list.status} found=${found}`);
  }
  if (sessions.dev?.token) {
    await expectStatus("DEV capacity me", req("GET", "/api/capacity/me", { token: sessions.dev.token }), 200);
    await expectStatus("DEV time-entries list", req("GET", "/api/time-entries", { token: sessions.dev.token }), 200);
    await expectStatus("DEV work-logs weekly-summary", req("GET", "/api/work-logs/weekly-summary", { token: sessions.dev.token }), 200);
  }
  if (sessions.pm?.token) {
    await expectStatus("PM team weekly summary", req("GET", "/api/work-logs/team-weekly-summary", { token: sessions.pm.token }), [200, 403]);
    await expectStatus("PM team work-logs", req("GET", "/api/work-logs/team", { token: sessions.pm.token }), [200, 403]);
  }
  if (sessions.qa?.token) {
    await expectStatus("QA defects list", req("GET", "/api/defects", { token: sessions.qa.token }), 200);
    await expectStatus("QA test-plans", req("GET", "/api/test-plans", { token: sessions.qa.token }), 200);
  }
  if (sessions.pdm?.token) {
    await expectStatus("PDM products list", req("GET", "/api/products", { token: sessions.pdm.token }), 200);
    await expectStatus("PDM programs list", req("GET", "/api/programs", { token: sessions.pdm.token }), [200, 403]);
    await expectStatus("PDM portfolios list", req("GET", "/api/portfolios", { token: sessions.pdm.token }), [200, 403]);
  }

  for (const key of Object.keys(ACCOUNTS)) {
    const token = sessions[key]?.token;
    if (!token) continue;
    const dash = await req("GET", "/api/dashboard", { token });
    record(`dashboard ${key}`, dash.status === 200, `status=${dash.status}`);
    const personal = await req("GET", "/api/dashboard/personal", { token });
    record(`personal dashboard ${key}`, personal.status === 200 || personal.status === 404, `status=${personal.status}`);
  }

  // Soft deny: QA cannot list users
  if (sessions.qa?.token) {
    await expectStatus("deny QA list users", req("GET", "/api/users", { token: sessions.qa.token }), 403);
  }

  console.log("\n--- Created entities ---");
  console.log({
    projectId,
    productId,
    requirementId,
    sprintId,
    taskId,
    testCaseId,
    defectId,
    buildId,
    releaseId,
    docId,
    workLogId,
    timeEntryId,
  });

  const fail = printSummary();
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
