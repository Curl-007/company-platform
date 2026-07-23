const express = require("express");
const { filterAsync, mapAsync } = require("../../lib/asyncIter");

const PROGRAM_STATUSES = new Set(["planning", "active", "on_hold", "done", "archived"]);
const PORTFOLIO_STATUSES = new Set(["planned", "design", "development", "evaluating", "released", "done"]);
const GOAL_STATUSES = new Set(["draft", "active", "on_hold", "achieved", "closed"]);
const GOAL_TRANSITIONS = Object.freeze({
  draft: new Set(["active", "closed"]),
  active: new Set(["on_hold", "achieved", "closed"]),
  on_hold: new Set(["active", "closed"]),
  achieved: new Set(["closed"]),
  closed: new Set(),
});

function asTrimmed(value, maxLength = 5000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function ids(value, maxItems = 200) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => asTrimmed(item, 128)).filter(Boolean))].slice(0, maxItems);
}

function riskItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asTrimmed(item, 1000)).filter(Boolean).slice(0, 100);
}

function roadmapItems(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item) => ({
    title: asTrimmed(item?.title, 300),
    version: asTrimmed(item?.version, 100),
    quarter: asTrimmed(item?.quarter, 100),
    status: asTrimmed(item?.status, 50) || "planned",
  })).filter((item) => item.title || item.version || item.quarter);
}

function metricItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asTrimmed(item, 1000)).filter(Boolean).slice(0, 30);
}

