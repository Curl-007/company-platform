const bcryptjs = require("bcryptjs");

const DEFAULT_DEPARTMENT_BY_ROLE = Object.freeze({
  admin: "平台管理",
  pm: "项目管理部",
  pdm: "产品部",
  qa: "测试部",
  dev: "研发部",
});

function createSeedService({
  db,
  rowSync,
  rowsSync,
  insertSync,
  json,
  now,
  env = process.env,
  bcrypt = bcryptjs,
  resolveDemoSeedAccounts = (sourceEnv) => require("../dev/demoSeedAccounts").resolveDemoSeedAccounts(sourceEnv),
  loadDemoData = () => require("../../data"),
}) {
  function count(table) {
    return rowSync("SELECT COUNT(*) AS count FROM " + table).count;
  }

  function alignDefaultOrganizationMembership() {
    const unassigned = rowsSync("SELECT id, role, department FROM users WHERE department_id IS NULL OR TRIM(department_id) = ''");
    if (!unassigned.length) return;
    const findUnit = db.prepare("SELECT id FROM org_units WHERE name = @name");
    const insertUnit = db.prepare(
      "INSERT INTO org_units " +
      "(id, name, parent_id, manager_user_id, responsibilities, status, created_at, updated_at) " +
      "VALUES (@id, @name, NULL, NULL, '', 'active', @createdAt, @updatedAt)",
    );
    const bindUser = db.prepare("UPDATE users SET department_id = @departmentId, department = @name WHERE id = @id");
    const units = new Map();
    let sequence = 0;
    for (const user of unassigned) {
      const name = String(user.department || "").trim() || DEFAULT_DEPARTMENT_BY_ROLE[user.role] || DEFAULT_DEPARTMENT_BY_ROLE.dev;
      let unit = units.get(name) || findUnit.get({ name });
      if (!unit) {
        sequence += 1;
        const stamp = now();
        unit = { id: "ORG-BOOTSTRAP-" + Date.now() + "-" + sequence };
        insertUnit.run({ id: unit.id, name, createdAt: stamp, updatedAt: stamp });
      }
      units.set(name, unit);
      bindUser.run({ id: user.id, departmentId: unit.id, name });
    }
  }

  function seed() {
    const isProduction = env.NODE_ENV === "production";
    const adminEmail = String(env.SEED_ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();
    const adminPassword = String(env.SEED_ADMIN_PASSWORD || "");
    const productionDemoRoleSeeds = ["SEED_PM_PASSWORD", "SEED_DEV_PASSWORD", "SEED_QA_PASSWORD", "SEED_PDM_PASSWORD"]
      .filter((name) => String(env[name] || "").length > 0);
    if (isProduction && String(env.SEED_DEMO_DATA || "") === "1") {
      throw new Error("SEED_DEMO_DATA=1 is not allowed in production.");
    }
    if (isProduction && productionDemoRoleSeeds.length > 0) {
      throw new Error("Named demo role seed passwords are not allowed in production.");
    }
    if (isProduction && Boolean(adminEmail) !== Boolean(adminPassword)) {
      throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be provided together in production.");
    }

    const seedAccounts = isProduction
      ? (adminEmail && adminPassword ? [{
          id: "USR-ADMIN",
          name: "系统管理员",
          email: adminEmail,
          password: adminPassword,
          role: "admin",
          permissions: ["*"],
        }] : [])
      : resolveDemoSeedAccounts(env);

    // Bootstrap only: never overwrite persisted identity, permissions, password,
    // or disabled state when the process restarts.
    for (const account of seedAccounts) {
      const exists = rowSync("SELECT id FROM users WHERE id = @id OR email = @email", {
        id: account.id,
        email: account.email,
      });
      if (exists) continue;
      insertSync("users", {
        id: account.id,
        name: account.name,
        email: account.email,
        password_hash: bcrypt.hashSync(account.password, 10),
        role: account.role,
        permissions: json(account.permissions),
        status: "active",
        created_at: now(),
      });
    }

    // Migrations run before seed data; align newly-created demo users without
    // overwriting any persisted organization assignment.
    alignDefaultOrganizationMembership();

    if (count("users") === 0) {
      console.warn("No users exist. For first production startup, set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD together.");
    }
    if (env.SEED_DEMO_DATA !== "1") {
      return;
    }
    const {
      programs,
      portfolios,
      tasks,
      projects,
      products,
      requirements,
      tests,
      sprints,
      defects,
      documents,
      builds,
      releases,
    } = loadDemoData();
    if (count("programs") === 0) {
      programs.forEach((item) =>
        insertSync("programs", {
          id: item.id,
          name: item.name,
          owner: item.owner,
          status: item.status,
          health_score: item.healthScore,
          progress: item.progress,
          project_ids: json(item.projectIds || []),
          risks: json(item.risks || []),
          updated_at: item.updatedAt || now(),
        }),
      );
    }
    if (count("portfolios") === 0) {
      portfolios.forEach((item) =>
        insertSync("portfolios", {
          id: item.id,
          name: item.name,
          owner: item.owner,
          status: item.status,
          product_ids: json(item.productIds || []),
          roadmap: json(item.roadmap || []),
        }),
      );
    }
    if (count("projects") === 0) {
      projects.forEach((item) =>
        insertSync("projects", {
          id: item.id,
          name: item.name,
          status: item.status,
          health_score: item.healthScore,
          owner: item.owner,
          program_id: item.programId || null,
          product_id: item.productId || null,
          process_mode: item.processMode || "scrum",
          progress: item.progress,
          risk_count: item.riskCount,
          milestones: json(item.milestones || []),
          updated_at: item.updatedAt || now(),
        }),
      );
    }
    if (count("products") === 0) {
      products.forEach((item) =>
        insertSync("products", {
          id: item.id,
          name: item.name,
          owner: item.owner,
          version: item.version,
          stage: item.stage,
          description: item.description || "",
          image_url: item.imageUrl || null,
          system_name: item.systemName || "",
          system_version: item.systemVersion || "",
          application_version: item.applicationVersion || "",
          modules: json(item.modules || []),
          hardware_info: json(item.hardwareInfo || {}),
          system_info: json(item.systemInfo || {}),
          application_info: json(item.applicationInfo || {}),
          hardware_metrics: json(item.hardwareMetrics || []),
          system_metrics: json(item.systemMetrics || []),
          app_metrics: json(item.appMetrics || []),
          roadmap: json(item.roadmap || []),
        }),
      );
    }
    if (count("requirements") === 0) {
      requirements.forEach((item) =>
        insertSync("requirements", {
          id: item.id,
          title: item.title,
          description: item.description || "",
          status: item.status,
          priority: item.priority,
          project_id: item.projectId,
          product_id: item.productId || null,
          portfolio_id: item.portfolioId || null,
          parent_id: item.parentId || null,
          owner: item.owner,
          assignee: item.assignee || item.owner || null,
          assignee_role: item.assigneeRole || null,
          assignment_status: item.assignmentStatus || (item.assignee ? "assigned" : "unassigned"),
          completion: item.completion,
          linked_tasks: json(item.linkedTasks || []),
          acceptance_criteria: json(item.acceptanceCriteria || []),
        }),
      );
    }
    if (count("tasks") === 0) {
      tasks.forEach((item) =>
        insertSync("tasks", {
          id: item.id,
          title: item.title,
          status: item.status,
          status_text: item.statusText,
          project_id: item.projectId,
          owner: item.owner,
          description: item.description || "",
          due_date: item.dueDate,
          requirement_id: item.requirementId,
          progress: item.progress,
          blocker: item.blocker,
          type: item.type || "task",
          parent_id: item.parentId || null,
          wbs_code: item.wbsCode || "",
          kanban_column: item.kanbanColumn || item.status,
          sort_order: item.sortOrder || 0,
          estimated_hours: item.estimatedHours || 0,
          actual_hours: item.actualHours || 0,
          remaining_hours: item.remainingHours ?? Math.max(0, (item.estimatedHours || 0) - (item.actualHours || 0)),
          assignee_role: item.assigneeRole || null,
          source_type: item.sourceType || null,
          source_id: item.sourceId || null,
        }),
      );
    }
    if (count("test_cases") === 0) {
      tests.forEach((item) =>
        insertSync("test_cases", {
          id: item.id,
          name: item.name,
          requirement_id: item.requirementId,
          project_id: item.projectId,
          status: item.status,
          owner: item.owner,
          assignee_role: item.assigneeRole || null,
          total_cases: item.totalCases,
          passed_cases: item.passedCases,
          failed_cases: item.failedCases,
          blocked_cases: item.blockedCases,
        }),
      );
    }
    if (count("documents") === 0) {
      documents.forEach((item) =>
        insertSync("documents", {
          id: item.id,
          title: item.title,
          type: item.type,
          category: item.category || "project",
          version: item.version,
          ai_status: item.aiStatus,
          owner: item.owner,
          owner_role: item.ownerRole || "pm",
          project_id: item.projectId || null,
          updated_at: item.updatedAt || now(),
          linked_requirements: json(item.linkedRequirements || []),
          risks: json(item.risks || []),
          file_name: item.fileName || null,
          file_size: item.fileSize || 0,
          file_type: item.fileType || null,
          storage_key: item.storedFile || null,
          content: "",
        }),
      );
    }
    if (count("sprints") === 0) {
      sprints.forEach((item) =>
        insertSync("sprints", {
          id: item.id,
          project_id: item.projectId,
          name: item.name,
          goal: item.goal || "",
          status: item.status,
          start_date: item.startDate || null,
          end_date: item.endDate || null,
        }),
      );
    }
    if (count("defects") === 0) {
      defects.forEach((item) =>
        insertSync("defects", {
          id: item.id,
          title: item.title,
          severity: item.severity,
          status: item.status,
          project_id: item.projectId,
          requirement_id: item.requirementId || null,
          assignee: item.assignee || null,
          assignee_role: item.assigneeRole || null,
          found_in_build: item.foundInBuild || null,
          affected_version: item.affectedVersion || null,
          reporter: item.reporter || null,
        }),
      );
    }
    if (count("builds") === 0) {
      builds.forEach((item) =>
        insertSync("builds", {
          id: item.id,
          project_id: item.projectId,
          name: item.name,
          version: item.version || null,
          build_date: item.buildDate || null,
          status: item.status,
          linked_stories: json(item.linkedStories || []),
          linked_bugs: json(item.linkedBugs || []),
          scm_hash: item.scmHash || null,
          creator: item.creator || null,
          notes: item.notes || null,
          created_at: now(),
        }),
      );
    }
    if (count("releases") === 0) {
      releases.forEach((item) =>
        insertSync("releases", {
          id: item.id,
          product_id: item.productId || null,
          name: item.name,
          version: item.version || null,
          release_date: item.releaseDate || null,
          build_id: item.buildId || null,
          release_type: item.releaseType || "official",
          linked_stories: json(item.linkedStories || []),
          linked_bugs: json(item.linkedBugs || []),
          release_notes: item.releaseNotes || null,
          creator: item.creator || null,
          status: item.status,
          created_at: now(),
        }),
      );
    }
  }

  return {
    alignDefaultOrganizationMembership,
    seed,
  };
}

module.exports = {
  DEFAULT_DEPARTMENT_BY_ROLE,
  createSeedService,
};
