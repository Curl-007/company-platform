function createAiJobRecovery({
  aiJobsRepository,
  aiJobDispatcher,
  failTimedOutAiJobs,
  audit,
  now,
  timeoutMs,
  rows,
  row,
  mapDocument,
}) {
  async function recoverPendingAiJobs() {
    await failTimedOutAiJobs({
      repository: aiJobsRepository,
      audit,
      now,
      timeoutMs,
      actor: { id: "system", name: "AI Worker Monitor" },
    });
    const queued = await rows("SELECT * FROM ai_jobs WHERE status = 'queued' AND source_type = 'document' AND source_id IS NOT NULL");
    for (const job of queued) {
      const document = await row("SELECT * FROM documents WHERE id = @id", { id: job.source_id });
      if (document) aiJobDispatcher.enqueue({ jobId: job.job_id, document: mapDocument(document) });
      else {
        try {
          await aiJobsRepository.transition(job, "failed", {
            progress: 0,
            current_step: "源文档不存在",
            error_message: "AI job source document no longer exists.",
            failed_at: now(),
          });
        } catch (error) {
          console.warn(`Unable to recover AI job ${job.job_id}:`, error.message);
        }
      }
    }
    const interrupted = await rows("SELECT * FROM ai_jobs WHERE status = 'running'");
    for (const job of interrupted) {
      try {
        await aiJobsRepository.transition(job, "failed", {
          progress: 0,
          current_step: "服务重启后需要重试",
          error_message: "AI job was interrupted by a service restart. Retry the job to continue.",
          failed_at: now(),
        });
      } catch (error) {
        console.warn(`Unable to mark interrupted AI job ${job.job_id}:`, error.message);
      }
    }
  }

  return { recoverPendingAiJobs };
}

module.exports = { createAiJobRecovery };
