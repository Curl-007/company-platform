// Platform-side scheduling for AI reminders (Sprint 5.2).
//
// The dsh-native schedule tooling assumes a resident live agent; this platform
// keeps invocations short-lived, so agents instead persist reminders through
// the execution gateway (capability "reminder-create", audited like every
// other write) and this scheduler delivers them when due:
//   1. delivery record in the dynamic center (objects table, bucket
//      "ai-reminder") — the persisted, queryable notification entry;
//   2. a /ws/agent broadcast is NOT attempted: the agent event bridge only
//      fans out per-invocation subscriptions made during live runs, so it has
//      no server-initiated project broadcast today (left unchanged on purpose).
//
// Reminders are rows in ai_reminders with status 'pending', so a restart loses
// nothing: start() sweeps immediately and the interval keeps picking up due
// rows. Delivery is at-least-once: a crash between delivery and the sent
// transition may re-deliver one reminder on recovery.

const DEFAULT_SWEEP_INTERVAL_MS = 30_000;
const DUE_BATCH_LIMIT = 500;
const REMINDER_BUCKET = "ai-reminder";

function normalizeIntervalMs(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isoNow(now) {
  const value = String((typeof now === "function" ? now() : now) || "");
  return value || new Date().toISOString();
}

function createAiReminderRepository({ insert, rows, run }) {
  if (typeof rows !== "function" || typeof run !== "function") {
    throw new Error("AI reminder repository requires rows and run helpers.");
  }
  return {
    create: (record) => (typeof insert === "function" ? insert("ai_reminders", record) : undefined),
    // Pending and due (remind_at in the past or exactly now), oldest first.
    listDue: (nowIso) => rows(
      `SELECT id, project_id, actor_id, message, remind_at, status, invocation_id, created_at
         FROM ai_reminders
        WHERE status = 'pending' AND remind_at <= @now
        ORDER BY remind_at, id
        LIMIT ${DUE_BATCH_LIMIT}`,
      { now: isoNow(nowIso) },
    ),
    // Returns false when the row was already sent (or cancelled), which is
    // what makes repeated and overlapping sweeps idempotent.
    markSent: async (id, sentAtIso) => {
      const result = await run(
        "UPDATE ai_reminders SET status = 'sent', sent_at = @sentAt WHERE id = @id AND status = 'pending'",
        { id, sentAt: isoNow(sentAtIso) },
      );
      return Number(result?.changes ?? result?.rowCount ?? 0) > 0;
    },
  };
}

// Minimal dynamic-center write. The objects table (id, bucket, storage_key,
// original_name, mime_type, size, created_by, created_at) doubles as the
// platform's generic record store; the reminder payload is JSON in
// original_name/size metadata form with a namespaced bucket + storage key.
function createDynamicCenterReminderDelivery({ insert, nextId, now = () => new Date().toISOString() }) {
  if (typeof insert !== "function" || typeof nextId !== "function") {
    throw new Error("AI reminder delivery requires insert and nextId helpers.");
  }
  return async function deliver(reminder) {
    const payload = {
      type: "agent.reminder",
      reminderId: reminder.id,
      projectId: reminder.project_id,
      message: reminder.message,
      remindAt: reminder.remind_at,
      invocationId: reminder.invocation_id || null,
    };
    const body = JSON.stringify(payload);
    const objectId = await nextId("OBJ");
    await insert("objects", {
      id: objectId,
      bucket: REMINDER_BUCKET,
      storage_key: `ai-reminders/${reminder.project_id}/${reminder.id}`,
      original_name: `AI reminder ${reminder.id}: ${String(reminder.message || "").slice(0, 120)}`,
      mime_type: "application/json",
      size: Buffer.byteLength(body, "utf8"),
      created_by: reminder.actor_id || null,
      created_at: isoNow(now),
    });
    return { objectId };
  };
}

function createReminderScheduler({
  repository,
  deliver,
  now = () => new Date().toISOString(),
  intervalMs = DEFAULT_SWEEP_INTERVAL_MS,
  logger = console,
}) {
  if (!repository || typeof repository.listDue !== "function" || typeof repository.markSent !== "function") {
    throw new Error("Reminder scheduler requires a reminder repository (listDue, markSent).");
  }
  if (typeof deliver !== "function") throw new Error("Reminder scheduler requires a deliver function.");

  const sweepIntervalMs = normalizeIntervalMs(intervalMs, DEFAULT_SWEEP_INTERVAL_MS);
  let timer = null;
  let sweeping = false;

  async function sweep() {
    if (sweeping) return 0;
    sweeping = true;
    let delivered = 0;
    try {
      const due = await repository.listDue(now());
      for (const reminder of due) {
        try {
          await deliver(reminder);
          if (await repository.markSent(reminder.id, now())) delivered += 1;
        } catch (error) {
          // One failing delivery must not block the rest of the batch; the
          // row stays pending and the next sweep retries it.
          logger?.warn?.(`AI reminder ${reminder.id} delivery failed: ${error?.message || error}`);
        }
      }
    } finally {
      sweeping = false;
    }
    return delivered;
  }

  function start() {
    if (timer) return timer;
    // Immediate sweep first: a restart must pick up already-overdue reminders
    // instead of waiting a full interval.
    void sweep();
    timer = setInterval(() => { void sweep(); }, sweepIntervalMs);
    timer.unref?.();
    return timer;
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stop,
    sweep,
    status: () => ({ sweeping, timerActive: Boolean(timer) }),
  };
}

module.exports = {
  DEFAULT_SWEEP_INTERVAL_MS,
  REMINDER_BUCKET,
  createAiReminderRepository,
  createDynamicCenterReminderDelivery,
  createReminderScheduler,
};
