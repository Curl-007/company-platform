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

function createAiCapabilityRepository({ insert, row, run }) {
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

  return { create, find, update };
}

module.exports = { createAiCapabilityRepository };
