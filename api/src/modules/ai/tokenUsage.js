/**
 * AI token usage metering (Sprint 1.2).
 *
 * Extraction follows the dsh session event contract (@deepseek-ai/dsh-session
 * rc.6, mirrored by the dsh-token-meter usage projection):
 * - `assistant/message` events carry the final per-step usage in `data.usage`
 *   as `{ inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens? }`;
 *   `inputTokens` is uncached input only, so billed prompt tokens are the sum
 *   of input plus both cache buckets.
 * - `assistant/chunk` events with `data.chunk.type === "usage"` carry an early
 *   per-step sample in `data.chunk.usage`.
 * - A repeated sample for the same (turn, step) replaces the earlier value, so
 *   a chunk sample and its final message never double count.
 * `turn/end` events in rc.6 only carry `{ turn, reason }` with no usage; a
 * usage payload on that boundary (as reported for other dsh runtime shapes) is
 * still honored defensively. Provider-style `prompt_tokens`/`completion_tokens`
 * fields are accepted when present. Every extraction path is defensive: fields
 * that are missing or not non-negative integers count as zero and never throw.
 */

function tokenCount(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeTokenUsage(usage) {
  const source = plainObject(usage);
  if (!source) return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const promptFromBuckets = (
    tokenCount(source.inputTokens)
    + tokenCount(source.cacheReadTokens)
    + tokenCount(source.cacheWriteTokens)
  );
  const promptTokens = source.prompt_tokens !== undefined ? tokenCount(source.prompt_tokens) : promptFromBuckets;
  const completionTokens = source.completion_tokens !== undefined ? tokenCount(source.completion_tokens) : tokenCount(source.outputTokens);
  const totalTokens = source.total_tokens !== undefined ? tokenCount(source.total_tokens) : promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

function stepSlot(data, index) {
  const turn = Number(data?.turn);
  const step = Number(data?.step);
  if (!Number.isSafeInteger(turn) || !Number.isSafeInteger(step)) return `event:${index}`;
  return `step:${turn}:${step}`;
}

function turnSlot(data, index) {
  const turn = Number(data?.turn);
  if (!Number.isSafeInteger(turn)) return `event:${index}`;
  return `turn-end:${turn}`;
}

function usageOfEvent(event, index) {
  const source = plainObject(event);
  if (!source) return null;
  const data = plainObject(source.data);
  if (source.type === "assistant/chunk") {
    const chunk = plainObject(data?.chunk);
    if (chunk?.type !== "usage") return null;
    return { slot: stepSlot(data, index), usage: chunk.usage };
  }
  if (data && data.usage !== undefined) {
    return { slot: source.type === "turn/end" ? turnSlot(data, index) : stepSlot(data, index), usage: data.usage };
  }
  if (source.usage !== undefined) return { slot: `event:${index}`, usage: source.usage };
  const detail = plainObject(source.detail);
  if (detail && detail.usage !== undefined) return { slot: `event:${index}`, usage: detail.usage };
  return null;
}

/**
 * Sum provider-reported token usage over one invocation's harness event log.
 * Repeated samples for one turn/step replace the earlier value (dsh contract),
 * while distinct turns/steps accumulate.
 */
function extractTokenUsage(events) {
  const slots = new Map();
  if (Array.isArray(events)) {
    events.forEach((event, index) => {
      const sample = usageOfEvent(event, index);
      if (sample) slots.set(sample.slot, normalizeTokenUsage(sample.usage));
    });
  }
  const totals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  for (const usage of slots.values()) {
    totals.promptTokens += usage.promptTokens;
    totals.completionTokens += usage.completionTokens;
    totals.totalTokens += usage.totalTokens;
  }
  return totals;
}

function createTokenUsageRepository({ insert, rows }) {
  function record(usage) {
    return insert("ai_token_usage", usage);
  }

  async function summarize({ capabilityId, from, groupBy, projectId, to } = {}) {
    const conditions = [];
    const params = {};
    if (projectId) {
      conditions.push("project_id = @projectId");
      params.projectId = projectId;
    }
    if (capabilityId) {
      conditions.push("capability_id = @capabilityId");
      params.capabilityId = capabilityId;
    }
    if (from) {
      conditions.push("created_at >= @from");
      params.from = from;
    }
    if (to) {
      conditions.push("created_at <= @to");
      params.to = to;
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const grouped = await rows(
      `SELECT capability_id, capability_version,
              COUNT(*) AS invocations,
              SUM(prompt_tokens) AS prompt_tokens,
              SUM(completion_tokens) AS completion_tokens,
              SUM(total_tokens) AS total_tokens
         FROM ai_token_usage${where}
        GROUP BY capability_id, capability_version
        ORDER BY total_tokens DESC, capability_id ASC, capability_version ASC`,
      params,
    );
    const total = { invocations: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const byCapability = grouped.map((row) => {
      total.invocations += row.invocations;
      total.promptTokens += row.prompt_tokens;
      total.completionTokens += row.completion_tokens;
      total.totalTokens += row.total_tokens;
      return {
        capabilityId: row.capability_id,
        capabilityVersion: row.capability_version,
        invocations: row.invocations,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
        totalTokens: row.total_tokens,
      };
    });
    const summary = { byCapability, total };
    // Optional daily aggregation (Sprint 5.3 usage dashboard). The default
    // response shape stays exactly the pre-existing { byCapability, total }.
    if (groupBy === "day") {
      const dayRows = await rows(
        `SELECT substr(created_at, 1, 10) AS date,
                COUNT(*) AS invocations,
                SUM(prompt_tokens) AS prompt_tokens,
                SUM(completion_tokens) AS completion_tokens,
                SUM(total_tokens) AS total_tokens
           FROM ai_token_usage${where}
          GROUP BY substr(created_at, 1, 10)
          ORDER BY date ASC`,
        params,
      );
      summary.byDay = dayRows.map((row) => ({
        date: row.date,
        invocations: row.invocations,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
        totalTokens: row.total_tokens,
      }));
    }
    return summary;
  }

  return { record, summarize };
}

module.exports = {
  createTokenUsageRepository,
  extractTokenUsage,
  normalizeTokenUsage,
};
