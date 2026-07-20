const assert = require("node:assert/strict");
const test = require("node:test");
const { createAiJobDispatcher } = require("../src/modules/ai/jobDispatcher");

test("local AI job dispatcher returns immediately and deduplicates queued work", async () => {
  const scheduled = [];
  const completed = [];
  const dispatcher = createAiJobDispatcher({
    runJob: async (jobId, document) => { completed.push(`${jobId}:${document.id}`); },
    schedule: (task) => scheduled.push(task),
  });
  assert.equal(dispatcher.enqueue({ jobId: "JOB-001", document: { id: "DOC-001" } }), true);
  assert.equal(dispatcher.enqueue({ jobId: "JOB-001", document: { id: "DOC-001" } }), false);
  assert.equal(completed.length, 0);
  await scheduled.shift()();
  assert.deepEqual(completed, ["JOB-001:DOC-001"]);
  assert.equal(dispatcher.enqueue({ jobId: "JOB-001", document: { id: "DOC-001" } }), true);
});
