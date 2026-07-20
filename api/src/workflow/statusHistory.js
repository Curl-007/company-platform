function mapStatusHistory(item) {
  return {
    id: item.id,
    resourceType: item.resource_type,
    resourceId: item.resource_id,
    projectId: item.project_id || null,
    fromStatus: item.from_status || null,
    toStatus: item.to_status,
    reason: item.reason || "",
    actorId: item.actor_id || null,
    actorName: item.actor_name || "",
    createdAt: item.created_at,
  };
}

function createStatusHistory({ insert, nextId, now, rows }) {
  async function record({ resourceType, resourceId, projectId = null, fromStatus = null, toStatus, reason = "", actor }) {
    if (!resourceType || !resourceId || !toStatus || fromStatus === toStatus) return null;
    const history = {
      id: await nextId("STH", "status_histories"),
      resource_type: resourceType,
      resource_id: resourceId,
      project_id: projectId,
      from_status: fromStatus,
      to_status: toStatus,
      reason: String(reason || "").trim(),
      actor_id: actor?.id || null,
      actor_name: actor?.name || "",
      created_at: now(),
    };
    await insert("status_histories", history);
    return mapStatusHistory(history);
  }

  async function list(resourceType, resourceId) {
    const items = await rows(
      `SELECT * FROM status_histories
       WHERE resource_type = @resourceType AND resource_id = @resourceId
       ORDER BY created_at DESC, id DESC`,
      { resourceType, resourceId },
    );
    return items.map(mapStatusHistory);
  }

  return { list, record };
}

module.exports = {
  createStatusHistory,
  mapStatusHistory,
};
