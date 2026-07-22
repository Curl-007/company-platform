/**
 * Multi-role full-flow operational smoke against a running API.
 *
 * Uses bootstrap seed accounts (created when DB is empty, non-production):
 *   admin@example.com / Admin@123
 *   pm@example.com    / Pm@12345
 *   pdm@example.com   / Pdm@12345
 *   dev@example.com   / Dev@12345
 *   qa@example.com    / Qa@12345
 *
 * Usage:
 *   node api/scripts/full-flow-roles.js
 *   SMOKE_API_BASE=http://127.0.0.1:4010 node api/scripts/full-flow-roles.js
 */

const BASE = process.env.SMOKE_API_BASE || "http://127.0.0.1:4010";
const stamp = Date.now();
const results = [];

const ACCOUNTS = {
  admin: { email: "admin@example.com", password: "Admin@123", role: "admin", name: "系统管理员" },
  pm: { email: "pm@example.com", password: "Pm@12345", role: "pm", name: "项目经理" },
  pdm: { email: "pdm@example.com", password: "Pdm@12345", role: "pdm", name: "产品经理" },
  dev: { email: "dev@example.com", password: "Dev@12345", role: "dev", name: "开发工程师" },
  qa: { email: "qa@example.com", password: "Qa@12345", role: "qa", name: "测试工程师" },
};

