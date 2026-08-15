const INVOCATION_LIST_COLUMNS = [
  "id",
  "capability_id",
  "capability_version",
  "status",
  "actor_id",
  "project_id",
  "error_code",
  "created_at",
  "started_at",
  "completed_at",
].join(", ");

const UPDATABLE_COLUMNS = new Set([
  "status",
  "policy_snapshot",
  "execution_snapshot",
  "result_snapshot",
  "harness_events",
  "error_code",
  "error_message",
  "started_at",
  "completed_at",
  "updated_at",
]);

function createAiCapabilityRepository({ insert, row, rows, run }) {
  async function find(id) {
    return row("SELECT * FROM ai_capability_invocations WHERE id = @id", { id });
  }

  async function create(invocation) {
    await insert("ai_capability_invocations", invocation);
    return find(invocation.id);
  }

  async function update(id, patch) {
    const entries = Object.entries(patch).filter(([key]) => UPDATABLE_COLUMNS.has(key));
    if (!entries.length) return find(id);
    const assignments = entries.map(([key]) => `${key} = @${key}`).join(", ");
    await run(`UPDATE ai_capability_invocations SET ${assignments} WHERE id = @id`, { id, ...Object.fromEntries(entries) });
    return find(id);
  }

  // Newest first. An explicit accessible-project id list narrows cross-project
  // listings to the caller's scope; an empty list short-circuits to no rows.
  async function list({ limit = 20, projectId, projectIds, status } = {}) {
    const conditions = [];
    const filters = {};
    if (projectId) {
      conditions.push("project_id = @projectId");
      filters.projectId = String(projectId);
    } else if (Array.isArray(projectIds)) {
      if (!projectIds.length) return { items: [], total: 0 };
      const placeholders = projectIds.map((value, index) => {
        const key = `accessibleProject${index}`;
        filters[key] = String(value);
        return `@${key}`;
      });
      conditions.push(`project_id IN (${placeholders.join(", ")})`);
    }
    if (status) {
      conditions.push("status = @status");
      filters.status = String(status);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const totalRow = await row(`SELECT COUNT(*) AS total FROM ai_capability_invocations${where}`, { ...filters });
    const items = await rows(
      `SELECT ${INVOCATION_LIST_COLUMNS}
         FROM ai_capability_invocations${where}
        ORDER BY created_at DESC, id DESC
        LIMIT @limit`,
      { ...filters, limit },
    );
    return { items, total: Number(totalRow?.total) || 0 };
  }

  return { create, find, list, update };
}

module.exports = { createAiCapabilityRepository };
