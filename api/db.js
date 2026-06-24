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
  organization,
  aiSummaries,
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
      created_at TEXT NOT NULL
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
      modules TEXT NOT NULL,
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
      actual_hours REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      requirement_id TEXT,
      project_id TEXT,
      status TEXT NOT NULL,
      owner TEXT NOT NULL,
      total_cases INTEGER NOT NULL,
      passed_cases INTEGER NOT NULL,
      failed_cases INTEGER NOT NULL,
      blocked_cases INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      version TEXT NOT NULL,
      ai_status TEXT NOT NULL,
      owner TEXT NOT NULL,
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
      assignee TEXT
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
  `);
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
  const adminExists = row("SELECT id FROM users WHERE email = @email", { email: "admin@example.com" });
  const pmExists = row("SELECT id FROM users WHERE email = @email", { email: "pm@example.com" });

  if (adminExists) {
    run("UPDATE users SET name = @name, permissions = @permissions WHERE email = @email", {
      name: "系统管理员",
      permissions: json(["*"]),
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
      created_at: now(),
    });
  }

  if (pmExists) {
    run("UPDATE users SET name = @name, permissions = @permissions WHERE email = @email", {
      name: "项目经理",
      permissions: json(["project:*", "requirement:*", "document:*", "ai:*", "audit:read"]),
      email: "pm@example.com",
    });
  } else if (pmPassword) {
    insert("users", {
      id: "USR-PM",
      name: "项目经理",
      email: "pm@example.com",
      password_hash: bcrypt.hashSync(pmPassword, 10),
      role: "pm",
      permissions: json(["project:*", "requirement:*", "document:*", "ai:*", "audit:read"]),
      created_at: now(),
    });
  }

  if (count("users") === 0) {
    console.warn("No seed users created (production mode without SEED_*_PASSWORD). Create users manually.");
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
        modules: json(item.modules || []),
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
        owner: item.owner,
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
        version: item.version,
        ai_status: item.aiStatus,
        owner: item.owner,
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
    status: item.status,
    healthScore: item.health_score,
    owner: item.owner,
    programId: item.program_id,
    productId: item.product_id,
    processMode: item.process_mode,
    progress: item.progress,
    riskCount: item.risk_count,
    milestones: parse(item.milestones, []),
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
    owner: item.owner,
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
    version: item.version,
    aiStatus: item.ai_status,
    owner: item.owner,
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
    severity: item.severity,
    status: item.status,
    projectId: item.project_id,
    requirementId: item.requirement_id,
    assignee: item.assignee,
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
  mapProject,
  mapRequirement,
  mapDocument,
  mapTask,
  mapSprint,
  mapDefect,
  STORAGE_DIR,
  organization,
  aiSummaries,
};
