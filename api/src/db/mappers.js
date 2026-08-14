function createMappers({ parse }) {
  if (typeof parse !== "function") {
    throw new Error("createMappers requires a parse() function.");
  }

  function mapProject(item) {
    return {
      id: item.id,
      name: item.name,
      objective: item.objective || "",
      code: item.code,
      description: item.description,
      status: item.status,
      healthScore: item.health_score,
      owner: item.owner,
      programId: item.program_id,
      productId: item.product_id,
      processMode: item.process_mode,
      progress: item.progress,
      riskCount: item.risk_count,
      milestones: parse(item.milestones, []),
      startDate: item.start_date,
      endDate: item.end_date,
      sourcePath: item.source_path,
      version: Number(item.version) || 1,
      updatedAt: item.updated_at,
    };
  }

  function mapRequirement(item) {
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      priority: item.priority,
      projectId: item.project_id,
      productId: item.product_id,
      portfolioId: item.portfolio_id,
      parentId: item.parent_id || null,
      owner: item.owner,
      assignee: item.assignee || null,
      assigneeRole: item.assignee_role || null,
      assignmentStatus: item.assignment_status || "unassigned",
      completion: item.completion,
      linkedTasks: parse(item.linked_tasks, []),
      acceptanceCriteria: parse(item.acceptance_criteria, []),
      version: Number(item.version) || 1,
    };
  }

  function mapDocument(item) {
    return {
      id: item.id,
      title: item.title,
      type: item.type,
      category: item.category || "project",
      version: item.version,
      aiStatus: item.ai_status,
      owner: item.owner,
      ownerRole: item.owner_role || null,
      projectId: item.project_id || null,
      updatedAt: item.updated_at,
      linkedRequirements: parse(item.linked_requirements, []),
      risks: parse(item.risks, []),
      fileName: item.file_name,
      fileSize: item.file_size,
      fileType: item.file_type,
      storedFile: item.storage_key,
      content: item.content,
      collabRevision: Number(item.collab_revision) || 0,
    };
  }

  function mapTask(item) {
    return {
      id: item.id,
      title: item.title,
      description: item.description || null,
      status: item.status,
      statusText: item.status_text,
      projectId: item.project_id,
      owner: item.owner,
      dueDate: item.due_date,
      requirementId: item.requirement_id,
      progress: item.progress,
      blocker: item.blocker,
      type: item.type,
      parentId: item.parent_id,
      wbsCode: item.wbs_code,
      kanbanColumn: item.kanban_column,
      sortOrder: item.sort_order,
      estimatedHours: item.estimated_hours,
      actualHours: item.actual_hours,
      remainingHours: item.remaining_hours ?? 0,
      version: Number(item.version) || 1,
      sprintId: item.sprint_id,
      assigneeId: item.assignee_id,
      assigneeRole: item.assignee_role || null,
      dependencyIds: parse(item.dependency_ids, []),
      buildId: item.build_id || null,
      sourceType: item.source_type || null,
      sourceId: item.source_id || null,
    };
  }

  function mapSprint(item) {
    return {
      id: item.id,
      projectId: item.project_id,
      name: item.name,
      goal: item.goal,
      status: item.status,
      startDate: item.start_date,
      endDate: item.end_date,
    };
  }

  function mapDefect(item) {
    return {
      id: item.id,
      title: item.title,
      description: item.description || null,
      severity: item.severity,
      status: item.status,
      projectId: item.project_id,
      requirementId: item.requirement_id,
      assignee: item.assignee,
      assigneeRole: item.assignee_role || null,
      foundInBuild: item.found_in_build || null,
      affectedVersion: item.affected_version || null,
      reporter: item.reporter || null,
      version: Number(item.version) > 0 ? Number(item.version) : 1,
    };
  }

  function mapTestCase(item) {
    return {
      id: item.id,
      title: item.name,
      name: item.name,
      requirementId: item.requirement_id,
      projectId: item.project_id,
      status: item.status,
      owner: item.owner,
      assigneeRole: item.assignee_role || null,
      totalCases: item.total_cases,
      passedCases: item.passed_cases,
      failedCases: item.failed_cases,
      blockedCases: item.blocked_cases,
      description: item.description || "",
      steps: item.steps || "",
      expectedResult: item.expected_result || "",
    };
  }

  function mapTestRun(item) {
    return {
      id: item.id,
      testCaseId: item.test_case_id,
      result: item.result,
      notes: item.notes,
      executedBy: item.executed_by,
      createdAt: item.created_at,
    };
  }

  function mapUser(item) {
    if (!item) return null;
    return {
      id: item.id,
      name: item.name,
      email: item.email,
      role: item.role,
      permissions: parse(item.permissions, []),
      status: item.status,
      phone: item.phone || "",
      position: item.position || "",
      department: item.department || "",
      departmentId: item.department_id || null,
      bio: item.bio || "",
      createdAt: item.created_at,
    };
  }

  function mapBuild(item) {
    return {
      id: item.id,
      projectId: item.project_id,
      name: item.name,
      version: item.version,
      buildDate: item.build_date,
      status: item.status,
      linkedStories: parse(item.linked_stories, []),
      linkedBugs: parse(item.linked_bugs, []),
      scmHash: item.scm_hash,
      creator: item.creator,
      notes: item.notes,
      createdAt: item.created_at,
    };
  }

  function mapRelease(item) {
    return {
      id: item.id,
      productId: item.product_id,
      name: item.name,
      version: item.version,
      releaseDate: item.release_date,
      buildId: item.build_id,
      releaseType: item.release_type,
      linkedStories: parse(item.linked_stories, []),
      linkedBugs: parse(item.linked_bugs, []),
      releaseNotes: item.release_notes,
      creator: item.creator,
      creatorId: item.creator_id || null,
      status: item.status,
      createdAt: item.created_at,
    };
  }

  function mapProduct(item) {
    const imageUrls = parse(item.image_url, null);
    const normalizedImageUrls = Array.isArray(imageUrls)
      ? imageUrls.filter(Boolean)
      : item.image_url
        ? [item.image_url]
        : [];
    return {
      id: item.id,
      name: item.name,
      owner: item.owner,
      version: item.version,
      stage: item.stage,
      description: item.description || "",
      imageUrl: normalizedImageUrls[0] || null,
      imageUrls: normalizedImageUrls,
      systemName: item.system_name || "",
      systemVersion: item.system_version || "",
      applicationVersion: item.application_version || "",
      modules: parse(item.modules, []),
      hardwareInfo: parse(item.hardware_info, {}),
      systemInfo: parse(item.system_info, {}),
      applicationInfo: parse(item.application_info, {}),
      hardwareMetrics: parse(item.hardware_metrics, []),
      systemMetrics: parse(item.system_metrics, []),
      appMetrics: parse(item.app_metrics, []),
      roadmap: parse(item.roadmap, []),
    };
  }

  return {
    mapProject,
    mapRequirement,
    mapDocument,
    mapTask,
    mapSprint,
    mapDefect,
    mapTestCase,
    mapTestRun,
    mapUser,
    mapProduct,
    mapBuild,
    mapRelease,
  };
}

module.exports = {
  createMappers,
};
