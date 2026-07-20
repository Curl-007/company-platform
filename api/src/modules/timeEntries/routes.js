const express = require("express");
const { createTimeEntriesService } = require("./service");

function createTimeEntriesRouter({ audit, beginIdempotentRequest, canAccessProject, canWriteProject, fail, nextId, now, ok, paginatedResponse, repository, transaction }) {
  const router = express.Router();
  const service = createTimeEntriesService({ canAccessProject, canWriteProject, repository });

  router.get("/time-entries", (req, res) => {
    const data = service.listForUser(req.user, req.query);
    res.json(ok(paginatedResponse(data, req.query)));
  });

  router.post("/time-entries", (req, res) => {
    const input = service.validateInput(req.body);
    if (!input.ok) return fail(res, 400, "VALIDATION_FAILED", input.message);
    const validation = service.validateProjectAndTask(req.user, input);
    if (!validation.ok) return fail(res, validation.status, validation.code, validation.message);
    const idempotency = beginIdempotentRequest(req, res, "time-entry.create");
    if (!idempotency) return;
    try {
      const response = transaction(() => {
        const entry = service.buildEntry(input, { id: nextId("TIME", "time_entries"), userId: req.user.id, timestamp: now() });
        repository.create(entry);
        const mapped = service.mapTimeEntry(entry, validation.project);
        const created = ok(mapped);
        audit(req.user, "time_entry.create", "time_entry", entry.id, null, mapped, req.ip);
        idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      idempotency.abort();
      throw error;
    }
  });

  router.patch("/time-entries/:id", (req, res) => {
    const before = repository.findOwned({ id: req.params.id, userId: req.user.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Time entry not found.");
    const beforeMapped = service.mapTimeEntry(before, repository.findProject(before.project_id));
    const input = service.validateInput(req.body, before);
    if (!input.ok) return fail(res, 400, "VALIDATION_FAILED", input.message);
    const validation = service.validateProjectAndTask(req.user, input);
    if (!validation.ok) return fail(res, validation.status, validation.code, validation.message);
    repository.update(service.buildUpdate(input, { id: before.id, updatedAt: now() }));
    const after = repository.findOwned({ id: before.id, userId: req.user.id });
    const mapped = service.mapTimeEntry(after, validation.project);
    audit(req.user, "time_entry.update", "time_entry", before.id, beforeMapped, mapped, req.ip);
    res.json(ok(mapped));
  });

  router.delete("/time-entries/:id", (req, res) => {
    const entry = repository.findOwned({ id: req.params.id, userId: req.user.id });
    if (!entry) return fail(res, 404, "RESOURCE_NOT_FOUND", "Time entry not found.");
    if (!canWriteProject(req.user, entry.project_id)) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot delete time in an archived or inaccessible project.");
    const mapped = service.mapTimeEntry(entry, repository.findProject(entry.project_id));
    transaction(() => {
      repository.delete(entry.id);
      audit(req.user, "time_entry.delete", "time_entry", entry.id, mapped, null, req.ip);
    });
    res.json(ok({ deleted: true, id: entry.id }));
  });

  return router;
}

module.exports = { createTimeEntriesRouter };
