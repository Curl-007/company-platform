function createStrategyRepository({ insert, row, rows, run }) {
  return {
    listProducts: () => rows("SELECT * FROM products"),
    listLiveProjectIdsWithProduct: () => rows("SELECT id, product_id FROM projects WHERE deleted_at IS NULL"),
    listLiveProjectIds: () => rows("SELECT id FROM projects WHERE deleted_at IS NULL"),
    findLiveProject: (id) => row("SELECT * FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findLiveProjectId: (id) => row("SELECT id FROM projects WHERE id = @id AND deleted_at IS NULL", { id }),
    findProjectProgramAssignment: (id) => row("SELECT id, program_id FROM projects WHERE id = @id", { id }),
    listProgramProjectIds: async (programId) => (await rows(
      "SELECT id FROM projects WHERE program_id = @programId AND deleted_at IS NULL ORDER BY id",
      { programId },
    )).map((project) => project.id),
    updateProgramProjectIdsCache: ({ id, projectIds, updatedAt }) => run(
      "UPDATE programs SET project_ids = @projectIds, updated_at = @updatedAt WHERE id = @id",
      { id, projectIds, updatedAt },
    ),
    findProgramId: (id) => row("SELECT id FROM programs WHERE id = @id", { id }),
    findProgram: (id) => row("SELECT * FROM programs WHERE id = @id", { id }),
    listPrograms: () => rows("SELECT * FROM programs ORDER BY updated_at DESC"),
    listProgramsUnsorted: () => rows("SELECT * FROM programs"),
    createProgram: (program) => insert("programs", program),
    updateProgram: (program) => run(
      `UPDATE programs SET name = @name, owner = @owner, objective = @objective, status = @status,
        risks = @risks, updated_at = @updatedAt WHERE id = @id`,
      program,
    ),
    assignProjectToProgram: ({ id, programId, updatedAt }) => run(
      "UPDATE projects SET program_id = @programId, updated_at = @updatedAt, version = COALESCE(version, 1) + 1 WHERE id = @id",
      { id, programId, updatedAt },
    ),
    detachProjectFromProgram: ({ id, programId, updatedAt }) => run(
      "UPDATE projects SET program_id = NULL, updated_at = @updatedAt, version = COALESCE(version, 1) + 1 WHERE id = @id AND program_id = @programId",
      { id, programId, updatedAt },
    ),
    listProgramProjectsIncludingArchived: (programId) => rows(
      "SELECT id FROM projects WHERE program_id = @programId ORDER BY id",
      { programId },
    ),
    deleteProgram: (id) => run("DELETE FROM programs WHERE id = @id", { id }),

    findProductId: (id) => row("SELECT id FROM products WHERE id = @id", { id }),
    findPortfolioId: (id) => row("SELECT id FROM portfolios WHERE id = @id", { id }),
    findPortfolio: (id) => row("SELECT * FROM portfolios WHERE id = @id", { id }),
    listPortfolios: () => rows("SELECT * FROM portfolios ORDER BY name"),
    listPortfoliosUnsorted: () => rows("SELECT * FROM portfolios"),
    createPortfolio: (portfolio) => insert("portfolios", portfolio),
    updatePortfolio: (portfolio) => run(
      `UPDATE portfolios SET name = @name, owner = @owner, objective = @objective, status = @status,
        product_ids = @productIds, roadmap = @roadmap WHERE id = @id`,
      portfolio,
    ),
    listPortfolioRequirementIds: (id) => rows(
      "SELECT id FROM requirements WHERE portfolio_id = @id AND deleted_at IS NULL",
      { id },
    ),
    deletePortfolio: (id) => run("DELETE FROM portfolios WHERE id = @id", { id }),

    listStrategicGoals: () => rows("SELECT * FROM strategic_goals ORDER BY updated_at DESC"),
    findStrategicGoal: (id) => row("SELECT * FROM strategic_goals WHERE id = @id", { id }),
    createStrategicGoal: (goal) => insert("strategic_goals", goal),
    updateStrategicGoal: (goal) => run(
      `UPDATE strategic_goals SET name = @name, owner = @owner, objective = @objective, status = @status,
        period_start = @periodStart, period_end = @periodEnd, success_metrics = @successMetrics,
        program_ids = @programIds, portfolio_ids = @portfolioIds, updated_at = @updatedAt WHERE id = @id`,
      goal,
    ),
    deleteStrategicGoal: (id) => run("DELETE FROM strategic_goals WHERE id = @id", { id }),
  };
}

module.exports = { createStrategyRepository };
