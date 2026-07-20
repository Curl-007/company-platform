const express = require("express");
const { buildDecisionCreate, buildRiskCreate, buildRiskUpdate } = require("./service");

const RISK_SEVERITIES = ["low", "medium", "high", "critical"];
const RISK_STATUSES = ["open", "monitoring", "mitigated", "closed"];
const DECISION_STATUSES = ["proposed", "approved", "rejected", "superseded"];

function mapRisk(item) {
  return { id: item.id, projectId: item.project_id, title: item.title, description: item.description || "", severity: item.severity, status: item.status, ownerId: item.owner_id || null, ownerName: item.owner_name || "", mitigationPlan: item.mitigation_plan || "", dueDate: item.due_date || null, createdAt: item.created_at, updatedAt: item.updated_at, closedAt: item.closed_at || null };
}

function mapDecision(item) {
  return { id: item.id, projectId: item.project_id, title: item.title, context: item.context || "", decision: item.decision || "", ownerId: item.owner_id || null, ownerName: item.owner_name || "", status: item.status, decidedAt: item.decided_at || null, createdAt: item.created_at, updatedAt: item.updated_at };
}

function createGovernanceRouter({ audit, canAccessProject, canManageProject, fail, nextId, now, ok, repository }) {
  const router = express.Router();
  const ensureRead = async (req, res) => await canAccessProject(req.user, req.params.projectId) || (fail(res, 403, "PERMISSION_DENIED", "No access to this project."), false);
  const ensureWrite = async (req, res) => await canManageProject(req.user, req.params.projectId) || (fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot change governance data for this project."), false);
  async function refreshRiskCount(projectId) {
    await repository.updateProjectRiskCount(projectId, await repository.countOpenRisks(projectId), now());
  }

  router.get("/projects/:projectId/risks", async (req, res) => {
    if (!(await ensureRead(req, res))) return;
    res.json(ok((await repository.listRisks(req.params.projectId)).map(mapRisk)));
  });
  router.post("/projects/:projectId/risks", async (req, res) => {
    if (!(await ensureWrite(req, res))) return;
    const body = req.body || {};
    if (!String(body.title || "").trim() || !RISK_SEVERITIES.includes(body.severity || "medium")) return fail(res, 400, "VALIDATION_FAILED", "Risk title and severity are required.");
    const risk = buildRiskCreate(body, { id: await nextId("RSK", "project_risks"), projectId: req.params.projectId, now });
    if (!RISK_STATUSES.includes(risk.status)) return fail(res, 400, "VALIDATION_FAILED", "Invalid risk status.");
    await repository.createRisk(risk);
    await refreshRiskCount(risk.project_id);
    await audit(req.user, "risk.create", "project_risk", risk.id, null, risk, req.ip);
    res.status(201).json(ok(mapRisk(risk)));
  });
  router.patch("/projects/:projectId/risks/:id", async (req, res) => {
    if (!(await ensureWrite(req, res))) return;
    const before = await repository.findRisk(req.params.id, req.params.projectId);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Risk not found.");
    const body = req.body || {};
    if (body.severity !== undefined && !RISK_SEVERITIES.includes(body.severity)) return fail(res, 400, "VALIDATION_FAILED", "Invalid risk severity.");
    if (body.status !== undefined && !RISK_STATUSES.includes(body.status)) return fail(res, 400, "VALIDATION_FAILED", "Invalid risk status.");
    await repository.updateRisk(buildRiskUpdate(before, body, { now }));
    const after = await repository.findRiskById(before.id);
    await refreshRiskCount(before.project_id);
    await audit(req.user, "risk.update", "project_risk", before.id, before, after, req.ip);
    res.json(ok(mapRisk(after)));
  });

  router.get("/projects/:projectId/decisions", async (req, res) => {
    if (!(await ensureRead(req, res))) return;
    res.json(ok((await repository.listDecisions(req.params.projectId)).map(mapDecision)));
  });
  router.post("/projects/:projectId/decisions", async (req, res) => {
    if (!(await ensureWrite(req, res))) return;
    const body = req.body || {};
    if (!String(body.title || "").trim() || !DECISION_STATUSES.includes(body.status || "proposed")) return fail(res, 400, "VALIDATION_FAILED", "Decision title and status are required.");
    const decision = buildDecisionCreate(body, { id: await nextId("DEC", "project_decisions"), projectId: req.params.projectId, actor: req.user, now });
    await repository.createDecision(decision);
    await audit(req.user, "decision.create", "project_decision", decision.id, null, decision, req.ip);
    res.status(201).json(ok(mapDecision(decision)));
  });
  return router;
}

module.exports = { createGovernanceRouter };