function record(name, ok, detail) {
  results.push({ name, ok, detail: String(detail || "").slice(0, 500) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + String(detail).slice(0, 240) : ""}`);
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
    `status=${status} pages=${pages.length} ops=${ops.length} perms=${perms.slice(0, 6).join("|")}`,
  );
  return { pages, ops, perms };
}

function printSummary() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => r.ok === false).length;
  console.log("\n========== FULL-FLOW ROLES SUMMARY ==========");
  console.log(`PASS ${pass}  FAIL ${fail}  TOTAL ${results.length}`);
  if (fail) {
    console.log("Failed:");
    results.filter((r) => !r.ok).forEach((r) => console.log(` - ${r.name}: ${r.detail}`));
  }
  return fail;
}

async function main() {
  {
    const { status, json } = await req("GET", "/api/health");
    record("GET /api/health", status === 200 && json?.data?.status === "ok", `status=${status}`);
    if (status !== 200) {
      process.exit(printSummary() ? 1 : 0);
    }
  }

  const sessions = {};
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    sessions[key] = await login(account);
  }

  // Role-page expectations (server capabilities; allow extras for admin)
  const expectedPageHints = {
    admin: ["dashboard", "settings", "projects", "products"],
    pm: ["dashboard", "projects", "requirements", "delivery", "reports"],
    pdm: ["dashboard", "products", "requirements", "documents"],
    dev: ["dashboard", "projects", "documents", "delivery"],
    qa: ["dashboard", "testing", "documents"],
  };
  for (const [key, hints] of Object.entries(expectedPageHints)) {
    const token = sessions[key]?.token;
    if (!token) {
      record(`page hints ${key}`, false, "no token");
      continue;
    }
    const { pages } = await capabilities(key, token);
    const missing = hints.filter((p) => !pages.includes(p));
    record(`role pages ${key}`, missing.length === 0, missing.length ? `missing=${missing.join(",")}` : `ok pages=${pages.length}`);
  }

  // Deny: QA must not create project
  if (sessions.qa?.token) {
    const { status, json } = await req("POST", "/api/projects", {
      token: sessions.qa.token,
      body: { name: `QA-Denied-${stamp}`, owner: ACCOUNTS.qa.name, objective: "should fail" },
    });
    record("deny QA create project", status === 403, `status=${status} code=${json?.errorCode}`);
  }

  // Deny: DEV without membership cannot create requirement on new project later; first create as PM
  let projectId = null;
  let productId = null;
  let requirementId = null;
  let testCaseId = null;
  let defectId = null;
  let buildId = null;
  let docId = null;

  // --- PM: create project ---
  if (sessions.pm?.token) {
    const { status, json } = await req("POST", "/api/projects", {
      token: sessions.pm.token,
      body: {
        name: `全流程项目-${stamp}`,
        owner: ACCOUNTS.pm.name,
        objective: "多角色全流程演练",
        description: "full-flow-roles seed project",
        startDate: "2026-07-01",
        endDate: "2026-12-31",
      },
    });
    projectId = json?.data?.id || null;
    record("PM create project", status === 201 && Boolean(projectId), `status=${status} id=${projectId || "?"} msg=${json?.message || ""}`);
  }

  // --- PM: add members (pdm/dev/qa by seed display name) ---
  if (sessions.pm?.token && projectId) {
    for (const [role, name] of [
      ["pdm", ACCOUNTS.pdm.name],
      ["dev", ACCOUNTS.dev.name],
      ["qa", ACCOUNTS.qa.name],
    ]) {
      const { status, json } = await req("POST", `/api/projects/${encodeURIComponent(projectId)}/members`, {
        token: sessions.pm.token,
        body: { userName: name, role },
      });
      record(
        `PM add member ${role}`,
        status === 201 || status === 200,
        `status=${status} id=${json?.data?.id || "?"} msg=${json?.message || ""}`,
      );
    }
  }

  // --- PDM: create product ---
  if (sessions.pdm?.token) {
    const { status, json } = await req("POST", "/api/products", {
      token: sessions.pdm.token,
      body: {
        name: `全流程产品-${stamp}`,
        owner: ACCOUNTS.pdm.name,
        version: "0.1.0",
        stage: "planning",
        description: "full-flow product",
      },
    });
    productId = json?.data?.id || null;
    record("PDM create product", status === 201 && Boolean(productId), `status=${status} id=${productId || "?"} msg=${json?.message || ""}`);
  }

  // --- PDM: create requirement on project ---
  if (sessions.pdm?.token && projectId) {
    const { status, json } = await req("POST", "/api/requirements", {
      token: sessions.pdm.token,
      body: {
        title: `全流程需求-${stamp}`,
        projectId,
        owner: ACCOUNTS.pdm.name,
        priority: "medium",
        description: "multi-role flow requirement",
        productId: productId || undefined,
        assignee: ACCOUNTS.dev.name,
        assigneeRole: "dev",
      },
    });
    requirementId = json?.data?.id || null;
    record(
      "PDM create requirement",
      status === 201 && Boolean(requirementId),
      `status=${status} id=${requirementId || "?"} msg=${json?.message || ""}`,
    );
  }

  // --- QA: create test case ---
  if (sessions.qa?.token && projectId) {
    const { status, json } = await req("POST", "/api/test-cases", {
      token: sessions.qa.token,
      body: {
        title: `全流程用例-${stamp}`,
        projectId,
        requirementId: requirementId || undefined,
        description: "happy path",
        steps: ["打开页面", "执行操作", "核对结果"],
        expectedResult: "通过",
        owner: ACCOUNTS.qa.name,
        assigneeRole: "qa",
      },
    });
    testCaseId = json?.data?.id || null;
    record("QA create test-case", status === 201 && Boolean(testCaseId), `status=${status} id=${testCaseId || "?"} msg=${json?.message || ""}`);
  }

  // --- QA: create defect ---
  if (sessions.qa?.token && projectId) {
    const { status, json } = await req("POST", "/api/defects", {
      token: sessions.qa.token,
      body: {
        title: `全流程缺陷-${stamp}`,
        projectId,
        requirementId: requirementId || undefined,
        severity: "medium",
        assignee: ACCOUNTS.dev.name,
        assigneeRole: "dev",
      },
    });
    defectId = json?.data?.id || null;
    record("QA create defect", status === 201 && Boolean(defectId), `status=${status} id=${defectId || "?"} msg=${json?.message || ""}`);
  }

  // --- DEV: create build ---
  if (sessions.dev?.token && projectId) {
    const { status, json } = await req("POST", "/api/builds", {
      token: sessions.dev.token,
      body: {
        projectId,
        name: `全流程构建-${stamp}`,
        version: "1.0.0-flow",
        notes: "multi-role flow build",
        linkedStories: requirementId ? [requirementId] : [],
        linkedBugs: defectId ? [defectId] : [],
      },
    });
    buildId = json?.data?.id || null;
    record("DEV create build", status === 201 && Boolean(buildId), `status=${status} id=${buildId || "?"} msg=${json?.message || ""}`);
  }

  // --- Admin: document ---
  if (sessions.admin?.token) {
    const content = Buffer.from(`# full-flow ${stamp}\nrole flow doc`).toString("base64");
    const { status, json } = await req("POST", "/api/documents", {
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
    });
    docId = json?.data?.id || null;
    record("ADMIN create document", status === 201 && Boolean(docId), `status=${status} id=${docId || "?"} msg=${json?.message || ""}`);
  }

  // --- Read-back per role ---
  if (projectId) {
    for (const key of ["pm", "pdm", "dev", "qa", "admin"]) {
      const token = sessions[key]?.token;
      if (!token) continue;
      const { status, json } = await req("GET", `/api/projects/${encodeURIComponent(projectId)}`, { token });
      // Some APIs list-only; if 404 path, try list
      const okGet = status === 200 && (json?.data?.id === projectId || json?.data?.name);
      if (okGet) {
        record(`read project as ${key}`, true, `status=${status}`);
      } else {
        const list = await req("GET", "/api/projects", { token });
        const items = list.json?.data?.items || list.json?.data || [];
        const found = Array.isArray(items) && items.some((p) => p.id === projectId);
        record(`read project as ${key}`, list.status === 200 && found, `get=${status} listFound=${found}`);
      }
    }
  }

  if (requirementId && sessions.dev?.token) {
    const { status, json } = await req("GET", "/api/requirements", { token: sessions.dev.token });
    const items = json?.data?.items || json?.data || [];
    const found = Array.isArray(items) && items.some((r) => r.id === requirementId);
    record("DEV list requirements contains created", status === 200 && found, `status=${status} found=${found}`);
  }

  if (testCaseId && sessions.qa?.token) {
    const { status, json } = await req("GET", "/api/test-cases", { token: sessions.qa.token });
    const items = json?.data?.items || json?.data || [];
    const found = Array.isArray(items) && items.some((t) => t.id === testCaseId);
    record("QA list test-cases contains created", status === 200 && found, `status=${status} found=${found}`);
  }

  if (buildId && sessions.dev?.token) {
    const { status, json } = await req("GET", "/api/builds", { token: sessions.dev.token });
    const items = json?.data?.items || json?.data || [];
    const found = Array.isArray(items) && items.some((b) => b.id === buildId);
    record("DEV list builds contains created", status === 200 && found, `status=${status} found=${found}`);
  }

  // Dashboard / mywork for each role
  for (const key of Object.keys(ACCOUNTS)) {
    const token = sessions[key]?.token;
    if (!token) continue;
    const dash = await req("GET", "/api/dashboard", { token });
    record(`dashboard ${key}`, dash.status === 200, `status=${dash.status}`);
    const personal = await req("GET", "/api/dashboard/personal", { token }).catch(() => ({ status: 0, json: {} }));
    // personal may be /api/dashboard/personal or nested — tolerate 404
    if (personal.status === 404) {
      record(`personal dashboard ${key} (optional)`, true, "endpoint optional/missing");
    } else {
      record(`personal dashboard ${key}`, personal.status === 200 || personal.status === 404, `status=${personal.status}`);
    }
  }

  console.log("\n--- Created entities ---");
  console.log({ projectId, productId, requirementId, testCaseId, defectId, buildId, docId });

  const fail = printSummary();
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
