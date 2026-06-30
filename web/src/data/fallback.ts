import type { DashboardData } from '../types';

// ---------------------------------------------------------------------------
// Fallback dashboard data, used only when the live API is unreachable so the
// UI degrades gracefully instead of rendering an empty shell. Shape matches
// GET /api/dashboard (buildDashboard in api/server.js).
// ---------------------------------------------------------------------------

export const fallbackDashboard: DashboardData = {
  metrics: {
    tasks: { total: 0, todo: 0, in_progress: 0, code_review: 0, done: 0, blocked: 0 },
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
    title: 'AI 摘要暂不可用',
    summary: '无法连接到平台 API。恢复连接后将正常显示工作区。',
    risks: [],
    recommendations: ['请确认 API 服务正在 http://localhost:4010 上运行。'],
  },
};
