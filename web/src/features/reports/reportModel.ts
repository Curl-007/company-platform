import type { DashboardData, Project, RequirementProgress } from '../../types';
import { PROJECT_STATUS_LABELS, labelOf } from '../../constants/enums';

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
    { label: '健康', count: projects.filter((project) => project.healthScore >= 75).length, tone: 'success' as const },
    { label: '关注', count: projects.filter((project) => project.healthScore >= 50 && project.healthScore < 75).length, tone: 'warning' as const },
    { label: '高风险', count: projects.filter((project) => project.healthScore < 50).length, tone: 'risk' as const },
  ];
  const taskCounts = data.metrics.tasks;
  const doneTasks = Number(taskCounts.done ?? 0);
  const blockedTasks = Number(taskCounts.blocked ?? 0);
  const totalTasks = Number(taskCounts.total ?? 0);
  const doneRate = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const blockedRate = totalTasks ? Math.round((blockedTasks / totalTasks) * 100) : 0;
  const actionItems = [
    data.metrics.openRisks > 0
      ? { tone: 'risk' as const, title: '风险收敛', detail: `当前累计 ${data.metrics.openRisks} 个开放风险，优先处理健康度最低的项目。` }
      : { tone: 'success' as const, title: '风险状态', detail: '当前没有开放风险项目，可保持常规巡检节奏。' },
    data.metrics.testPassRate < 90
      ? { tone: 'warning' as const, title: '质量门禁', detail: `测试通过率 ${data.metrics.testPassRate}%，发布前建议补充回归证据。` }
      : { tone: 'success' as const, title: '质量门禁', detail: '测试通过率已达到目标，可继续观察缺陷关闭趋势。' },
    data.metrics.requirementCompletionAverage < 70
      ? { tone: 'info' as const, title: '需求推进', detail: '需求平均完成率偏低，建议拆分低进展需求并绑定负责人。' }
      : { tone: 'info' as const, title: '需求推进', detail: '需求整体推进稳定，可关注验收证据完整度。' },
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
    .map((project) => `${project.id} ${project.name} / ${labelOf(PROJECT_STATUS_LABELS, project.status)} / 健康 ${project.healthScore} / 风险 ${project.riskCount} / 进度 ${project.progress}%`);
  const lowRequirements = reportModel.lowRequirements.slice(0, 4)
    .map((item) => `${item.id} ${item.title} / ${item.projectName} / 完成 ${item.completion}%`);
  const viewLabel = view === 'overview' ? '经营概览' : view === 'risk' ? '风险分析' : '交付追踪';

  return [
    '请作为项目组合报表 AI 分析师，基于下面报表数据生成管理层解读。',
    `当前报表视图：${viewLabel}`,
    '请控制在 500 字以内，只输出：1. 报表结论 2. 异常指标 3. 三条管理动作 4. 一句话摘要。',
    '必须引用具体项目、需求或指标。',
    '',
    `项目平均健康度：${data.metrics.projectHealthAverage}`,
    `需求平均完成率：${data.metrics.requirementCompletionAverage}%`,
    `测试通过率：${data.metrics.testPassRate}%`,
    `开放风险：${data.metrics.openRisks}`,
    `任务完成率：${reportModel.doneRate}%，阻塞率：${reportModel.blockedRate}%`,
    '',
    '风险项目：',
    riskProjects.length ? riskProjects.join('\n') : '暂无风险项目',
    '',
    '低进展需求：',
    lowRequirements.length ? lowRequirements.join('\n') : '暂无低进展需求',
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
