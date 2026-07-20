const express = require("express");

function text(value, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function mapUnit(unit, memberCounts) {
  return {
    id: unit.id,
    name: unit.name,
    parentId: unit.parent_id || null,
    managerUserId: unit.manager_user_id || null,
    responsibilities: unit.responsibilities || "",
    status: unit.status,
    memberCount: memberCounts.get(unit.id) || 0,
    createdAt: unit.created_at,
    updatedAt: unit.updated_at,
  };
}

function mapPerson(person) {
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    role: person.role,
    status: person.status,
    position: person.position || "",
    departmentId: person.department_id || null,
    department: person.department || "",
  };
}

function createOrganizationRouter({ audit, fail, nextId, now, ok, repository, requirePermission, transaction }) {
  const router = express.Router();

  function wouldCreateCycle(unitId, parentId) {
    const visited = new Set([unitId]);
    let cursor = parentId;
    while (cursor) {
      if (visited.has(cursor)) return true;
      visited.add(cursor);
      cursor = repository.findUnit(cursor)?.parent_id || null;
    }
    return false;
  }

  function mappedUnits() {
    const units = repository.listUnits();
    const memberCounts = new Map(units.map((unit) => [unit.id, repository.countMembers(unit.id)]));
    return units.map((unit) => mapUnit(unit, memberCounts));
  }

  router.get("/org", (req, res) => {
    const units = mappedUnits();
    const people = repository.listPeople().map(mapPerson);
    res.json(ok({ units, people }));
  });

  router.get("/org/departments", (req, res) => res.json(ok(mappedUnits())));
  router.get("/org/people", requirePermission("admin:*"), (req, res) => {
    const unitId = text(req.query.departmentId, 128) || null;
    if (unitId && !repository.findUnit(unitId)) return fail(res, 404, "RESOURCE_NOT_FOUND", "Department not found.");
    res.json(ok(repository.listPeople(unitId).map(mapPerson)));
  });

  router.post("/org/departments", requirePermission("admin:*"), (req, res) => {
    const name = text(req.body?.name, 200);
    const parentId = text(req.body?.parentId, 128) || null;
    const managerUserId = text(req.body?.managerUserId, 128) || null;
    const responsibilities = text(req.body?.responsibilities, 5000);
    if (!name) return fail(res, 400, "VALIDATION_FAILED", "Department name is required.");
    if (repository.findUnitByName(name)) return fail(res, 409, "CONFLICT", "Department name already exists.");
    if (parentId && !repository.findUnit(parentId)) return fail(res, 400, "VALIDATION_FAILED", "Parent department does not exist.");
    if (managerUserId && !repository.findUser(managerUserId)) return fail(res, 400, "VALIDATION_FAILED", "Department manager does not exist.");
    const stamp = now();
    const unit = repository.insertUnit({ id: nextId("ORG", "org_units"), name, parent_id: parentId, manager_user_id: managerUserId, responsibilities, status: "active", created_at: stamp, updated_at: stamp });
    audit(req.user, "org_unit.create", "org_unit", unit.id, null, unit, req.ip);
    res.status(201).json(ok(mapUnit(unit, new Map([[unit.id, 0]]))));
  });

  router.patch("/org/departments/:id", requirePermission("admin:*"), (req, res) => {
    const before = repository.findUnit(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Department not found.");
    const name = req.body?.name === undefined ? before.name : text(req.body.name, 200);
    const parentId = req.body?.parentId === undefined ? before.parent_id : text(req.body.parentId, 128) || null;
    const managerUserId = req.body?.managerUserId === undefined ? before.manager_user_id : text(req.body.managerUserId, 128) || null;
    const responsibilities = req.body?.responsibilities === undefined ? before.responsibilities : text(req.body.responsibilities, 5000);
    const status = req.body?.status === undefined ? before.status : text(req.body.status, 30);
    if (!name) return fail(res, 400, "VALIDATION_FAILED", "Department name is required.");
    if (!["active", "archived"].includes(status)) return fail(res, 400, "VALIDATION_FAILED", "Department status must be active or archived.");
    if (repository.findUnitByName(name, before.id)) return fail(res, 409, "CONFLICT", "Department name already exists.");
    if (parentId === before.id) return fail(res, 400, "VALIDATION_FAILED", "A department cannot be its own parent.");
    if (parentId && !repository.findUnit(parentId)) return fail(res, 400, "VALIDATION_FAILED", "Parent department does not exist.");
    if (parentId && wouldCreateCycle(before.id, parentId)) return fail(res, 400, "VALIDATION_FAILED", "Department hierarchy cannot contain a cycle.");
    if (managerUserId && !repository.findUser(managerUserId)) return fail(res, 400, "VALIDATION_FAILED", "Department manager does not exist.");
    const after = transaction(() => {
      const updated = repository.updateUnit(before.id, { name, parentId, managerUserId, responsibilities, status, updatedAt: now() });
      if (name !== before.name) {
        // Keep the legacy display column synchronized while department_id remains canonical.
        repository.listPeople(before.id).forEach((person) => {
          repository.updateUserDepartment?.(person.id, before.id, name);
        });
      }
      return updated;
    });
    audit(req.user, "org_unit.update", "org_unit", before.id, before, after, req.ip);
    res.json(ok(mapUnit(after, new Map([[after.id, repository.countMembers(after.id)]]))));
  });

  router.delete("/org/departments/:id", requirePermission("admin:*"), (req, res) => {
    const before = repository.findUnit(req.params.id);
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Department not found.");
    const childCount = repository.countChildren(before.id);
    const memberCount = repository.countMembers(before.id);
    if (childCount || memberCount) return fail(res, 409, "ORG_UNIT_IN_USE", "Move child departments and members before deleting this department.", { childCount, memberCount });
    repository.deleteUnit(before.id);
    audit(req.user, "org_unit.delete", "org_unit", before.id, before, null, req.ip);
    res.json(ok({ deleted: true, id: before.id }));
  });

  return router;
}

module.exports = { createOrganizationRouter };
