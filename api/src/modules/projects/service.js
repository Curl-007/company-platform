function buildProjectCreate(input = {}, { id, now, json }) {
  return {
    id,
    name: String(input.name).trim(),
    objective: String(input.objective || "").trim(),
    code: input.code || null,
    description: input.description || null,
    status: input.status || "planning",
    health_score: 80,
    owner: String(input.owner).trim(),
    program_id: input.programId || null,
    product_id: input.productId || null,
    process_mode: input.processMode || "scrum",
    progress: Number(input.progress) || 0,
    risk_count: 0,
    // A planning project must not satisfy the activation gate by a synthetic
    // milestone. Teams explicitly add a real milestone or create a sprint.
    milestones: json([]),
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    source_path: input.sourcePath || null,
    version: 1,
    updated_at: now,
  };
}

function buildProjectUpdate(before, input = {}, { expectedVersion, now }) {
  return {
    id: before.id,
    expectedVersion,
    name: input.name === undefined ? before.name : String(input.name).trim(),
    objective: input.objective === undefined ? (before.objective || "") : String(input.objective || "").trim(),
    code: input.code === undefined ? before.code : input.code || null,
    description: input.description === undefined ? before.description : input.description || null,
    owner: input.owner === undefined ? before.owner : String(input.owner).trim(),
    status: input.status === undefined ? before.status : input.status,
    progress: input.progress === undefined ? before.progress : Number(input.progress),
    processMode: input.processMode === undefined ? before.process_mode : input.processMode,
    programId: input.programId === undefined ? before.program_id : input.programId || null,
    productId: input.productId === undefined ? before.product_id : input.productId || null,
    milestones: input.milestones === undefined ? before.milestones : JSON.stringify(input.milestones),
    startDate: input.startDate === undefined ? before.start_date : input.startDate || null,
    endDate: input.endDate === undefined ? before.end_date : input.endDate || null,
    sourcePath: input.sourcePath === undefined ? before.source_path : input.sourcePath || null,
    updatedAt: now,
  };
}

async function projectActivationReadiness(project, repository, parse) {
  const missing = [];
  const projectStart = String(project.start_date ?? project.startDate ?? "");
  const projectEnd = String(project.end_date ?? project.endDate ?? "");
  if (!String(project.objective || "").trim()) missing.push("projectObjective");
  if (!projectStart || !projectEnd) missing.push("plannedDates");
  const evidence = await repository.activationEvidence({ projectId: project.id, projectStart, projectEnd });
  if (evidence.memberCount === 0) missing.push("projectMembers");
  const milestones = parse(project.milestones, []);
  const hasMilestone = Array.isArray(milestones) && milestones.some((milestone) => String(milestone?.name || "").trim() && String(milestone?.date || "").trim());
  if (!hasMilestone && evidence.sprintCount === 0) missing.push("milestoneOrSprint");
  if (evidence.unownedHighRiskCount > 0) missing.push("riskOwners");
  const allocationCount = evidence.allocations.length;
  const pendingAllocationCount = evidence.allocations.filter((allocation) => allocation.approval_status !== "approved").length;
  const allocationWithoutCapacityPlanCount = evidence.allocations.filter((allocation) => !allocation.capacity_plan_id).length;
  if (allocationCount === 0) missing.push("capacityAllocations");
  if (pendingAllocationCount > 0) missing.push("capacityApprovals");
  if (allocationWithoutCapacityPlanCount > 0) missing.push("capacityPlans");
  return {
    ok: missing.length === 0,
    missing,
    memberCount: evidence.memberCount,
    sprintCount: evidence.sprintCount,
    unownedHighRiskCount: evidence.unownedHighRiskCount,
    allocationCount,
    pendingAllocationCount,
    allocationWithoutCapacityPlanCount,
  };
}

module.exports = {
  buildProjectCreate,
  buildProjectUpdate,
  projectActivationReadiness,
};
