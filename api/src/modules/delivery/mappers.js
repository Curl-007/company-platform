function mapReleaseApproval(item) {
  return {
    id: item.id,
    releaseId: item.release_id,
    decision: item.decision,
    comment: item.comment || "",
    approverId: item.approver_id || null,
    approverName: item.approver_name || "",
    createdAt: item.created_at,
  };
}

function mapRollbackRecord(item) {
  return {
    id: item.id,
    releaseId: item.release_id,
    reason: item.reason,
    impact: item.impact || "",
    plan: item.plan || "",
    operatorId: item.operator_id || null,
    operatorName: item.operator_name || "",
    createdAt: item.created_at,
  };
}

function mapDeliveryAudit(item) {
  return {
    id: item.id,
    action: item.action,
    actorName: item.actor_name || "",
    resourceType: item.resource_type,
    resourceId: item.resource_id,
    createdAt: item.created_at,
  };
}

module.exports = {
  mapDeliveryAudit,
  mapReleaseApproval,
  mapRollbackRecord,
};