function createStrategyRouter({
  audit,
  canAccessProject,
  canManageProject,
  fail,
  hasPermission,
  insert,
  json,
  mapProduct,
  mapProject,
  nextId,
  now,
  ok,
  parse,
  requireAnyPermission,
  requirePermission,
  row,
  rows,
  run,
  transaction = async (work) => work(),
}) {
  const router = express.Router();

  function canReadAllProducts(user) {
    return hasPermission(user, "product:*") || hasPermission(user, "project:*");
  }

  async function visibleProducts(user) {
    const allProducts = (await rows("SELECT * FROM products")).map(mapProduct);
    if (canReadAllProducts(user)) return allProducts;
    const projects = await rows("SELECT id, product_id FROM projects WHERE deleted_at IS NULL");
    const visible = await filterAsync(projects, async (project) => await canAccessProject(user, project.id));
    const visibleIds = new Set(visible.map((project) => project.product_id).filter(Boolean));
    return allProducts.filter((product) => visibleIds.has(product.id));
  }

  // Single source of truth: projects.program_id. programs.project_ids is a denormalized cache.
  async function allProgramProjectIds(program) {
    return (await rows(
      "SELECT id FROM projects WHERE program_id = @programId AND deleted_at IS NULL ORDER BY id",
      { programId: program.id },
    )).map((project) => project.id);
  }

  async function syncProgramProjectIdsCache(programId, projectIds, updatedAt) {
    await run(
      "UPDATE programs SET project_ids = @projectIds, updated_at = @updatedAt WHERE id = @id",
      { id: programId, projectIds: json(projectIds), updatedAt },
    );
  }

  async function projectProgramAssignments(projectIds) {
    const assignments = new Map();
    for (const projectId of projectIds) {
      const project = await row("SELECT id, program_id FROM projects WHERE id = @id", { id: projectId });
      if (project) assignments.set(projectId, project.program_id || null);
    }
    return assignments;
  }

  async function refreshProgramCaches(programIds, updatedAt) {
    for (const programId of programIds) {
      if (!programId) continue;
      const program = await row("SELECT id FROM programs WHERE id = @id", { id: programId });
      if (!program) continue;
      const linkedIds = await allProgramProjectIds(program);
      await syncProgramProjectIdsCache(program.id, linkedIds, updatedAt);
    }
  }

  async function mapProgram(program, user) {
    const allProjects = await rows("SELECT id FROM projects WHERE deleted_at IS NULL");
    const allowed = await filterAsync(allProjects, async (project) => await canAccessProject(user, project.id));
    const allowedIds = new Set(allowed.map((project) => project.id));
    const projectIds = (await allProgramProjectIds(program)).filter((id) => allowedIds.has(id));
    const linkedProjects = [];
    for (const id of projectIds) {
      const project = await row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id });
      if (project) linkedProjects.push(mapProject(project));
    }
    const derivedRisks = linkedProjects
      .filter((project) => Number(project.riskCount || 0) > 0)
      .map((project) => `${project.name}: ${project.riskCount} risks`);
    const storedRisks = riskItems(parse(program.risks, []));
    const healthScore = linkedProjects.length
      ? Math.round(linkedProjects.reduce((sum, project) => sum + Number(project.healthScore || 0), 0) / linkedProjects.length)
      : Number(program.health_score || 0);
    const progress = linkedProjects.length
      ? Math.round(linkedProjects.reduce((sum, project) => sum + Number(project.progress || 0), 0) / linkedProjects.length)
      : Number(program.progress || 0);
    return {
      id: program.id,
      name: program.name,
      objective: program.objective || "",
      owner: program.owner,
      status: program.status,
      healthScore,
      progress,
      projectIds,
      risks: [...new Set([...storedRisks, ...derivedRisks])],
      updatedAt: program.updated_at,
    };
  }

  async function canReadProgram(program, user, mappedProgram = null) {
    if (hasPermission(user, "project:*") || hasPermission(user, "product:*")) return true;
    const visibleProgram = mappedProgram || await mapProgram(program, user);
    return visibleProgram.projectIds.length > 0;
  }

  async function mapPortfolio(portfolio, user) {
    const visibleIds = new Set((await visibleProducts(user)).map((product) => product.id));
    return {
      id: portfolio.id,
      name: portfolio.name,
      objective: portfolio.objective || "",
      owner: portfolio.owner,
      status: portfolio.status,
      productIds: ids(parse(portfolio.product_ids, [])).filter((id) => visibleIds.has(id)),
      roadmap: roadmapItems(parse(portfolio.roadmap, [])),
    };
  }

  async function assertProjectLinks(projectIds, user) {
    const missing = await filterAsync(projectIds, async (id) => !(await row("SELECT id FROM projects WHERE id = @id AND deleted_at IS NULL", { id })));
    if (missing.length) return { error: `Projects do not exist: ${missing.join(", ")}` };
    const inaccessible = await filterAsync(projectIds, async (id) => !(await canManageProject(user, id)));
    if (inaccessible.length) return { error: `Projects cannot be managed: ${inaccessible.join(", ")}`, status: 403 };
    return null;
  }

  async function assertProductLinks(productIds) {
    const missing = await filterAsync(productIds, async (id) => !(await row("SELECT id FROM products WHERE id = @id", { id })));
    return missing.length ? `Products do not exist: ${missing.join(", ")}` : null;
  }

  async function assertGoalLinks(programIds, portfolioIds) {
    const missingPrograms = await filterAsync(programIds, async (id) => !(await row("SELECT id FROM programs WHERE id = @id", { id })));
    const missingPortfolios = await filterAsync(portfolioIds, async (id) => !(await row("SELECT id FROM portfolios WHERE id = @id", { id })));
    if (missingPrograms.length || missingPortfolios.length) {
      return `Strategic links do not exist: ${[...missingPrograms, ...missingPortfolios].join(", ")}`;
    }
    return null;
  }

  async function mapGoal(goal, user) {
    const programIds = ids(parse(goal.program_ids, []));
    const portfolioIds = ids(parse(goal.portfolio_ids, []));
    const programs = await rows("SELECT * FROM programs");
    const visibleProgramIds = new Set();
    for (const program of programs) {
      const mapped = await mapProgram(program, user);
      if (mapped.projectIds.length || hasPermission(user, "project:*") || hasPermission(user, "product:*")) {
        visibleProgramIds.add(mapped.id);
      }
    }
    const portfolios = await rows("SELECT * FROM portfolios");
    const visiblePortfolioIds = new Set();
    for (const portfolio of portfolios) {
      const mapped = await mapPortfolio(portfolio, user);
      if (mapped.productIds.length || canReadAllProducts(user)) {
        visiblePortfolioIds.add(mapped.id);
      }
    }
    return {
      id: goal.id,
      name: goal.name,
      objective: goal.objective,
      owner: goal.owner,
      status: goal.status,
      periodStart: goal.period_start || null,
      periodEnd: goal.period_end || null,
      successMetrics: metricItems(parse(goal.success_metrics, [])),
      programIds: programIds.filter((id) => visibleProgramIds.has(id)),
      portfolioIds: portfolioIds.filter((id) => visiblePortfolioIds.has(id)),
      createdAt: goal.created_at,
      updatedAt: goal.updated_at,
    };
  }

  router.get("/strategic-goals", requireAnyPermission(["product:*", "project:*", "project:read"]), async (req, res) => {
    const canReadAll = hasPermission(req.user, "project:*") || hasPermission(req.user, "product:*");
    const goalRows = await rows("SELECT * FROM strategic_goals ORDER BY updated_at DESC");
    const goals = await mapAsync(goalRows, async (goal) => await mapGoal(goal, req.user));
    res.json(ok(canReadAll ? goals : goals.filter((goal) => goal.programIds.length || goal.portfolioIds.length)));
  });

  router.post("/strategic-goals", requirePermission("admin:*"), async (req, res) => {
    const name = asTrimmed(req.body?.name, 300);
    const owner = asTrimmed(req.body?.owner, 200);
    const objective = asTrimmed(req.body?.objective, 5000);
    const status = asTrimmed(req.body?.status, 50) || "draft";
    const programIds = ids(req.body?.programIds);
    const portfolioIds = ids(req.body?.portfolioIds);
    if (!name || !owner || !objective) return fail(res, 400, "VALIDATION_FAILED", "Goal name, owner, and objective are required.");
    if (!GOAL_STATUSES.has(status)) return fail(res, 400, "VALIDATION_FAILED", "Invalid goal status.");
    if (status !== "draft") return fail(res, 400, "VALIDATION_FAILED", "New strategic goals must start in draft status.");
    const linkError = await assertGoalLinks(programIds, portfolioIds);
    if (linkError) return fail(res, 400, "VALIDATION_FAILED", linkError);
    const createdAt = now();
    const goal = {
      id: await nextId("GOAL", "strategic_goals"), name, owner, objective, status,
      period_start: asTrimmed(req.body?.periodStart, 32) || null,
      period_end: asTrimmed(req.body?.periodEnd, 32) || null,
      success_metrics: json(metricItems(req.body?.successMetrics)),
      program_ids: json(programIds), portfolio_ids: json(portfolioIds), created_at: createdAt, updated_at: createdAt,
    };
    await insert("strategic_goals", goal);
    await audit(req.user, "strategic_goal.create", "strategic_goal", goal.id, null, goal, req.ip);
    res.status(201).json(ok(await mapGoal(goal, req.user)));
  });

  router.patch("/strategic-goals/:id", requirePermission("admin:*"), async (req, res) => {
    const before = await row("SELECT * FROM strategic_goals WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Strategic goal not found.");
    const name = req.body?.name === undefined ? before.name : asTrimmed(req.body.name, 300);
    const owner = req.body?.owner === undefined ? before.owner : asTrimmed(req.body.owner, 200);
    const objective = req.body?.objective === undefined ? before.objective : asTrimmed(req.body.objective, 5000);
    const status = req.body?.status === undefined ? before.status : asTrimmed(req.body.status, 50);
    const programIds = req.body?.programIds === undefined ? ids(parse(before.program_ids, [])) : ids(req.body.programIds);
    const portfolioIds = req.body?.portfolioIds === undefined ? ids(parse(before.portfolio_ids, [])) : ids(req.body.portfolioIds);
    if (!name || !owner || !objective) return fail(res, 400, "VALIDATION_FAILED", "Goal name, owner, and objective are required.");
    if (!GOAL_STATUSES.has(status)) return fail(res, 400, "VALIDATION_FAILED", "Invalid goal status.");
    if (status !== before.status && !GOAL_TRANSITIONS[before.status]?.has(status)) return fail(res, 409, "STATE_TRANSITION_NOT_ALLOWED", `Goal cannot transition from ${before.status} to ${status}.`);
    const linkError = await assertGoalLinks(programIds, portfolioIds);
    if (linkError) return fail(res, 400, "VALIDATION_FAILED", linkError);
    await run(`UPDATE strategic_goals SET name = @name, owner = @owner, objective = @objective, status = @status,
      period_start = @periodStart, period_end = @periodEnd, success_metrics = @successMetrics,
      program_ids = @programIds, portfolio_ids = @portfolioIds, updated_at = @updatedAt WHERE id = @id`, {
      id: before.id, name, owner, objective, status,
      periodStart: req.body?.periodStart === undefined ? before.period_start : asTrimmed(req.body.periodStart, 32) || null,
      periodEnd: req.body?.periodEnd === undefined ? before.period_end : asTrimmed(req.body.periodEnd, 32) || null,
      successMetrics: json(req.body?.successMetrics === undefined ? metricItems(parse(before.success_metrics, [])) : metricItems(req.body.successMetrics)),
      programIds: json(programIds), portfolioIds: json(portfolioIds), updatedAt: now(),
    });
    const after = await row("SELECT * FROM strategic_goals WHERE id = @id", { id: before.id });
    await audit(req.user, "strategic_goal.update", "strategic_goal", before.id, before, after, req.ip);
    res.json(ok(await mapGoal(after, req.user)));
  });

  router.delete("/strategic-goals/:id", requirePermission("admin:*"), async (req, res) => {
    const before = await row("SELECT * FROM strategic_goals WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Strategic goal not found.");
    await run("DELETE FROM strategic_goals WHERE id = @id", { id: before.id });
    await audit(req.user, "strategic_goal.delete", "strategic_goal", before.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: before.id }));
  });

  router.get("/programs", requireAnyPermission(["product:*", "project:*", "project:read"]), async (req, res) => {
    const programRows = await rows("SELECT * FROM programs ORDER BY updated_at DESC");
    const programs = await mapAsync(programRows, async (program) => await mapProgram(program, req.user));
    const canReadCatalog = hasPermission(req.user, "project:*") || hasPermission(req.user, "product:*");
    res.json(ok(canReadCatalog ? programs : programs.filter((program) => program.projectIds.length)));
  });

  router.get("/programs/:id", requireAnyPermission(["product:*", "project:*", "project:read"]), async (req, res) => {
    const program = await row("SELECT * FROM programs WHERE id = @id", { id: req.params.id });
    if (!program) return fail(res, 404, "RESOURCE_NOT_FOUND", "Program not found.");
    const mapped = await mapProgram(program, req.user);
    if (!await canReadProgram(program, req.user, mapped)) return fail(res, 403, "PERMISSION_DENIED", "You do not have access to this program.");
    res.json(ok(mapped));
  });

  router.get("/programs/:id/projects", requireAnyPermission(["product:*", "project:*", "project:read"]), async (req, res) => {
    const program = await row("SELECT * FROM programs WHERE id = @id", { id: req.params.id });
    if (!program) return fail(res, 404, "RESOURCE_NOT_FOUND", "Program not found.");
    const mapped = await mapProgram(program, req.user);
    if (!await canReadProgram(program, req.user, mapped)) return fail(res, 403, "PERMISSION_DENIED", "You do not have access to this program.");
    const projects = [];
    for (const id of mapped.projectIds) {
      const project = await row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id });
      if (project) projects.push(mapProject(project));
    }
    res.json(ok(projects));
  });

  router.post("/programs", requirePermission("project:*"), async (req, res) => {
    const name = asTrimmed(req.body?.name, 300);
    const owner = asTrimmed(req.body?.owner, 200);
    const objective = asTrimmed(req.body?.objective, 5000);
    const projectIds = ids(req.body?.projectIds);
    const status = asTrimmed(req.body?.status, 50) || "planning";
    if (!name || !owner || !objective) return fail(res, 400, "VALIDATION_FAILED", "Program name, owner, and objective are required.");
    if (!PROGRAM_STATUSES.has(status)) return fail(res, 400, "VALIDATION_FAILED", "Invalid program status.");
    const links = await assertProjectLinks(projectIds, req.user);
    if (links) return fail(res, links.status || 400, links.status ? "PERMISSION_DENIED" : "VALIDATION_FAILED", links.error);
    const program = await transaction(async () => {
      const stamp = now();
      const previousAssignments = await projectProgramAssignments(projectIds);
      const record = {
        id: await nextId("PROG", "programs"), name, owner, objective, status,
        health_score: 0, progress: 0, project_ids: json(projectIds), risks: json(riskItems(req.body?.risks)), updated_at: stamp,
      };
      await insert("programs", record);
      for (const id of projectIds) {
        if (previousAssignments.get(id) === record.id) continue;
        await run(
          "UPDATE projects SET program_id = @programId, updated_at = @updatedAt, version = COALESCE(version, 1) + 1 WHERE id = @id",
          { id, programId: record.id, updatedAt: stamp },
        );
      }
      const affectedPrograms = new Set([...previousAssignments.values(), record.id]);
      await refreshProgramCaches(affectedPrograms, stamp);
      const linkedIds = await allProgramProjectIds(record);
      record.project_ids = json(linkedIds);
      await audit(req.user, "program.create", "program", record.id, null, record, req.ip);
      return record;
    });
    res.status(201).json(ok(await mapProgram(program, req.user)));
  });

  router.patch("/programs/:id", requirePermission("project:*"), async (req, res) => {
    const before = await row("SELECT * FROM programs WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Program not found.");
    const nextProjectIds = req.body?.projectIds === undefined ? await allProgramProjectIds(before) : ids(req.body.projectIds);
    const links = await assertProjectLinks(nextProjectIds, req.user);
    if (links) return fail(res, links.status || 400, links.status ? "PERMISSION_DENIED" : "VALIDATION_FAILED", links.error);
    const name = req.body?.name === undefined ? before.name : asTrimmed(req.body.name, 300);
    const owner = req.body?.owner === undefined ? before.owner : asTrimmed(req.body.owner, 200);
    const objective = req.body?.objective === undefined ? (before.objective || "") : asTrimmed(req.body.objective, 5000);
    const status = req.body?.status === undefined ? before.status : asTrimmed(req.body.status, 50);
    if (!name || !owner || !objective) return fail(res, 400, "VALIDATION_FAILED", "Program name, owner, and objective are required.");
    if (!PROGRAM_STATUSES.has(status)) return fail(res, 400, "VALIDATION_FAILED", "Invalid program status.");
    const after = await transaction(async () => {
      const previousProjectIds = await allProgramProjectIds(before);
      const affectedProjectIds = [...new Set([...previousProjectIds, ...nextProjectIds])];
      const previousAssignments = await projectProgramAssignments(affectedProjectIds);
      const updatedAt = now();
      await run(`UPDATE programs SET name = @name, owner = @owner, objective = @objective, status = @status,
        risks = @risks, updated_at = @updatedAt WHERE id = @id`, {
        id: before.id, name, owner, objective, status,
        risks: json(req.body?.risks === undefined ? riskItems(parse(before.risks, [])) : riskItems(req.body.risks)), updatedAt,
      });
      for (const id of previousProjectIds.filter((item) => !nextProjectIds.includes(item))) {
        await run(
          "UPDATE projects SET program_id = NULL, updated_at = @updatedAt, version = COALESCE(version, 1) + 1 WHERE id = @id AND program_id = @programId",
          { id, programId: before.id, updatedAt },
        );
      }
      for (const id of nextProjectIds) {
        if (previousAssignments.get(id) === before.id) continue;
        await run(
          "UPDATE projects SET program_id = @programId, updated_at = @updatedAt, version = COALESCE(version, 1) + 1 WHERE id = @id",
          { id, programId: before.id, updatedAt },
        );
      }
      const affectedPrograms = new Set([...previousAssignments.values(), before.id]);
      await refreshProgramCaches(affectedPrograms, updatedAt);
      const linkedIds = await allProgramProjectIds(before);
      const record = await row("SELECT * FROM programs WHERE id = @id", { id: before.id });
      record.project_ids = json(linkedIds);
      await audit(req.user, "program.update", "program", before.id, before, record, req.ip);
      return record;
    });
    res.json(ok(await mapProgram(after, req.user)));
  });

  router.delete("/programs/:id", requirePermission("project:*"), async (req, res) => {
    const before = await row("SELECT * FROM programs WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Program not found.");
    const linked = await rows("SELECT id FROM projects WHERE program_id = @programId ORDER BY id", { programId: before.id });
    if (linked.length) {
      return fail(res, 409, "PROGRAM_HAS_PROJECTS", "Detach linked projects, including archived records, before deleting this program.", {
        dependencies: { projects: { count: linked.length, sampleIds: linked.slice(0, 10).map((item) => item.id) } },
      });
    }
    await transaction(async () => {
      await run("DELETE FROM programs WHERE id = @id", { id: before.id });
      await audit(req.user, "program.delete", "program", before.id, before, null, req.ip);
    });
    res.json(ok({ deleted: true, id: before.id }));
  });

  router.get("/portfolios", requireAnyPermission(["product:*", "project:*", "project:read"]), async (req, res) => {
    const portfolioRows = await rows("SELECT * FROM portfolios ORDER BY name");
    const portfolios = await mapAsync(portfolioRows, async (portfolio) => await mapPortfolio(portfolio, req.user));
    const canReadCatalog = canReadAllProducts(req.user);
    res.json(ok(canReadCatalog ? portfolios : portfolios.filter((portfolio) => portfolio.productIds.length)));
  });

  router.post("/portfolios", requirePermission("product:*"), async (req, res) => {
    const name = asTrimmed(req.body?.name, 300);
    const owner = asTrimmed(req.body?.owner, 200);
    const objective = asTrimmed(req.body?.objective, 5000);
    const productIds = ids(req.body?.productIds);
    const status = asTrimmed(req.body?.status, 50) || "planned";
    if (!name || !owner || !objective) return fail(res, 400, "VALIDATION_FAILED", "Portfolio name, owner, and objective are required.");
    if (!PORTFOLIO_STATUSES.has(status)) return fail(res, 400, "VALIDATION_FAILED", "Invalid portfolio status.");
    const linkError = await assertProductLinks(productIds);
    if (linkError) return fail(res, 400, "VALIDATION_FAILED", linkError);
    const portfolio = { id: await nextId("PORT", "portfolios"), name, owner, objective, status, product_ids: json(productIds), roadmap: json(roadmapItems(req.body?.roadmap)) };
    await insert("portfolios", portfolio);
    await audit(req.user, "portfolio.create", "portfolio", portfolio.id, null, portfolio, req.ip);
    res.status(201).json(ok(await mapPortfolio(portfolio, req.user)));
  });

  router.patch("/portfolios/:id", requirePermission("product:*"), async (req, res) => {
    const before = await row("SELECT * FROM portfolios WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Portfolio not found.");
    const productIds = req.body?.productIds === undefined ? ids(parse(before.product_ids, [])) : ids(req.body.productIds);
    const linkError = await assertProductLinks(productIds);
    if (linkError) return fail(res, 400, "VALIDATION_FAILED", linkError);
    const name = req.body?.name === undefined ? before.name : asTrimmed(req.body.name, 300);
    const owner = req.body?.owner === undefined ? before.owner : asTrimmed(req.body.owner, 200);
    const objective = req.body?.objective === undefined ? (before.objective || "") : asTrimmed(req.body.objective, 5000);
    const status = req.body?.status === undefined ? before.status : asTrimmed(req.body.status, 50);
    if (!name || !owner || !objective) return fail(res, 400, "VALIDATION_FAILED", "Portfolio name, owner, and objective are required.");
    if (!PORTFOLIO_STATUSES.has(status)) return fail(res, 400, "VALIDATION_FAILED", "Invalid portfolio status.");
    const roadmap = req.body?.roadmap === undefined ? roadmapItems(parse(before.roadmap, [])) : roadmapItems(req.body.roadmap);
    await run(`UPDATE portfolios SET name = @name, owner = @owner, objective = @objective, status = @status,
      product_ids = @productIds, roadmap = @roadmap WHERE id = @id`, { id: before.id, name, owner, objective, status, productIds: json(productIds), roadmap: json(roadmap) });
    const after = await row("SELECT * FROM portfolios WHERE id = @id", { id: before.id });
    await audit(req.user, "portfolio.update", "portfolio", before.id, before, after, req.ip);
    res.json(ok(await mapPortfolio(after, req.user)));
  });

  router.delete("/portfolios/:id", requirePermission("product:*"), async (req, res) => {
    const before = await row("SELECT * FROM portfolios WHERE id = @id", { id: req.params.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Portfolio not found.");
    const requirements = await rows("SELECT id FROM requirements WHERE portfolio_id = @id AND deleted_at IS NULL", { id: before.id });
    if (requirements.length) return fail(res, 409, "PORTFOLIO_HAS_REQUIREMENTS", "Detach linked requirements before deleting this portfolio.", { requirementIds: requirements.map((item) => item.id) });
    await run("DELETE FROM portfolios WHERE id = @id", { id: before.id });
    await audit(req.user, "portfolio.delete", "portfolio", before.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: before.id }));
  });

  return router;
}

module.exports = { createStrategyRouter };
