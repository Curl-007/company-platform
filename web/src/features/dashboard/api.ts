import { unwrap } from '../../services/apiClient';
import type { Build, DashboardData, Defect } from '../../types';

export function fetchDashboard(): Promise<DashboardData> {
  return unwrap('/api/dashboard');
}

export function fetchPersonalDashboard(): Promise<DashboardData & { myDefects?: Defect[]; myBuilds?: Build[] }> {
  return unwrap('/api/dashboard/personal');
}

/** As-built reports projection endpoints (dashboard-backed). */
export function fetchReportsSummary(): Promise<Pick<DashboardData, 'metrics' | 'riskyProjects' | 'requirementProgress' | 'ai'> & { mode?: string }> {
  return unwrap('/api/reports/summary');
}

export function fetchPersonalReports(): Promise<Pick<DashboardData, 'metrics' | 'focusTasks'> & { myDefects?: Defect[]; myBuilds?: Build[]; mode?: string }> {
  return unwrap('/api/reports/personal');
}
