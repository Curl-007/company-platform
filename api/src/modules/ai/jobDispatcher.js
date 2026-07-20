function createAiJobDispatcher({ runJob, schedule = setImmediate, onFailure = () => {} }) {
  const scheduled = new Set();

  function enqueue({ jobId, document }) {
    if (!jobId || !document || scheduled.has(jobId)) return false;
    scheduled.add(jobId);
    schedule(async () => {
      try {
        await runJob(jobId, document);
      } catch (error) {
        onFailure(error, { jobId, documentId: document.id });
      } finally {
        scheduled.delete(jobId);
      }
    });
    return true;
  }

  return { enqueue };
}

module.exports = { createAiJobDispatcher };
