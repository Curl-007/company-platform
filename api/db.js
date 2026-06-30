const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");
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
  aiSummaries,
  builds,
  releases,
} = require("./data");

const DB_FILE = path.join(__dirname, "app.db");
const STORAGE_DIR = path.join(__dirname, "storage");
const db = new DatabaseSync(DB_FILE);

function exec(sql) {
  db.exec(sql);
}

function json(value, fallback = null) {
  if (value === undefined) return fallback;
  return JSON.stringify(value);
}

function parse(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function now() {
  return new Date().toISOString();
}

function initDb() {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      permissions TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      phone TEXT DEFAULT '',
      position TEXT DEFAULT '',
      department TEXT DEFAULT '',
      bio TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      status TEXT NOT NULL,
      health_score INTEGER NOT NULL,
      progress INTEGER NOT NULL,
      project_ids TEXT NOT NULL,
      risks TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portfolios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      status TEXT NOT NULL,
      product_ids TEXT NOT NULL,
      roadmap TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      health_score INTEGER NOT NULL,
      owner TEXT NOT NULL,
      program_id TEXT,
      product_id TEXT,
      process_mode TEXT NOT NULL,
      progress INTEGER NOT NULL,
      risk_count INTEGER NOT NULL,
      milestones TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      version TEXT NOT NULL,
      stage TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_url TEXT,
      system_name TEXT DEFAULT '',
      system_version TEXT DEFAULT '',
      application_version TEXT DEFAULT '',
      modules TEXT NOT NULL,
      hardware_info TEXT DEFAULT '{}',
      system_info TEXT DEFAULT '{}',
      application_info TEXT DEFAULT '{}',
      hardware_metrics TEXT DEFAULT '[]',
      system_metrics TEXT DEFAULT '[]',
      app_metrics TEXT DEFAULT '[]',
      roadmap TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS requirements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      project_id TEXT,
      product_id TEXT,
      portfolio_id TEXT,
      owner TEXT NOT NULL,
      assignee TEXT,
      assignee_role TEXT,
      assignment_status TEXT DEFAULT 'unassigned',
      completion INTEGER NOT NULL,
      linked_tasks TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      status_text TEXT NOT NULL,
      project_id TEXT NOT NULL,
      owner TEXT NOT NULL,
      description TEXT DEFAULT '',
      due_date TEXT,
      requirement_id TEXT,
      progress INTEGER NOT NULL,
      blocker TEXT,
      type TEXT NOT NULL,
      parent_id TEXT,
      wbs_code TEXT,
      kanban_column TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      estimated_hours REAL NOT NULL,
      actual_hours REAL NOT NULL,
      assignee_role TEXT,
      source_type TEXT,
      source_id TEXT
    );
    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      requirement_id TEXT,
      project_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      owner TEXT NOT NULL,
      assignee_role TEXT,
      total_cases INTEGER NOT NULL DEFAULT 0,
      passed_cases INTEGER NOT NULL DEFAULT 0,
      failed_cases INTEGER NOT NULL DEFAULT 0,
      blocked_cases INTEGER NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      steps TEXT DEFAULT '',
      expected_result TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      test_case_id TEXT NOT NULL,
      result TEXT NOT NULL,
      notes TEXT DEFAULT '',
      executed_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'project',
      version TEXT NOT NULL,
      ai_status TEXT NOT NULL,
      owner TEXT NOT NULL,
      owner_role TEXT DEFAULT 'pm',
      project_id TEXT,
      updated_at TEXT NOT NULL,
      linked_requirements TEXT NOT NULL,
      risks TEXT NOT NULL,
      file_name TEXT,
      file_size INTEGER,
      file_type TEXT,
      storage_key TEXT,
      content TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS objects (
      id TEXT PRIMARY KEY,
      bucket TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_logs (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL,
      project TEXT,
      content TEXT NOT NULL,
      blockers TEXT,
      next_plan TEXT,
      analysis TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_jobs (
      job_id TEXT PRIMARY KEY,
      scene TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL,
      current_step TEXT NOT NULL,
      source_type TEXT,
      source_id TEXT,
      goals TEXT NOT NULL,
      result TEXT NOT NULL,
      evidence TEXT NOT NULL,
      written_requirement_id TEXT,
      created_at TEXT NOT NULL,
      confirmed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      goal TEXT,
      status TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT
    );
    CREATE TABLE IF NOT EXISTS defects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      project_id TEXT NOT NULL,
      requirement_id TEXT,
      assignee TEXT,
      assignee_role TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_name TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      before_json TEXT,
      after_json TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS burndown_snapshots (
      id TEXT PRIMARY KEY,
      sprint_id TEXT NOT NULL,
      date TEXT NOT NULL,
      remaining_hours REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS builds (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT,
      build_date TEXT,
      status TEXT NOT NULL DEFAULT 'building',
      linked_stories TEXT DEFAULT '[]',
      linked_bugs TEXT DEFAULT '[]',
      scm_hash TEXT,
      creator TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS releases (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      name TEXT NOT NULL,
      version TEXT,
      release_date TEXT,
      build_id TEXT,
      release_type TEXT DEFAULT 'official',
      linked_stories TEXT DEFAULT '[]',
      linked_bugs TEXT DEFAULT '[]',
      release_notes TEXT,
      creator TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS release_approvals (
      id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      comment TEXT DEFAULT '',
      approver_id TEXT,
      approver_name TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rollback_records (
      id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      impact TEXT DEFAULT '',
      plan TEXT DEFAULT '',
      operator_id TEXT,
      operator_name TEXT,
      created_at TEXT NOT NULL
    );
  `);
  try { exec("ALTER TABLE test_cases ADD COLUMN description TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE test_cases ADD COLUMN steps TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE test_cases ADD COLUMN expected_result TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  // G-1/G-2: sprint & assignment fields — nullable for backward compat with existing rows.
  try { exec("ALTER TABLE tasks ADD COLUMN sprint_id TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE tasks ADD COLUMN assignee_id TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE tasks ADD COLUMN dependency_ids TEXT DEFAULT '[]'"); } catch (e) { /* column already exists */ }
  // Burndown: remaining (left) hours — completes the estimate/consumed/left trio.
  try { exec("ALTER TABLE tasks ADD COLUMN remaining_hours REAL DEFAULT 0"); } catch (e) { /* column already exists */ }
  // Requirement hierarchy: parent_id for epic → story decomposition.
  try { exec("ALTER TABLE requirements ADD COLUMN parent_id TEXT"); } catch (e) { /* column already exists */ }
  // G-4: status column for existing users databases created before the column was added to CREATE TABLE.
  try { exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE users ADD COLUMN position TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE users ADD COLUMN department TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  // G-10/G-12: AI Job state machine fields — nullable for backward compat with existing rows.
  try { exec("ALTER TABLE ai_jobs ADD COLUMN error_message TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE ai_jobs ADD COLUMN retry_count INTEGER DEFAULT 0"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE ai_jobs ADD COLUMN started_at TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE ai_jobs ADD COLUMN failed_at TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE ai_jobs ADD COLUMN rejected_at TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE ai_jobs ADD COLUMN rejected_reason TEXT"); } catch (e) { /* column already exists */ }
  // Build/release traceability: which build a task belongs to, which build a defect was found in.
  try { exec("ALTER TABLE tasks ADD COLUMN build_id TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE defects ADD COLUMN found_in_build TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE defects ADD COLUMN affected_version TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE defects ADD COLUMN reporter TEXT"); } catch (e) { /* column already exists */ }
  // Project edit enhancement: 5 new columns for project detail (12-综合升级设计方案 §3.1)
  try { exec("ALTER TABLE projects ADD COLUMN code TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE projects ADD COLUMN description TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE projects ADD COLUMN start_date TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE projects ADD COLUMN end_date TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE projects ADD COLUMN source_path TEXT"); } catch (e) { /* column already exists */ }
  // Test management enhancement: description column for defects (§3.5)
  try { exec("ALTER TABLE defects ADD COLUMN description TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN description TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN image_url TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN system_name TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN system_version TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN application_version TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN hardware_info TEXT DEFAULT '{}'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN system_info TEXT DEFAULT '{}'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN application_info TEXT DEFAULT '{}'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN hardware_metrics TEXT DEFAULT '[]'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN system_metrics TEXT DEFAULT '[]'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE products ADD COLUMN app_metrics TEXT DEFAULT '[]'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE work_logs ADD COLUMN log_date TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE work_logs ADD COLUMN source_document_id TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE work_logs ADD COLUMN file_name TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE work_logs ADD COLUMN file_type TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE work_logs ADD COLUMN week_key TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE work_logs ADD COLUMN weekly_summary TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE work_logs ADD COLUMN role TEXT DEFAULT 'dev'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE work_logs ADD COLUMN project_id TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE requirements ADD COLUMN assignee TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE requirements ADD COLUMN assignee_role TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE requirements ADD COLUMN assignment_status TEXT DEFAULT 'unassigned'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE tasks ADD COLUMN description TEXT DEFAULT ''"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE tasks ADD COLUMN assignee_role TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE tasks ADD COLUMN source_type TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE tasks ADD COLUMN source_id TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE test_cases ADD COLUMN assignee_role TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE documents ADD COLUMN category TEXT NOT NULL DEFAULT 'project'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE documents ADD COLUMN owner_role TEXT DEFAULT 'pm'"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE documents ADD COLUMN project_id TEXT"); } catch (e) { /* column already exists */ }
  try { exec("ALTER TABLE defects ADD COLUMN assignee_role TEXT"); } catch (e) { /* column already exists */ }
  seed();
}

function count(table) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

function insert(table, row) {
  const keys = Object.keys(row);
  const placeholders = keys.map((key) => `@${key}`).join(", ");
  db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`).run(row);
}

function seed() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? null : "Admin@123");
  const pmPassword = process.env.SEED_PM_PASSWORD || (process.env.NODE_ENV === "production" ? null : "Pm@12345");
  const devPassword = process.env.SEED_DEV_PASSWORD || (process.env.NODE_ENV === "production" ? null : "Dev@12345");
  const qaPassword = process.env.SEED_QA_PASSWORD || (process.env.NODE_ENV === "production" ? null : "Qa@12345");
  const pdmPassword = process.env.SEED_PDM_PASSWORD || (process.env.NODE_ENV === "production" ? null : "Pdm@12345");
  const adminExists = row("SELECT id FROM users WHERE email = @email", { email: "admin@example.com" });
  const pmExists = row("SELECT id FROM users WHERE email = @email", { email: "pm@example.com" });
  const devExists = row("SELECT id FROM users WHERE email = @email", { email: "dev@example.com" });
  const qaExists = row("SELECT id FROM users WHERE email = @email", { email: "qa@example.com" });
  const pdmExists = row("SELECT id FROM users WHERE email = @email", { email: "pdm@example.com" });

  if (adminExists) {
    run("UPDATE users SET name = @name, permissions = @permissions, status = @status WHERE email = @email", {
      name: "系统管理员",
      permissions: json(["*"]),
      status: "active",
      email: "admin@example.com",
    });
  } else if (adminPassword) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Seeding demo admin (admin@example.com) — remove before production or set SEED_ADMIN_PASSWORD.");
    }
    insert("users", {
      id: "USR-ADMIN",
      name: "系统管理员",
      email: "admin@example.com",
      password_hash: bcrypt.hashSync(adminPassword, 10),
      role: "admin",
      permissions: json(["*"]),
      status: "active",
      created_at: now(),
    });
  }

  if (pmExists) {
    run("UPDATE users SET name = @name, permissions = @permissions, status = @status WHERE email = @email", {
      name: "项目经理",
      permissions: json(["project:*", "requirement:*", "document:*", "ai:*", "audit:read", "source:read"]),
      status: "active",
      email: "pm@example.com",
    });
  } else if (pmPassword) {
    insert("users", {
      id: "USR-PM",
      name: "项目经理",
      email: "pm@example.com",
      password_hash: bcrypt.hashSync(pmPassword, 10),
      role: "pm",
      permissions: json(["project:*", "requirement:*", "document:*", "ai:*", "audit:read", "source:read"]),
      status: "active",
      created_at: now(),
    });
  }

  // Dev engineer: sees projects, requirements, builds, documents, my-work, dynamic.
  if (devExists) {
    run("UPDATE users SET name = @name, role = @role, permissions = @permissions, status = @status WHERE email = @email", {
      name: "开发工程师",
      role: "dev",
      permissions: json(["project:read", "project:update", "requirement:read", "build:*", "document:*", "audit:read"]),
      status: "active",
      email: "dev@example.com",
    });
  } else if (devPassword) {
    insert("users", {
      id: "USR-DEV",
      name: "开发工程师",
      email: "dev@example.com",
      password_hash: bcrypt.hashSync(devPassword, 10),
      role: "dev",
      permissions: json(["project:read", "project:update", "requirement:read", "build:*", "document:*", "audit:read"]),
      status: "active",
      created_at: now(),
    });
  }

  // QA engineer: sees testing, defects, documents, my-work, dynamic.
  if (qaExists) {
    run("UPDATE users SET name = @name, role = @role, permissions = @permissions, status = @status WHERE email = @email", {
      name: "测试工程师",
      role: "qa",
      permissions: json(["test:*", "defect:*", "document:read", "audit:read"]),
      status: "active",
      email: "qa@example.com",
    });
  } else if (qaPassword) {
    insert("users", {
      id: "USR-QA",
      name: "测试工程师",
      email: "qa@example.com",
      password_hash: bcrypt.hashSync(qaPassword, 10),
      role: "qa",
      permissions: json(["test:*", "defect:*", "document:read", "audit:read"]),
      status: "active",
      created_at: now(),
    });
  }

  if (pdmExists) {
    run("UPDATE users SET name = @name, role = @role, permissions = @permissions, status = @status WHERE email = @email", {
      name: "产品经理",
      role: "pdm",
      permissions: json(["product:*", "document:*", "project:read", "requirement:*", "audit:read"]),
      status: "active",
      email: "pdm@example.com",
    });
  } else if (pdmPassword) {
    insert("users", {
      id: "USR-PDM",
      name: "产品经理",
      email: "pdm@example.com",
      password_hash: bcrypt.hashSync(pdmPassword, 10),
      role: "pdm",
      permissions: json(["product:*", "document:*", "project:read", "requirement:*", "audit:read"]),
      status: "active",
      created_at: now(),
    });
  }

  if (count("users") === 0) {
    console.warn("No seed users created (production mode without SEED_*_PASSWORD). Create users manually.");
  }
  if (process.env.SEED_DEMO_DATA !== "1") {
    return;
  }
  if (count("programs") === 0) {
    programs.forEach((item) =>
      insert("programs", {
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
      insert("portfolios", {
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
      insert("projects", {
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
      insert("products", {
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
      insert("requirements", {
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
      insert("tasks", {
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
      insert("test_cases", {
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
      insert("documents", {
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
      insert("sprints", {
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
      insert("defects", {
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
      insert("builds", {
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
      insert("releases", {
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

function rows(sql, params = {}) {
  return db.prepare(sql).all(params);
}

function row(sql, params = {}) {
  return db.prepare(sql).get(params);
}

function run(sql, params = {}) {
  return db.prepare(sql).run(params);
}

function mapProject(item) {
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    description: item.description,
    status: item.status,
    healthScore: item.health_score,
    owner: item.owner,
    programId: item.program_id,
    productId: item.product_id,
    processMode: item.process_mode,
    progress: item.progress,
    riskCount: item.risk_count,
    milestones: parse(item.milestones, []),
    startDate: item.start_date,
    endDate: item.end_date,
    sourcePath: item.source_path,
    updatedAt: item.updated_at,
  };
}

function mapRequirement(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    projectId: item.project_id,
    productId: item.product_id,
    portfolioId: item.portfolio_id,
    parentId: item.parent_id || null,
    owner: item.owner,
    assignee: item.assignee || null,
    assigneeRole: item.assignee_role || null,
    assignmentStatus: item.assignment_status || "unassigned",
    completion: item.completion,
    linkedTasks: parse(item.linked_tasks, []),
    acceptanceCriteria: parse(item.acceptance_criteria, []),
  };
}

function mapDocument(item) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    category: item.category || "project",
    version: item.version,
    aiStatus: item.ai_status,
    owner: item.owner,
    ownerRole: item.owner_role || null,
    projectId: item.project_id || null,
    updatedAt: item.updated_at,
    linkedRequirements: parse(item.linked_requirements, []),
    risks: parse(item.risks, []),
    fileName: item.file_name,
    fileSize: item.file_size,
    fileType: item.file_type,
    storedFile: item.storage_key,
    content: item.content,
  };
}

function mapTask(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description || null,
    status: item.status,
    statusText: item.status_text,
    projectId: item.project_id,
    owner: item.owner,
    dueDate: item.due_date,
    requirementId: item.requirement_id,
    progress: item.progress,
    blocker: item.blocker,
    type: item.type,
    parentId: item.parent_id,
    wbsCode: item.wbs_code,
    kanbanColumn: item.kanban_column,
    sortOrder: item.sort_order,
    estimatedHours: item.estimated_hours,
    actualHours: item.actual_hours,
    remainingHours: item.remaining_hours ?? 0,
    sprintId: item.sprint_id,
    assigneeId: item.assignee_id,
    assigneeRole: item.assignee_role || null,
    dependencyIds: parse(item.dependency_ids, []),
    buildId: item.build_id || null,
    sourceType: item.source_type || null,
    sourceId: item.source_id || null,
  };
}

function mapSprint(item) {
  return {
    id: item.id,
    projectId: item.project_id,
    name: item.name,
    goal: item.goal,
    status: item.status,
    startDate: item.start_date,
    endDate: item.end_date,
  };
}

function mapDefect(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description || null,
    severity: item.severity,
    status: item.status,
    projectId: item.project_id,
    requirementId: item.requirement_id,
    assignee: item.assignee,
    assigneeRole: item.assignee_role || null,
    foundInBuild: item.found_in_build || null,
    affectedVersion: item.affected_version || null,
    reporter: item.reporter || null,
  };
}

function mapTestCase(item) {
  return {
    id: item.id,
    title: item.name,
    name: item.name,
    requirementId: item.requirement_id,
    projectId: item.project_id,
    status: item.status,
    owner: item.owner,
    assigneeRole: item.assignee_role || null,
    totalCases: item.total_cases,
    passedCases: item.passed_cases,
    failedCases: item.failed_cases,
    blockedCases: item.blocked_cases,
    description: item.description || "",
    steps: item.steps || "",
    expectedResult: item.expected_result || "",
  };
}

function mapTestRun(item) {
  return {
    id: item.id,
    testCaseId: item.test_case_id,
    result: item.result,
    notes: item.notes,
    executedBy: item.executed_by,
    createdAt: item.created_at,
  };
}

function mapUser(item) {
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    email: item.email,
    role: item.role,
    permissions: parse(item.permissions, []),
    status: item.status,
    phone: item.phone || "",
    position: item.position || "",
    department: item.department || "",
    bio: item.bio || "",
    createdAt: item.created_at,
  };
}

function mapBuild(item) {
  return {
    id: item.id,
    projectId: item.project_id,
    name: item.name,
    version: item.version,
    buildDate: item.build_date,
    status: item.status,
    linkedStories: parse(item.linked_stories, []),
    linkedBugs: parse(item.linked_bugs, []),
    scmHash: item.scm_hash,
    creator: item.creator,
    notes: item.notes,
    createdAt: item.created_at,
  };
}

function mapRelease(item) {
  return {
    id: item.id,
    productId: item.product_id,
    name: item.name,
    version: item.version,
    releaseDate: item.release_date,
    buildId: item.build_id,
    releaseType: item.release_type,
    linkedStories: parse(item.linked_stories, []),
    linkedBugs: parse(item.linked_bugs, []),
    releaseNotes: item.release_notes,
    creator: item.creator,
    status: item.status,
    createdAt: item.created_at,
  };
}

function mapProduct(item) {
  const imageUrls = parse(item.image_url, null);
  const normalizedImageUrls = Array.isArray(imageUrls)
    ? imageUrls.filter(Boolean)
    : item.image_url
      ? [item.image_url]
      : [];
  return {
    id: item.id,
    name: item.name,
    owner: item.owner,
    version: item.version,
    stage: item.stage,
    description: item.description || "",
    imageUrl: normalizedImageUrls[0] || null,
    imageUrls: normalizedImageUrls,
    systemName: item.system_name || "",
    systemVersion: item.system_version || "",
    applicationVersion: item.application_version || "",
    modules: parse(item.modules, []),
    hardwareInfo: parse(item.hardware_info, {}),
    systemInfo: parse(item.system_info, {}),
    applicationInfo: parse(item.application_info, {}),
    hardwareMetrics: parse(item.hardware_metrics, []),
    systemMetrics: parse(item.system_metrics, []),
    appMetrics: parse(item.app_metrics, []),
    roadmap: parse(item.roadmap, []),
  };
}

function audit(actor, action, resourceType, resourceId, beforeValue, afterValue, ip) {
  insert("audit_logs", {
    id: `AUD-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    actor_id: actor?.id || null,
    actor_name: actor?.name || "anonymous",
    action,
    resource_type: resourceType,
    resource_id: resourceId || null,
    before_json: json(beforeValue),
    after_json: json(afterValue),
    ip: ip || null,
    created_at: now(),
  });
}

/**
 * Record (or upsert) the daily remaining-hours snapshot for a sprint.
 * Called whenever a task's hours change, so the burndown chart has a data
 * point for "today". One snapshot per sprint per calendar day.
 */
function recordBurndownSnapshot(sprintId) {
  if (!sprintId) return;
  const today = now().slice(0, 10);
  // Sum remaining hours across all tasks in this sprint.
  const total = rows("SELECT remaining_hours AS h FROM tasks WHERE sprint_id = @sid", { sid: sprintId })
    .reduce((sum, t) => sum + (Number(t.h) || 0), 0);
  // Upsert: one row per sprint+date. Try update first; insert if missing.
  const existing = row("SELECT id FROM burndown_snapshots WHERE sprint_id = @sid AND date = @date", { sid: sprintId, date: today });
  if (existing) {
    run("UPDATE burndown_snapshots SET remaining_hours = @h WHERE id = @id", { id: existing.id, h: total });
  } else {
    insert("burndown_snapshots", {
      id: `BURN-${sprintId}-${today}`,
      sprint_id: sprintId,
      date: today,
      remaining_hours: total,
      created_at: now(),
    });
  }
}

/**
 * Build burndown chart data for a sprint: ideal line (linear from total
 * estimate to zero across the sprint span) + actual remaining line (from
 * snapshots). Falls back to a single point if no snapshots exist yet.
 */
function buildSprintBurndown(sprintId) {
  const sprint = row("SELECT * FROM sprints WHERE id = @id", { id: sprintId });
  if (!sprint) return null;
  const tasks = rows("SELECT * FROM tasks WHERE sprint_id = @sid", { sid: sprintId });
  const totalEstimate = tasks.reduce((sum, t) => sum + (Number(t.estimated_hours) || 0), 0);
  const snapshots = rows("SELECT * FROM burndown_snapshots WHERE sprint_id = @sid ORDER BY date ASC", { sid: sprintId });

  // Date span: sprint start → end (or today, whichever is later for the tail).
  const start = sprint.start_date ? sprint.start_date.slice(0, 10) : now().slice(0, 10);
  const end = sprint.end_date ? sprint.end_date.slice(0, 10) : now().slice(0, 10);

  // Build a map of date → remaining from snapshots.
  const snapByDate = {};
  snapshots.forEach((s) => { snapByDate[s.date] = s.remaining_hours; });

  // Ideal line: straight from totalEstimate on day 1 to 0 on last day.
  const days = enumerateDays(start, end);
  const ideal = days.map((date, i) => ({
    date,
    ideal: days.length > 1 ? Math.round(totalEstimate * (1 - i / (days.length - 1)) * 10) / 10 : totalEstimate,
  }));

  // Actual line: only include dates that have a snapshot (sparse), plus today's live value.
  const actual = snapshots.map((s) => ({ date: s.date, remaining: s.remaining_hours }));
  // Always append the current live total so the line extends to "now".
  const today = now().slice(0, 10);
  if (!snapByDate[today]) {
    const liveTotal = tasks.reduce((sum, t) => sum + (Number(t.remaining_hours) || 0), 0);
    actual.push({ date: today, remaining: liveTotal });
  }

  return { sprintId, startDate: start, endDate: end, totalEstimate, ideal, actual, taskCount: tasks.length };
}

function enumerateDays(start, end) {
  const out = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return [start];
  const MAX_DAYS = 120; // safety cap
  let count = 0;
  for (let d = new Date(s); d <= e && count < MAX_DAYS; d.setUTCDate(d.getUTCDate() + 1), count++) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out.length ? out : [start];
}

module.exports = {
  db,
  initDb,
  insert,
  rows,
  row,
  run,
  json,
  parse,
  now,
  audit,
  recordBurndownSnapshot,
  buildSprintBurndown,
  mapProject,
  mapRequirement,
  mapDocument,
  mapTask,
  mapSprint,
  mapDefect,
  mapTestCase,
  mapTestRun,
  mapUser,
  mapProduct,
  mapBuild,
  mapRelease,
  STORAGE_DIR,
  aiSummaries,
};
