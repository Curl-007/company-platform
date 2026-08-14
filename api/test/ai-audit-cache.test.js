const assert = require("node:assert/strict");
const test = require("node:test");
const { createSummaryInvalidatingAudit, shouldClearSummaryCache } = require("../src/modules/ai/auditCache");

test("summary-invalidating audit only clears after non-AI/non-auth business writes", async () => {
  const calls = [];
  let clearCount = 0;
  const { audit } = createSummaryInvalidatingAudit({
    writeAuditLog: async (...args) => {
      calls.push(args);
      return "written";
    },
    clearSummaryCache: () => { clearCount += 1; },
  });

  assert.equal(await audit({ id: "USR-1" }, "task.update", "task", "TASK-1"), "written");
  await audit({ id: "USR-1" }, "ai.job_confirmed", "ai_job", "JOB-1");
  await audit({ id: "USR-1" }, "auth.profile_update", "user", "USR-1");
  await audit({ id: "USR-1" }, "page.view", "page", "dashboard");
  assert.equal(calls.length, 4);
  assert.equal(clearCount, 1);
  assert.equal(shouldClearSummaryCache("task.update"), true);
  assert.equal(shouldClearSummaryCache("ai.chat"), false);
});

test("summary cache failures do not mask an audit write", async () => {
  const { audit } = createSummaryInvalidatingAudit({
    writeAuditLog: async () => ({ id: "AUD-1" }),
    clearSummaryCache: () => { throw new Error("cache unavailable"); },
  });
  assert.deepEqual(await audit(null, "project.update", "project", "PRJ-1"), { id: "AUD-1" });
});
