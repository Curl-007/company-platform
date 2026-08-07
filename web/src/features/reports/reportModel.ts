import type { DashboardData, Project, RequirementProgress } from '../../types';
import { PROJECT_STATUS_LABELS, labelOf } from '../../constants/enums';
import i18n from '../../i18n';

export type ReportView = 'overview' | 'risk' | 'delivery';
export type ReportActionTone = 'success' | 'warning' | 'risk' | 'info';

export interface ReportActionItem {
  tone: ReportActionTone;
  title: string;
  detail: string;
}

export interface ReportModel {
  riskProjects: Project[];
  lowRequirements: RequirementProgress[];
  healthBuckets: Array<{ label: string; count: number; tone: 'success' | 'warning' | 'risk' }>;
  taskCounts: DashboardData['metrics']['tasks'];
  doneRate: number;
  blockedRate: number;
  actionItems: ReportActionItem[];
}

export function buildReportModel(data: DashboardData): ReportModel {
  const projects = data.riskyProjects;
  const riskProjects = [...projects].sort((a, b) => b.riskCount - a.riskCount || a.healthScore - b.healthScore);
  const lowRequirements = [...data.requirementProgress]
    .sort((a, b) => a.completion - b.completion)
    .slice(0, 8);
  const healthBuckets = [
    { label: i18n.t('features.reports.reportModel.healthHealthy'), count: projects.filter((project) => project.healthScore >= 75).length, tone: 'success' as const },
    { label: i18n.t('features.reports.reportModel.healthWatch'), count: projects.filter((project) => project.healthScore >= 50 && project.healthScore < 75).length, tone: 'warning' as const },
    { label: i18n.t('features.reports.reportModel.healthHighRisk'), count: projects.filter((project) => project.healthScore < 50).length, tone: 'risk' as const },
  ];
  const taskCounts = data.metrics.tasks;
  const doneTasks = Number(taskCounts.done ?? 0);
  const blockedTasks = Number(taskCounts.blocked ?? 0);
  const totalTasks = Number(taskCounts.total ?? 0);
  const doneRate = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const blockedRate = totalTasks ? Math.round((blockedTasks / totalTasks) * 100) : 0;
  const actionItems = [
    data.metrics.openRisks > 0
      ? { tone: 'risk' as const, title: i18n.t('features.reports.reportModel.riskConvergence'), detail: i18n.t('features.reports.reportModel.riskConvergenceDetail', { count: data.metrics.openRisks }) }
      : { tone: 'success' as const, title: i18n.t('features.reports.reportModel.riskStatus'), detail: i18n.t('features.reports.reportModel.riskStatusDetail') },
    data.metrics.testPassRate < 90
      ? { tone: 'warning' as const, title: i18n.t('features.reports.reportModel.qualityGate'), detail: i18n.t('features.reports.reportModel.qualityGateLowDetail', { rate: data.metrics.testPassRate }) }
      : { tone: 'success' as const, title: i18n.t('features.reports.reportModel.qualityGate'), detail: i18n.t('features.reports.reportModel.qualityGateOkDetail') },
    data.metrics.requirementCompletionAverage < 70
      ? { tone: 'info' as const, title: i18n.t('features.reports.reportModel.requirementAdvance'), detail: i18n.t('features.reports.reportModel.requirementLowDetail') }
      : { tone: 'info' as const, title: i18n.t('features.reports.reportModel.requirementAdvance'), detail: i18n.t('features.reports.reportModel.requirementOkDetail') },
  ];

  return { riskProjects, lowRequirements, healthBuckets, taskCounts, doneRate, blockedRate, actionItems };
}

export function buildHealthRankData(data: DashboardData) {
  return [...data.riskyProjects]
    .sort((a, b) => b.healthScore - a.healthScore)
    .slice(0, 8)
    .map((project) => ({
      name: project.name.length > 10 ? `${project.name.slice(0, 10)}...` : project.name,
      health: project.healthScore,
      id: project.id,
    }));
}

export function buildReportsAiPrompt(data: DashboardData, reportModel: ReportModel, view: ReportView): string {
  const riskProjects = reportModel.riskProjects.slice(0, 4)
    .map((project) => i18n.t('features.reports.reportModel.riskProjectItem', {
      id: project.id,
      name: project.name,
      status: labelOf(PROJECT_STATUS_LABELS, project.status),
      health: project.healthScore,
      risk: project.riskCount,
      progress: project.progress,
    }));
  const lowRequirements = reportModel.lowRequirements.slice(0, 4)
    .map((item) => i18n.t('features.reports.reportModel.requirementItem', {
      id: item.id,
      title: item.title,
      project: item.projectName,
      completion: item.completion,
    }));
  const viewLabel = view === 'overview' ? i18n.t('features.reports.reportModel.viewOverview') : view === 'risk' ? i18n.t('features.reports.reportModel.viewRisk') : i18n.t('features.reports.reportModel.viewDelivery');

  return [
    i18n.t('features.reports.reportModel.promptIntro'),
    i18n.t('features.reports.reportModel.promptViewLabel', { label: viewLabel }),
    i18n.t('features.reports.reportModel.promptInstructions'),
    i18n.t('features.reports.reportModel.promptReference'),
    '',
    i18n.t('features.reports.reportModel.avgHealth', { value: data.metrics.projectHealthAverage }),
    i18n.t('features.reports.reportModel.avgRequirementCompletion', { value: data.metrics.requirementCompletionAverage }),
    i18n.t('features.reports.reportModel.testPassRate', { value: data.metrics.testPassRate }),
    i18n.t('features.reports.reportModel.openRisks', { count: data.metrics.openRisks }),
    i18n.t('features.reports.reportModel.taskCompletion', { done: reportModel.doneRate, blocked: reportModel.blockedRate }),
    '',
    i18n.t('features.reports.reportModel.riskyProjectsHeading'),
    riskProjects.length ? riskProjects.join('\n') : i18n.t('features.reports.reportModel.noRiskyProjects'),
    '',
    i18n.t('features.reports.reportModel.lowRequirementsHeading'),
    lowRequirements.length ? lowRequirements.join('\n') : i18n.t('features.reports.reportModel.noLowRequirements'),
  ].join('\n');
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number | null | undefined>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number | null | undefined) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportReportCsv(data: DashboardData, reportModel: ReportModel, view: ReportView) {
  if (view === 'risk') {
    downloadCsv('risk-projects.csv', reportModel.riskProjects.map((project) => ({
      id: project.id,
      name: project.name,
      status: labelOf(PROJECT_STATUS_LABELS, project.status),
      healthScore: project.healthScore,
      riskCount: project.riskCount,
      progress: project.progress,
    })));
    return;
  }
  if (view === 'delivery') {
    downloadCsv('requirement-progress.csv', data.requirementProgress.map((item) => ({
      id: item.id,
      title: item.title,
      projectId: item.projectId,
      projectName: item.projectName,
      completion: item.completion,
    })));
    return;
  }
  downloadCsv('report-summary.csv', [
    {
      projectHealthAverage: data.metrics.projectHealthAverage,
      requirementCompletionAverage: data.metrics.requirementCompletionAverage,
      testPassRate: data.metrics.testPassRate,
      documentCount: data.metrics.documentCount,
      openRisks: data.metrics.openRisks,
      totalTasks: data.metrics.tasks.total,
    },
  ]);
}
