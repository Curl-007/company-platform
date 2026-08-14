function shouldClearSummaryCache(action) {
  return typeof action === "string"
    && !action.startsWith("ai.")
    && !action.startsWith("auth.")
    && action !== "page.view";
}

function createSummaryInvalidatingAudit({ writeAuditLog, clearSummaryCache }) {
  if (typeof writeAuditLog !== "function" || typeof clearSummaryCache !== "function") {
    throw new Error("createSummaryInvalidatingAudit requires writeAuditLog() and clearSummaryCache().");
  }

  async function audit(actor, action, resourceType, resourceId, beforeValue, afterValue, ip, explicitScope) {
    const result = await writeAuditLog(actor, action, resourceType, resourceId, beforeValue, afterValue, ip, explicitScope);
    try {
      if (shouldClearSummaryCache(action)) clearSummaryCache();
    } catch {
      // Cache maintenance must never turn an otherwise durable mutation into a failure.
    }
    return result;
  }

  return { audit };
}

module.exports = { createSummaryInvalidatingAudit, shouldClearSummaryCache };
