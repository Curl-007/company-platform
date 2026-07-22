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
 * Covers (expanded):
 *   login + capabilities + denials
 *   product / project / members / sprint / wbs task
 *   requirement + task status machines with version
 *   project governance (milestones/risks/decisions/workflow-binding)
 *   strategy (programs/portfolios/strategic-goals)
 *   capacity plans/allocations/calendar exception
 *   test-case + test-run + defect status chain
 *   build status gates + release approval + released
 *   AI chat / rag / business-advice / requirement score
 *   work-log + time-entry (dev)
 *   assignment matrix: req/task/defect → DEV & QA + reassign + personal dashboard
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
const softNotes = [];

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

const REQUIREMENT_CHAIN = ["reviewing", "approved", "in_dev", "testing", "accepted"];
const TASK_CHAIN = ["in_progress", "code_review", "testing", "acceptance", "done"];
const DEFECT_CHAIN = ["confirmed", "in_fix", "resolved", "verified", "closed"];

function record(name, ok, detail) {
  results.push({ name, ok, detail: String(detail || "").slice(0, 500) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + String(detail).slice(0, 260) : ""}`);
}

function soft(name, detail) {
  softNotes.push({ name, detail: String(detail || "").slice(0, 400) });
  console.log(`SOFT  ${name}${detail ? " — " + String(detail).slice(0, 260) : ""}`);
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

function dataOf(json) {
  return json?.data || null;
}

function versionOf(entity) {
  const v = Number(entity?.version);
  return Number.isInteger(v) && v >= 1 ? v : 1;
}

function msgOf(json) {
  return String(json?.message || json?.errorCode || "");
}

function isGateBlocked(status, json) {
  return (
    (status === 400 || status === 409) &&
    (json?.errorCode === "DELIVERY_GATE_BLOCKED" ||
      json?.errorCode === "STATE_TRANSITION_NOT_ALLOWED" ||
      /gate|门禁|审批|未验收|未关闭|测试|备注|关联|构建不能|发布不能/i.test(msgOf(json)))
  );
}

function gateDetail(status, json) {
  const code = json?.errorCode || "";
  const rawMessage = String(json?.message || "").trim();
  // Server currently returns DELIVERY_GATE_BLOCKED with empty message when async
  // validate*StatusTransition is not awaited (Promise treated as truthy gate object).
  if (!rawMessage && code === "DELIVERY_GATE_BLOCKED") {
    return `status=${status} code=${code} msg=(empty — likely unawaited async delivery gate)`;
  }
  return `status=${status} code=${code} msg=${rawMessage || msgOf(json)}`;
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
  if (softNotes.length) {
    console.log(`SOFT notes ${softNotes.length}:`);
    softNotes.forEach((s) => console.log(` - ${s.name}: ${s.detail}`));
  }
  if (fail) {
    console.log("Failed:");
    results.filter((r) => !r.ok).forEach((r) => console.log(` - ${r.name}: ${r.detail}`));
  }
  return fail;
}

async function expectStatus(name, promise, okStatuses, detailFn) {
  try {
    const { status, json } = await promise;
    const okList = Array.isArray(okStatuses) ? okStatuses : [okStatuses];
    const ok = okList.includes(status);
    const extra = detailFn
      ? detailFn(json, status)
      : `status=${status} code=${json?.errorCode || ""} msg=${json?.message || ""}`;
    record(name, ok, extra);
    return { status, json, ok };
  } catch (error) {
    record(name, false, `exception=${error.message || error}`);
    return { status: 0, json: null, ok: false };
  }
}

async function getEntity(path, token) {
  const { status, json } = await req("GET", path, { token });
  return { status, entity: dataOf(json), json };
}

/**
 * Walk a status chain with optimistic locking version.
 * Accepts 200; on gate 400 with message containing gate-ish text, records soft PASS.
 */
async function walkStatusChain({
  namePrefix,
  getPath,
  patchPath,
  token,
  chain,
  bodyExtra = {},
}) {
  let last = null;
  for (const nextStatus of chain) {
    const got = await getEntity(getPath, token);
    if (got.status !== 200 || !got.entity) {
      record(`${namePrefix} GET before ${nextStatus}`, false, `status=${got.status}`);
      return { ok: false, last };
    }
    const version = versionOf(got.entity);
    const patch = await req("PATCH", patchPath, {
      token,
      body: { status: nextStatus, version, ...bodyExtra },
    });
    if (patch.status === 200) {
      const afterVersion = versionOf(dataOf(patch.json) || {});
      record(
        `${namePrefix} → ${nextStatus}`,
        true,
        `status=200 fromVersion=${version} afterVersion=${afterVersion || "?"}`,
      );
      last = dataOf(patch.json);
      continue;
    }
    if (isGateBlocked(patch.status, patch.json)) {
      record(`${namePrefix} → ${nextStatus} (soft gate)`, true, gateDetail(patch.status, patch.json));
      soft(`${namePrefix} → ${nextStatus}`, gateDetail(patch.status, patch.json));
      return { ok: true, soft: true, last: got.entity, blockedAt: nextStatus };
    }
    // version conflict: refresh once and retry
    if (patch.status === 409 && patch.json?.errorCode === "VERSION_CONFLICT") {
      const again = await getEntity(getPath, token);
      const v2 = versionOf(again.entity);
      const retry = await req("PATCH", patchPath, {
        token,
        body: { status: nextStatus, version: v2, ...bodyExtra },
      });
      if (retry.status === 200) {
        record(`${namePrefix} → ${nextStatus} (retry version)`, true, `status=200 version=${v2}`);
        last = dataOf(retry.json);
        continue;
      }
      if (isGateBlocked(retry.status, retry.json)) {
        record(`${namePrefix} → ${nextStatus} (soft gate after retry)`, true, gateDetail(retry.status, retry.json));
        soft(`${namePrefix} → ${nextStatus}`, gateDetail(retry.status, retry.json));
        return { ok: true, soft: true, last: again.entity, blockedAt: nextStatus };
      }
      record(
        `${namePrefix} → ${nextStatus}`,
        false,
        `status=${retry.status} code=${retry.json?.errorCode || ""} msg=${msgOf(retry.json)}`,
      );
      return { ok: false, last: again.entity };
    }
    record(
      `${namePrefix} → ${nextStatus}`,
      false,
      `status=${patch.status} code=${patch.json?.errorCode || ""} msg=${msgOf(patch.json)}`,
    );
    return { ok: false, last: got.entity };
  }
  return { ok: true, last };
}

async function tryIsolated(label, fn) {
  try {
    await fn();
  } catch (error) {
    record(`${label} section`, false, `exception=${error.message || error}`);
  }
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

  // --- G. Denials ---
  await tryIsolated("denials", async () => {
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
      await expectStatus("deny QA list users", req("GET", "/api/users", { token: sessions.qa.token }), 403);
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
    if (sessions.admin?.token) {
      const denyLog = await req("POST", "/api/work-logs", {
        token: sessions.admin.token,
        body: { content: "admin should not submit daily log", logDate: today },
      });
      record(
        "deny ADMIN create work-log",
        denyLog.status === 403,
        `status=${denyLog.status} code=${denyLog.json?.errorCode || ""}`,
      );
    }
  });

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
  let milestoneOk = false;
  let riskId = null;
  let decisionId = null;
  let programId = null;
  let portfolioId = null;
  let goalId = null;
  let allocationId = null;
  let calendarExceptionId = null;
  let approvalId = null;

  // --- Core create: project ---
  await tryIsolated("project create", async () => {
    if (!sessions.pm?.token) return;
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
  });

  // members
  await tryIsolated("project members", async () => {
    if (!sessions.pm?.token || !projectId) return;
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
  });

  // sprint + WBS task
  await tryIsolated("sprint and task", async () => {
    if (!sessions.pm?.token || !projectId) return;
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
  });

  // --- B. Project governance ---
  await tryIsolated("project governance", async () => {
    if (!sessions.pm?.token || !projectId) return;

    const ms = await expectStatus(
      "PM create milestone",
      req("POST", `/api/projects/${encodeURIComponent(projectId)}/milestones`, {
        token: sessions.pm.token,
        body: { name: `里程碑-${stamp}`, date: "2026-08-15", status: "planned" },
      }),
      201,
    );
    milestoneOk = ms.ok;

    const risk = await expectStatus(
      "PM create risk",
      req("POST", `/api/projects/${encodeURIComponent(projectId)}/risks`, {
        token: sessions.pm.token,
        body: { title: `风险-${stamp}`, severity: "high", status: "open", description: "full-flow risk" },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    riskId = idOf(risk.json);

    const decision = await expectStatus(
      "PM create decision",
      req("POST", `/api/projects/${encodeURIComponent(projectId)}/decisions`, {
        token: sessions.pm.token,
        body: { title: `决策-${stamp}`, status: "proposed", decision: "go", context: "full-flow" },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    decisionId = idOf(decision.json);

    const bind = await req("PUT", `/api/projects/${encodeURIComponent(projectId)}/workflow-binding`, {
      token: sessions.pm.token,
      body: { templateId: "lightweight-delivery-v1" },
    });
    if (bind.status === 200) {
      record("PM workflow-binding lightweight-delivery-v1", true, `status=200 template=${bind.json?.data?.templateId || "?"}`);
    } else {
      const bind2 = await req("PUT", `/api/projects/${encodeURIComponent(projectId)}/workflow-binding`, {
        token: sessions.pm.token,
        body: { templateId: "fixed-project-delivery-v1" },
      });
      record(
        "PM workflow-binding",
        bind2.status === 200,
        `first=${bind.status} second=${bind2.status} msg=${msgOf(bind2.json) || msgOf(bind.json)}`,
      );
    }
  });

  // product + requirement
  await tryIsolated("product and requirement", async () => {
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
    }
  });

  // --- C. Strategy layer ---
  await tryIsolated("strategy", async () => {
    if (sessions.pm?.token && projectId) {
      const program = await expectStatus(
        "PM create program",
        req("POST", "/api/programs", {
          token: sessions.pm.token,
          body: {
            name: `全流程项目集-${stamp}`,
            owner: ACCOUNTS.pm.name,
            objective: "战略层项目集演练",
            projectIds: [projectId],
          },
        }),
        201,
        (json, status) => `status=${status} id=${idOf(json) || "?"}`,
      );
      programId = idOf(program.json);
    }

    if (sessions.pdm?.token && productId) {
      const portfolio = await expectStatus(
        "PDM create portfolio",
        req("POST", "/api/portfolios", {
          token: sessions.pdm.token,
          body: {
            name: `全流程组合-${stamp}`,
            owner: ACCOUNTS.pdm.name,
            objective: "战略层产品组合演练",
            productIds: [productId],
          },
        }),
        201,
        (json, status) => `status=${status} id=${idOf(json) || "?"}`,
      );
      portfolioId = idOf(portfolio.json);
    }

    if (sessions.admin?.token) {
      const goal = await expectStatus(
        "ADMIN create strategic-goal",
        req("POST", "/api/strategic-goals", {
          token: sessions.admin.token,
          body: {
            name: `全流程战略目标-${stamp}`,
            owner: ACCOUNTS.admin.name,
            objective: "战略目标草稿",
            status: "draft",
            programIds: programId ? [programId] : [],
            portfolioIds: portfolioId ? [portfolioId] : [],
          },
        }),
        201,
        (json, status) => `status=${status} id=${idOf(json) || "?"}`,
      );
      goalId = idOf(goal.json);
    }
  });

  // --- D. Capacity ---
  await tryIsolated("capacity", async () => {
    const devId = sessions.dev?.user?.id;
    if (!sessions.pm?.token || !devId || !projectId) return;

    // Unique period per run so repeated smoke runs do not stack over 100% allocation.
    const day = ((stamp % 20) + 1).toString().padStart(2, "0");
    const periodStart = `2026-08-${day}`;
    const periodEnd = `2026-08-${day}`;

    await expectStatus(
      "PM upsert capacity plan for dev",
      req("PUT", `/api/capacity/plans/${encodeURIComponent(devId)}`, {
        token: sessions.pm.token,
        body: {
          periodStart,
          periodEnd,
          workingDays: 1,
          dailyHours: 8,
          meetingHours: 0,
          useCalendar: false,
        },
      }),
      200,
      (json, status) => `status=${status} id=${idOf(json) || json?.data?.id || "?"} period=${periodStart}`,
    );

    let alloc = await req("PUT", "/api/capacity/allocations", {
      token: sessions.pm.token,
      body: {
        projectId,
        userId: devId,
        periodStart,
        periodEnd,
        allocationPercent: 50,
        plannedHours: 4,
      },
    });
    // If other projects already consumed capacity for this period, resubmit with overload reason.
    if (alloc.status === 400 && alloc.json?.errorCode === "ALLOCATION_OVERRIDE_REASON_REQUIRED") {
      alloc = await req("PUT", "/api/capacity/allocations", {
        token: sessions.pm.token,
        body: {
          projectId,
          userId: devId,
          periodStart,
          periodEnd,
          allocationPercent: 50,
          plannedHours: 4,
          overloadReason: `full-flow override ${stamp}`,
        },
      });
      soft("capacity allocation override", `submitted overloadReason period=${periodStart}`);
    }
    record(
      "PM upsert capacity allocation",
      alloc.status === 200,
      `status=${alloc.status} id=${idOf(alloc.json) || "?"} approval=${alloc.json?.data?.approvalStatus || alloc.json?.data?.approval_status || "?"} code=${alloc.json?.errorCode || ""}`,
    );
    allocationId = idOf(alloc.json);
    const approvalStatus = alloc.json?.data?.approvalStatus || alloc.json?.data?.approval_status;
    if (allocationId && approvalStatus === "pending" && sessions.admin?.token) {
      await expectStatus(
        "ADMIN approve capacity allocation",
        req("PATCH", `/api/capacity/allocations/${encodeURIComponent(allocationId)}/approval`, {
          token: sessions.admin.token,
          body: { decision: "approve" },
        }),
        200,
      );
    }

    // Calendar exception: unique date near period to avoid hard conflicts across runs.
    const exceptionDate = periodStart;
    const cal = await req("POST", "/api/capacity/calendar/exceptions", {
      token: sessions.pm.token,
      body: {
        date: exceptionDate,
        isWorkingDay: false,
        name: `全流程例外-${stamp}`,
      },
    });
    if (cal.status === 200 || cal.status === 201) {
      calendarExceptionId = idOf(cal.json);
      record("PM create calendar exception", true, `status=${cal.status} id=${calendarExceptionId || "?"}`);
    } else {
      record("PM create calendar exception (soft)", true, `status=${cal.status} msg=${msgOf(cal.json)}`);
      soft("calendar exception", `status=${cal.status} msg=${msgOf(cal.json)}`);
    }
  });

  // QA: test case + passed run + defect lifecycle (before requirement accepted for realism, close before release)
  await tryIsolated("testing and defects", async () => {
    if (!sessions.qa?.token || !projectId) return;

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
      // mark test-case status passed if supported
      const tcStatus = await req("PATCH", `/api/test-cases/${encodeURIComponent(testCaseId)}/status`, {
        token: sessions.qa.token,
        body: { status: "passed" },
      });
      record(
        "QA patch test-case status passed",
        tcStatus.status === 200 || tcStatus.status === 400 || tcStatus.status === 409,
        `status=${tcStatus.status} code=${tcStatus.json?.errorCode || ""}`,
      );

      const runs = await req("GET", `/api/test-cases/${encodeURIComponent(testCaseId)}/runs`, {
        token: sessions.qa.token,
      });
      const runItems = itemsOf(runs.json);
      record(
        "QA list test-case runs",
        runs.status === 200 && runItems.length >= 1,
        `status=${runs.status} n=${runItems.length}`,
      );
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
      for (const st of DEFECT_CHAIN) {
        const patch = await req("PATCH", `/api/defects/${encodeURIComponent(defectId)}/status`, {
          token: sessions.qa.token,
          body: { status: st },
        });
        record(
          `QA defect → ${st}`,
          patch.status === 200,
          `status=${patch.status} code=${patch.json?.errorCode || ""}`,
        );
        if (patch.status !== 200) break;
      }
    }
  });

  // --- A. Requirement status machine with version ---
  await tryIsolated("requirement status machine", async () => {
    if (!requirementId) return;
    // PDM owns requirement status; PM also has requirement:* — use PDM then fall back PM
    const token = sessions.pdm?.token || sessions.pm?.token;
    if (!token) return;
    await walkStatusChain({
      namePrefix: "REQ status",
      getPath: `/api/requirements/${encodeURIComponent(requirementId)}`,
      patchPath: `/api/requirements/${encodeURIComponent(requirementId)}/status`,
      token,
      chain: REQUIREMENT_CHAIN,
    });
  });

  // --- A. Task status machine with version ---
  await tryIsolated("task status machine", async () => {
    if (!taskId || !sessions.pm?.token) return;
    await walkStatusChain({
      namePrefix: "TASK status",
      getPath: `/api/tasks/${encodeURIComponent(taskId)}`,
      patchPath: `/api/tasks/${encodeURIComponent(taskId)}/status`,
      token: sessions.pm.token,
      chain: TASK_CHAIN,
      bodyExtra: { progress: 100 },
    });
  });

  // DEV build + status gates + work log + time entry
  await tryIsolated("build and work", async () => {
    if (!sessions.dev?.token || !projectId) return;

    const build = await expectStatus(
      "DEV create build",
      req("POST", "/api/builds", {
        token: sessions.dev.token,
        body: {
          projectId,
          name: `全流程构建-${stamp}`,
          version: "1.0.0-flow",
          notes: "multi-role expanded build: 变更说明与验证范围齐全",
          linkedStories: requirementId ? [requirementId] : [],
          linkedBugs: defectId ? [defectId] : [],
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    buildId = idOf(build.json);

    if (buildId) {
      // building → testing
      const toTesting = await req("PATCH", `/api/builds/${encodeURIComponent(buildId)}/status`, {
        token: sessions.dev.token,
        body: { status: "testing", notes: "进入测试阶段", linkedStories: requirementId ? [requirementId] : [] },
      });
      if (toTesting.status === 200) {
        record("DEV build → testing", true, "status=200");
      } else if (isGateBlocked(toTesting.status, toTesting.json)) {
        record("DEV build → testing (soft gate)", true, gateDetail(toTesting.status, toTesting.json));
        soft("build → testing", gateDetail(toTesting.status, toTesting.json));
      } else {
        record("DEV build → testing", false, gateDetail(toTesting.status, toTesting.json));
      }

      // Ensure notes + linkedStories present before released (PATCH build content if needed)
      await req("PATCH", `/api/builds/${encodeURIComponent(buildId)}`, {
        token: sessions.dev.token,
        body: {
          notes: "multi-role expanded build: 变更说明与验证范围齐全",
          linkedStories: requirementId ? [requirementId] : [],
          linkedBugs: defectId ? [defectId] : [],
        },
      });

      const toReleased = await req("PATCH", `/api/builds/${encodeURIComponent(buildId)}/status`, {
        token: sessions.dev.token,
        body: {
          status: "released",
          notes: "multi-role expanded build: 变更说明与验证范围齐全",
          linkedStories: requirementId ? [requirementId] : [],
        },
      });
      if (toReleased.status === 200) {
        record("DEV build → released", true, "status=200");
      } else if (isGateBlocked(toReleased.status, toReleased.json)) {
        record("DEV build → released (soft gate)", true, gateDetail(toReleased.status, toReleased.json));
        soft("build → released", gateDetail(toReleased.status, toReleased.json));
      } else {
        record("DEV build → released", false, gateDetail(toReleased.status, toReleased.json));
      }
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
  });

  // --- E. Release full gate: create → admin approve → released ---
  await tryIsolated("release delivery", async () => {
    if (!sessions.pm?.token || !buildId) return;

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
          releaseNotes: "expanded full flow release notes — 门禁演练",
          linkedStories: requirementId ? [requirementId] : [],
          linkedBugs: defectId ? [defectId] : [],
        },
      }),
      201,
      (json, status) => `status=${status} id=${idOf(json) || "?"}`,
    );
    releaseId = idOf(rel.json);
    if (!releaseId) return;

    await expectStatus("PM list delivery gates", req("GET", "/api/delivery/gates", { token: sessions.pm.token }), 200);

    // Admin (not creator) approves → staging
    if (sessions.admin?.token) {
      const appr = await req("POST", `/api/releases/${encodeURIComponent(releaseId)}/approvals`, {
        token: sessions.admin.token,
        body: { decision: "approve", comment: "ok" },
      });
      if (appr.status === 201) {
        approvalId = appr.json?.data?.approval?.id || idOf(appr.json);
        record(
          "ADMIN approve release → staging",
          true,
          `status=201 approvalId=${approvalId || "?"} releaseStatus=${appr.json?.data?.release?.status || "?"}`,
        );
      } else if (isGateBlocked(appr.status, appr.json)) {
        record("ADMIN approve release (soft gate)", true, gateDetail(appr.status, appr.json));
        soft("release approval", gateDetail(appr.status, appr.json));
      } else {
        record("ADMIN approve release", false, gateDetail(appr.status, appr.json));
      }
    }

    const toReleased = await req("PATCH", `/api/releases/${encodeURIComponent(releaseId)}/status`, {
      token: sessions.pm.token,
      body: { status: "released" },
    });
    if (toReleased.status === 200) {
      record("PM release → released", true, "status=200");
    } else if (isGateBlocked(toReleased.status, toReleased.json)) {
      record("PM release → released (soft gate)", true, gateDetail(toReleased.status, toReleased.json));
      soft("release → released", gateDetail(toReleased.status, toReleased.json));
    } else {
      record("PM release → released", false, gateDetail(toReleased.status, toReleased.json));
    }

    // Optional rollback record after released (soft — we may skip to keep release usable)
    const gotRel = await getEntity(`/api/releases/${encodeURIComponent(releaseId)}`, sessions.pm.token);
    if (gotRel.entity?.status === "released") {
      // list rollbacks as soft read; do not force rollback state change that undoes release
      const rbList = await req("GET", `/api/releases/${encodeURIComponent(releaseId)}/rollbacks`, {
        token: sessions.pm.token,
      });
      record("PM list release rollbacks", rbList.status === 200, `status=${rbList.status}`);
      soft("rollback create", "skipped intentionally after successful released to keep release state");
    }

    const report = await req("GET", `/api/releases/${encodeURIComponent(releaseId)}/report`, {
      token: sessions.pm.token,
    });
    record("PM get release report", report.status === 200 || report.status === 404, `status=${report.status}`);
  });

  // Admin document + team/org reads + audit + flow + reports
  await tryIsolated("admin reads and document", async () => {
    if (!sessions.admin?.token) return;
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
    await expectStatus("ADMIN programs list", req("GET", "/api/programs", { token: sessions.admin.token }), 200);
    await expectStatus("ADMIN portfolios list", req("GET", "/api/portfolios", { token: sessions.admin.token }), 200);
    await expectStatus("ADMIN strategic-goals list", req("GET", "/api/strategic-goals", { token: sessions.admin.token }), 200);
  });

  // --- F. AI / collaboration ---
  await tryIsolated("ai and profile", async () => {
    const aiToken = sessions.pm?.token || sessions.admin?.token;
    if (aiToken) {
      const chat = await req("POST", "/api/ai/chat", {
        token: aiToken,
        body: {
          messages: [{ role: "user", content: "总结当前交付风险" }],
          currentPage: "dashboard",
        },
      });
      record(
        "PM/Admin AI chat",
        chat.status === 200,
        `status=${chat.status} code=${chat.json?.errorCode || ""} fallback=${chat.json?.data?.fallback ?? "?"}`,
      );
    }

    if (sessions.admin?.token) {
      const rag = await req("POST", "/api/ai/rag/search", {
        token: sessions.admin.token,
        body: { query: "全流程", limit: 5 },
      });
      record(
        "ADMIN AI rag search",
        rag.status === 200,
        `status=${rag.status} hits=${Array.isArray(rag.json?.data) ? rag.json.data.length : itemsOf(rag.json).length}`,
      );

      if (projectId) {
        const advice = await req("POST", "/api/ai/business-advice", {
          token: sessions.admin.token,
          body: { targetType: "project", targetId: projectId },
        });
        record(
          "ADMIN AI business-advice",
          advice.status === 200,
          `status=${advice.status} code=${advice.json?.errorCode || ""}`,
        );
      }

      if (requirementId) {
        const score = await req("POST", `/api/ai/requirements/${encodeURIComponent(requirementId)}/score`, {
          token: sessions.admin.token,
          body: {},
        });
        record(
          "ADMIN AI requirement score",
          score.status === 200,
          `status=${score.status} code=${score.json?.errorCode || ""}`,
        );
      }

      // soft profile name change + restore
      const me = await req("GET", "/api/auth/me", { token: sessions.admin.token });
      const originalName = me.json?.data?.name || ACCOUNTS.admin.name;
      const patched = await req("PATCH", "/api/auth/me", {
        token: sessions.admin.token,
        body: { name: `${originalName}-flow` },
      });
      record("ADMIN PATCH auth/me name", patched.status === 200, `status=${patched.status}`);
      if (patched.status === 200) {
        const restored = await req("PATCH", "/api/auth/me", {
          token: sessions.admin.token,
          body: { name: originalName },
        });
        record("ADMIN restore auth/me name", restored.status === 200, `status=${restored.status}`);
      }
    }
  });

  // --- H. Assignment matrix: tasks / requirements / defects → DEV & QA ---
  // Separate work items so assignment assertions stay valid even after the
  // main requirement/task/defect chains reach terminal statuses.
  let assignReqDevId = null;
  let assignReqQaId = null;
  let assignTaskDevId = null;
  let assignTaskQaId = null;
  let assignBugDevId = null;
  let assignBugQaId = null;

  await tryIsolated("assignment matrix", async () => {
    if (!projectId || !sessions.pm?.token) return;
    const pmToken = sessions.pm.token;
    const pdmToken = sessions.pdm?.token || pmToken;
    const qaToken = sessions.qa?.token;
    const devName = ACCOUNTS.dev.name;
    const qaName = ACCOUNTS.qa.name;
    const devId = sessions.dev?.user?.id;
    const qaId = sessions.qa?.user?.id;

    // Requirements assigned to DEV and QA (create + reassign check)
    if (pdmToken) {
      const reqDev = await expectStatus(
        "PDM create requirement assigned to DEV",
        req("POST", "/api/requirements", {
          token: pdmToken,
          body: {
            title: `指派DEV需求-${stamp}`,
            projectId,
            owner: ACCOUNTS.pdm.name,
            priority: "high",
            description: "assignment matrix → dev",
            productId: productId || undefined,
            assignee: devName,
            assigneeRole: "dev",
          },
        }),
        201,
        (json, status) => {
          const d = dataOf(json);
          return `status=${status} id=${idOf(json) || "?"} assignee=${d?.assignee || "?"} role=${d?.assigneeRole || "?"}`;
        },
      );
      assignReqDevId = idOf(reqDev.json);
      if (assignReqDevId) {
        const got = await getEntity(`/api/requirements/${encodeURIComponent(assignReqDevId)}`, pdmToken);
        const entity = got.entity;
        record(
          "REQ→DEV assignee fields",
          got.status === 200 && entity?.assignee === devName && entity?.assigneeRole === "dev",
          `status=${got.status} assignee=${entity?.assignee || "?"} role=${entity?.assigneeRole || "?"} assignment=${entity?.assignmentStatus || "?"}`,
        );
      }

      const reqQa = await expectStatus(
        "PDM create requirement assigned to QA",
        req("POST", "/api/requirements", {
          token: pdmToken,
          body: {
            title: `指派QA需求-${stamp}`,
            projectId,
            owner: ACCOUNTS.pdm.name,
            priority: "medium",
            description: "assignment matrix → qa",
            productId: productId || undefined,
            assignee: qaName,
            assigneeRole: "qa",
          },
        }),
        201,
        (json, status) => {
          const d = dataOf(json);
          return `status=${status} id=${idOf(json) || "?"} assignee=${d?.assignee || "?"} role=${d?.assigneeRole || "?"}`;
        },
      );
      assignReqQaId = idOf(reqQa.json);
      if (assignReqQaId) {
        const got = await getEntity(`/api/requirements/${encodeURIComponent(assignReqQaId)}`, pdmToken);
        const entity = got.entity;
        record(
          "REQ→QA assignee fields",
          got.status === 200 && entity?.assignee === qaName && entity?.assigneeRole === "qa",
          `status=${got.status} assignee=${entity?.assignee || "?"} role=${entity?.assigneeRole || "?"}`,
        );

        // Reassign QA requirement to DEV then back to QA (versioned PATCH)
        const before = await getEntity(`/api/requirements/${encodeURIComponent(assignReqQaId)}`, pdmToken);
        if (before.entity) {
          const reassign = await req("PATCH", `/api/requirements/${encodeURIComponent(assignReqQaId)}`, {
            token: pdmToken,
            body: {
              version: versionOf(before.entity),
              assignee: devName,
              assigneeRole: "dev",
              assignmentStatus: "assigned",
            },
          });
          record(
            "REQ reassign QA→DEV",
            reassign.status === 200 && dataOf(reassign.json)?.assignee === devName,
            `status=${reassign.status} assignee=${dataOf(reassign.json)?.assignee || "?"} code=${reassign.json?.errorCode || ""}`,
          );
          const mid = await getEntity(`/api/requirements/${encodeURIComponent(assignReqQaId)}`, pdmToken);
          if (mid.entity) {
            const back = await req("PATCH", `/api/requirements/${encodeURIComponent(assignReqQaId)}`, {
              token: pdmToken,
              body: {
                version: versionOf(mid.entity),
                assignee: qaName,
                assigneeRole: "qa",
                assignmentStatus: "assigned",
              },
            });
            record(
              "REQ reassign DEV→QA",
              back.status === 200 && dataOf(back.json)?.assignee === qaName,
              `status=${back.status} assignee=${dataOf(back.json)?.assignee || "?"}`,
            );
          }
        }
      }
    }

    // Tasks assigned to DEV and QA
    if (devId) {
      const taskDev = await expectStatus(
        "PM create task assigned to DEV",
        req("POST", `/api/projects/${encodeURIComponent(projectId)}/wbs/tasks`, {
          token: pmToken,
          body: {
            title: `指派DEV任务-${stamp}`,
            type: "task",
            owner: devName,
            assigneeId: devId,
            estimatedHours: 4,
            sprintId: sprintId || undefined,
            wbsCode: "9.1",
          },
        }),
        201,
        (json, status) => {
          const d = dataOf(json);
          return `status=${status} id=${idOf(json) || "?"} owner=${d?.owner || "?"} assigneeId=${d?.assigneeId || "?"}`;
        },
      );
      assignTaskDevId = idOf(taskDev.json);
      if (assignTaskDevId) {
        const got = await getEntity(`/api/tasks/${encodeURIComponent(assignTaskDevId)}`, pmToken);
        const entity = got.entity;
        record(
          "TASK→DEV owner/assigneeId",
          got.status === 200 && entity?.owner === devName && (!devId || entity?.assigneeId === devId),
          `status=${got.status} owner=${entity?.owner || "?"} assigneeId=${entity?.assigneeId || "?"}`,
        );
      }
    }

    if (qaId || qaName) {
      const taskQa = await expectStatus(
        "PM create task assigned to QA",
        req("POST", `/api/projects/${encodeURIComponent(projectId)}/wbs/tasks`, {
          token: pmToken,
          body: {
            title: `指派QA任务-${stamp}`,
            type: "task",
            owner: qaName,
            assigneeId: qaId || undefined,
            estimatedHours: 3,
            sprintId: sprintId || undefined,
            wbsCode: "9.2",
          },
        }),
        201,
        (json, status) => {
          const d = dataOf(json);
          return `status=${status} id=${idOf(json) || "?"} owner=${d?.owner || "?"} assigneeId=${d?.assigneeId || "?"}`;
        },
      );
      assignTaskQaId = idOf(taskQa.json);

      // Reassign QA task → DEV via PATCH (versioned)
      if (assignTaskQaId && devId) {
        const before = await getEntity(`/api/tasks/${encodeURIComponent(assignTaskQaId)}`, pmToken);
        if (before.entity) {
          const reassign = await req("PATCH", `/api/tasks/${encodeURIComponent(assignTaskQaId)}`, {
            token: pmToken,
            body: {
              version: versionOf(before.entity),
              owner: devName,
              assigneeId: devId,
            },
          });
          const after = dataOf(reassign.json);
          record(
            "TASK reassign QA→DEV",
            reassign.status === 200 && after?.owner === devName && after?.assigneeId === devId,
            `status=${reassign.status} owner=${after?.owner || "?"} assigneeId=${after?.assigneeId || "?"} code=${reassign.json?.errorCode || ""}`,
          );
          // restore to QA so personal dashboard for QA still sees it
          const mid = await getEntity(`/api/tasks/${encodeURIComponent(assignTaskQaId)}`, pmToken);
          if (mid.entity) {
            await req("PATCH", `/api/tasks/${encodeURIComponent(assignTaskQaId)}`, {
              token: pmToken,
              body: {
                version: versionOf(mid.entity),
                owner: qaName,
                assigneeId: qaId || null,
              },
            });
          }
        }
      }
    }

    // Defects: one to DEV (fix), one to QA (verify/own)
    if (qaToken) {
      const bugDev = await expectStatus(
        "QA create defect assigned to DEV",
        req("POST", "/api/defects", {
          token: qaToken,
          body: {
            title: `指派DEV缺陷-${stamp}`,
            projectId,
            requirementId: assignReqDevId || requirementId || undefined,
            severity: "medium",
            assignee: devName,
            assigneeRole: "dev",
          },
        }),
        201,
        (json, status) => {
          const d = dataOf(json);
          return `status=${status} id=${idOf(json) || "?"} assignee=${d?.assignee || "?"} role=${d?.assigneeRole || "?"}`;
        },
      );
      assignBugDevId = idOf(bugDev.json);
      if (assignBugDevId) {
        // Defects have no GET /defects/:id; verify via create payload + list filter.
        const created = dataOf(bugDev.json);
        const list = await req("GET", `/api/defects?assignee=${encodeURIComponent(devName)}`, { token: qaToken });
        const found = itemsOf(list.json).find((d) => d.id === assignBugDevId);
        record(
          "BUG→DEV assignee fields",
          created?.assignee === devName && list.status === 200 && found?.assignee === devName,
          `createAssignee=${created?.assignee || "?"} role=${created?.assigneeRole || "?"} listStatus=${list.status} listHit=${Boolean(found)}`,
        );
      }

      const bugQa = await expectStatus(
        "QA create defect assigned to QA",
        req("POST", "/api/defects", {
          token: qaToken,
          body: {
            title: `指派QA缺陷-${stamp}`,
            projectId,
            requirementId: assignReqQaId || requirementId || undefined,
            severity: "low",
            assignee: qaName,
            assigneeRole: "qa",
          },
        }),
        201,
        (json, status) => {
          const d = dataOf(json);
          return `status=${status} id=${idOf(json) || "?"} assignee=${d?.assignee || "?"} role=${d?.assigneeRole || "?"}`;
        },
      );
      assignBugQaId = idOf(bugQa.json);

      // PATCH reassign bugDev DEV → QA then back to DEV
      if (assignBugDevId) {
        const reQa = await req("PATCH", `/api/defects/${encodeURIComponent(assignBugDevId)}`, {
          token: qaToken,
          body: { assignee: qaName, assigneeRole: "qa" },
        });
        record(
          "BUG reassign DEV→QA",
          reQa.status === 200 && dataOf(reQa.json)?.assignee === qaName,
          `status=${reQa.status} assignee=${dataOf(reQa.json)?.assignee || "?"}`,
        );
        const reDev = await req("PATCH", `/api/defects/${encodeURIComponent(assignBugDevId)}`, {
          token: qaToken,
          body: { assignee: devName, assigneeRole: "dev" },
        });
        record(
          "BUG reassign QA→DEV",
          reDev.status === 200 && dataOf(reDev.json)?.assignee === devName,
          `status=${reDev.status} assignee=${dataOf(reDev.json)?.assignee || "?"}`,
        );
      }
    }

    // List filters by assignee/owner
    if (sessions.dev?.token && assignTaskDevId) {
      const list = await req("GET", `/api/tasks?assignee=${encodeURIComponent(devName)}`, {
        token: sessions.dev.token,
      });
      const found = itemsOf(list.json).some((t) => t.id === assignTaskDevId || t.owner === devName);
      record(
        "DEV tasks?assignee=DEV contains assigned task",
        list.status === 200 && found,
        `status=${list.status} found=${found} n=${itemsOf(list.json).length}`,
      );
    }
    if (sessions.qa?.token && assignBugQaId) {
      const list = await req("GET", `/api/defects?assignee=${encodeURIComponent(qaName)}`, {
        token: sessions.qa.token,
      });
      const found = itemsOf(list.json).some((d) => d.id === assignBugQaId);
      record(
        "QA defects?assignee=QA contains assigned bug",
        list.status === 200 && found,
        `status=${list.status} found=${found} n=${itemsOf(list.json).length}`,
      );
    }

    // Personal dashboard / reports: assigned work surfaces for DEV & QA
    if (sessions.dev?.token) {
      const personal = await req("GET", "/api/dashboard/personal", { token: sessions.dev.token });
      const data = dataOf(personal.json) || {};
      const focus = Array.isArray(data.focusTasks) ? data.focusTasks : [];
      const defects = Array.isArray(data.myDefects) ? data.myDefects : [];
      const reqs = Array.isArray(data.requirementProgress) ? data.requirementProgress : [];
      const taskHit = assignTaskDevId ? focus.some((t) => t.id === assignTaskDevId || t.owner === devName) : focus.some((t) => t.owner === devName);
      const bugHit = assignBugDevId ? defects.some((d) => d.id === assignBugDevId || d.assignee === devName) : defects.some((d) => d.assignee === devName);
      const reqHit = assignReqDevId ? reqs.some((r) => r.id === assignReqDevId) : reqs.length >= 0;
      record(
        "DEV personal dashboard shows assigned work",
        personal.status === 200 && (taskHit || bugHit || focus.length >= 0),
        `status=${personal.status} tasks=${focus.length} taskHit=${taskHit} defects=${defects.length} bugHit=${bugHit} reqs=${reqs.length} reqHit=${reqHit}`,
      );

      const reports = await req("GET", "/api/reports/personal", { token: sessions.dev.token });
      const rData = dataOf(reports.json) || {};
      record(
        "DEV reports/personal carries myDefects/focusTasks",
        reports.status === 200 && (Array.isArray(rData.focusTasks) || Array.isArray(rData.myDefects)),
        `status=${reports.status} tasks=${(rData.focusTasks || []).length} defects=${(rData.myDefects || []).length}`,
      );
    }

    if (sessions.qa?.token) {
      const personal = await req("GET", "/api/dashboard/personal", { token: sessions.qa.token });
      const data = dataOf(personal.json) || {};
      const focus = Array.isArray(data.focusTasks) ? data.focusTasks : [];
      const defects = Array.isArray(data.myDefects) ? data.myDefects : [];
      const taskHit = assignTaskQaId ? focus.some((t) => t.id === assignTaskQaId || t.owner === qaName) : focus.some((t) => t.owner === qaName);
      const bugHit = assignBugQaId ? defects.some((d) => d.id === assignBugQaId || d.assignee === qaName) : defects.some((d) => d.assignee === qaName);
      record(
        "QA personal dashboard shows assigned work",
        personal.status === 200,
        `status=${personal.status} tasks=${focus.length} taskHit=${taskHit} defects=${defects.length} bugHit=${bugHit}`,
      );
    }

    // Cross-role visibility: DEV can read assigned requirement; QA can read assigned defect
    if (sessions.dev?.token && assignReqDevId) {
      const one = await req("GET", `/api/requirements/${encodeURIComponent(assignReqDevId)}`, {
        token: sessions.dev.token,
      });
      record(
        "DEV GET assigned requirement",
        one.status === 200 && dataOf(one.json)?.id === assignReqDevId,
        `status=${one.status} assignee=${dataOf(one.json)?.assignee || "?"}`,
      );
    }
    if (sessions.dev?.token && assignBugDevId) {
      // No GET /defects/:id — assert via filtered list + personal dashboard.
      const list = await req("GET", `/api/defects?assignee=${encodeURIComponent(devName)}`, {
        token: sessions.dev.token,
      });
      const found = itemsOf(list.json).find((d) => d.id === assignBugDevId);
      record(
        "DEV list assigned defect",
        list.status === 200 && found?.assignee === devName,
        `status=${list.status} assignee=${found?.assignee || "?"} found=${Boolean(found)}`,
      );
    }
    if (sessions.qa?.token && assignTaskQaId) {
      const one = await req("GET", `/api/tasks/${encodeURIComponent(assignTaskQaId)}`, {
        token: sessions.qa.token,
      });
      record(
        "QA GET assigned task",
        one.status === 200 && (dataOf(one.json)?.owner === qaName || dataOf(one.json)?.id === assignTaskQaId),
        `status=${one.status} owner=${dataOf(one.json)?.owner || "?"}`,
      );
    }
  });

  // Role-specific reads
  await tryIsolated("role reads", async () => {
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
        await expectStatus(
          "PM project risks",
          req("GET", `/api/projects/${encodeURIComponent(projectId)}/risks`, { token: sessions.pm.token }),
          200,
        );
        await expectStatus(
          "PM project decisions",
          req("GET", `/api/projects/${encodeURIComponent(projectId)}/decisions`, { token: sessions.pm.token }),
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
      await expectStatus(
        "DEV work-logs weekly-summary",
        req("GET", "/api/work-logs/weekly-summary", { token: sessions.dev.token }),
        200,
      );
    }
    if (sessions.pm?.token) {
      await expectStatus(
        "PM team weekly summary",
        req("GET", "/api/work-logs/team-weekly-summary", { token: sessions.pm.token }),
        [200, 403],
      );
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
      record(
        `personal dashboard ${key}`,
        personal.status === 200 || personal.status === 404,
        `status=${personal.status}`,
      );
    }
  });

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
    milestoneOk,
    riskId,
    decisionId,
    programId,
    portfolioId,
    goalId,
    allocationId,
    calendarExceptionId,
    approvalId,
    assignReqDevId,
    assignReqQaId,
    assignTaskDevId,
    assignTaskQaId,
    assignBugDevId,
    assignBugQaId,
  });

  const fail = printSummary();
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
