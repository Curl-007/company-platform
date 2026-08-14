function createResponseHelpers({ now, randomUUID }) {
  if (typeof now !== "function" || typeof randomUUID !== "function") {
    throw new Error("createResponseHelpers requires now() and randomUUID() functions.");
  }

  function ok(data, meta = {}) {
    return { data, meta: { generatedAt: now(), ...meta } };
  }

  function fail(res, status, errorCode, message, details) {
    return res.status(status).json({
      errorCode,
      message,
      traceId: randomUUID(),
      ...(details === undefined ? {} : { details }),
    });
  }

  function paginatedResponse(allItems, query) {
    const page = query.page != null ? Math.max(1, parseInt(query.page, 10) || 1) : null;
    const pageSize = query.pageSize != null ? Math.max(1, Math.min(200, parseInt(query.pageSize, 10) || 20)) : null;
    if (page != null && pageSize != null) {
      const total = allItems.length;
      const start = (page - 1) * pageSize;
      const items = allItems.slice(start, start + pageSize);
      return { items, page, pageSize, total };
    }
    return allItems;
  }

  return { fail, ok, paginatedResponse };
}

module.exports = { createResponseHelpers };
