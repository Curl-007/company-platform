const express = require("express");
const { createTimeEntriesService } = require("./service");

function createTimeEntriesRouter({ audit, beginIdempotentRequest, canAccessProject, canWriteProject, fail, nextId, now, ok, paginatedResponse, repository, transaction }) {
  const router = express.Router();
  const service = createTimeEntriesService({ canAccessProject, canWriteProject, repository });

  router.get("/time-entries", async (req, res) => {
    const data = await service.listForUser(req.user, req.query);
    res.json(ok(paginatedResponse(data, req.query)));
  });

  router.post("/time-entries", async (req, res) => {
    const input = service.validateInput(req.body);
    if (!input.ok) return fail(res, 400, "VALIDATION_FAILED", input.message);
    const validation = await service.validateProjectAndTask(req.user, input);
    if (!validation.ok) return fail(res, validation.status, validation.code, validation.message);
    const idempotency = await beginIdempotentRequest(req, res, "time-entry.create");
    if (!idempotency) return;
    try {
      const response = await transaction(async () => {
        const entry = service.buildEntry(input, { id: await nextId("TIME", "time_entries"), userId: req.user.id, timestamp: now() });
        await repository.create(entry);
        const mapped = service.mapTimeEntry(entry, validation.project);
        const created = ok(mapped);
        await audit(req.user, "time_entry.create", "time_entry", entry.id, null, mapped, req.ip);
        await idempotency.commit(201, created);
        return created;
      });
      res.status(201).json(response);
    } catch (error) {
      await idempotency.abort();
      throw error;
    }
  });

  router.patch("/time-entries/:id", async (req, res) => {
    const before = await repository.findOwned({ id: req.params.id, userId: req.user.id });
    if (!before) return fail(res, 404, "RESOURCE_NOT_FOUND", "Time entry not found.");
    const beforeMapped = service.mapTimeEntry(before, await repository.findProject(before.project_id));
    const input = service.validateInput(req.body, before);
    if (!input.ok) return fail(res, 400, "VALIDATION_FAILED", input.message);
    const validation = await service.validateProjectAndTask(req.user, input);
    if (!validation.ok) return fail(res, validation.status, validation.code, validation.message);
    await repository.update(service.buildUpdate(input, { id: before.id, updatedAt: now() }));
    const after = await repository.findOwned({ id: before.id, userId: req.user.id });
    const mapped = service.mapTimeEntry(after, validation.project);
    await audit(req.user, "time_entry.update", "time_entry", before.id, beforeMapped, mapped, req.ip);
    res.json(ok(mapped));
  });

  router.delete("/time-entries/:id", async (req, res) => {
    const entry = await repository.findOwned({ id: req.params.id, userId: req.user.id });
    if (!entry) return fail(res, 404, "RESOURCE_NOT_FOUND", "Time entry not found.");
    if (!(await canWriteProject(req.user, entry.project_id))) return fail(res, 403, "PROJECT_ARCHIVED_OR_ACCESS_DENIED", "Cannot delete time in an archived or inaccessible project.");
    const mapped = service.mapTimeEntry(entry, await repository.findProject(entry.project_id));
    await transaction(async () => {
      await repository.delete(entry.id);
      await audit(req.user, "time_entry.delete", "time_entry", entry.id, mapped, null, req.ip);
    });
    res.json(ok({ deleted: true, id: entry.id }));
  });

  return router;
}

module.exports = { createTimeEntriesRouter };
