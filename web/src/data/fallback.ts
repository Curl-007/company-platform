import type { DashboardData } from '../types';

// ---------------------------------------------------------------------------
// Fallback dashboard data, used only when the live API is unreachable so the
// UI degrades gracefully instead of rendering an empty shell. Shape matches
// GET /api/dashboard (buildDashboard in api/server.js).
// ---------------------------------------------------------------------------

export const fallbackDashboard: DashboardData = {
  metrics: {
    tasks: { total: 0, todo: 0, in_progress: 0, in_review: 0, done: 0, blocked: 0 },
    projectHealthAverage: 0,
    requirementCompletionAverage: 0,
    testPassRate: 0,
    openRisks: 0,
    documentCount: 0,
  },
  focusTasks: [],
  riskyProjects: [],
  requirementProgress: [],
  ai: {
    title: 'AI summary unavailable',
    summary: 'The platform API could not be reached. Showing an empty workspace until the connection is restored.',
    risks: [],
    recommendations: ['Confirm the API service is running on http://localhost:4010.'],
  },
};
