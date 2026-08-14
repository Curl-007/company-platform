import { buildQuery, unwrap, unwrapPost } from '../../services/apiClient';
import type {
  TeamWorkSummary,
  WeeklyWorkSummary,
  WorkLog,
  WorkLogAnalysis,
  WorkLogPayload,
} from '../../types';

export interface TeamWorkLogFilters {
  projectId?: string;
  project?: string;
  role?: string;
  author?: string;
  date?: string;
}

export function analyzeWorkLog(payload: WorkLogPayload): Promise<WorkLogAnalysis> {
  return unwrapPost<WorkLogAnalysis>('/api/ai/logs/analyze', payload, { invalidateCache: false });
}

export function fetchWorkLogs(): Promise<WorkLog[]> {
  return unwrap<WorkLog[]>('/api/work-logs');
}

export function createWorkLog(input: WorkLogPayload, idempotencyKey?: string): Promise<{ id: string; analysis: WorkLogAnalysis }> {
  return unwrapPost<{ id: string; analysis: WorkLogAnalysis }>('/api/work-logs', input, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    invalidation: 'workLogs',
  });
}

export function fetchWeeklyWorkSummary(week?: string, author?: string): Promise<WeeklyWorkSummary> {
  return unwrap<WeeklyWorkSummary>(`/api/work-logs/weekly-summary${buildQuery({ week, author })}`);
}

export function fetchTeamWorkLogs(filters: TeamWorkLogFilters = {}): Promise<WorkLog[]> {
  return unwrap<WorkLog[]>(`/api/work-logs/team${buildQuery(filters as Record<string, string | undefined>)}`);
}

export function fetchTeamWeeklySummary(
  filters: { projectId?: string; project?: string; week?: string; role?: string } = {},
): Promise<TeamWorkSummary> {
  return unwrap<TeamWorkSummary>(`/api/work-logs/team-weekly-summary${buildQuery(filters)}`);
}
