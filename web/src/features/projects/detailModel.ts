import { fetchRequirements } from '../requirements/api';
import { fetchDefects, fetchTestCases } from '../testing/api';
import { fetchBuilds, fetchReleases } from '../delivery/api';
import { ApiError } from '../../services/api';
import type { ProjectDetail } from '../../types';
import type { ProjectDeliveryData } from './deliveryModel';
import {
  PROJECT_STATUS_LABELS,
  PROCESS_MODE_LABELS,
  TASK_STATUS_LABELS,
  SPRINT_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  labelOf,
} from '../../constants/enums';

export type DetailTab = 'overview' | 'wbs' | 'kanban' | 'flow' | 'governance' | 'source';

export const PROJECT_ACTIVATION_MISSING_LABELS: Record<string, string> = {
  projectObjective: '项目目标',
  plannedDates: '计划起止日期',
  projectMembers: '项目成员',
  milestoneOrSprint: '首个里程碑或 Sprint',
  riskOwners: '高风险责任人',
  capacityAllocations: '项目投入分配',
  capacityPlans: '成员容量计划',
  capacityApprovals: '超配例外审批',
};

export function activationGateMissing(error: unknown): string[] {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return [];
  const body = error.body as { errorCode?: unknown; details?: { missing?: unknown } };
  if (body.errorCode !== 'PROJECT_ACTIVATION_GATE_BLOCKED' || !Array.isArray(body.details?.missing)) return [];
  return body.details.missing.filter((item): item is string => typeof item === 'string');
}

export function activationGateSummary(missing: string[]): string {
  const labels = missing.map((item) => PROJECT_ACTIVATION_MISSING_LABELS[item] ?? item);
  return labels.length ? `激活前还需要完成：${labels.join('、')}` : '项目尚未满足激活门禁。';
}

export const STORAGE_KEYS = {
  projectFilter: 'projects-list-filter',
  projectKeyword: 'projects-list-keyword',
  detailTab: 'project-detail-tab',
  wbsOwner: 'project-wbs-owner-filter',
  wbsStatus: 'project-wbs-status-filter',
};

export function fetchProjectDeliveryData(project: ProjectDetail): Promise<ProjectDeliveryData> {
  return Promise.all([
    fetchRequirements({ projectId: project.id }),
    fetchTestCases({ projectId: project.id }),
    fetchDefects({ projectId: project.id }),
    fetchBuilds(project.id),
    project.productId ? fetchReleases(project.productId) : Promise.resolve([]),
  ]).then(([requirements, testCases, defects, builds, releases]) => ({
    requirements,
    testCases,
    defects,
    builds,
    releases,
  }));
}

export function buildProjectAiPrompt(project: ProjectDetail): string {
  const statusCounts = project.tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] ?? 0) + 1;
    return acc;
  }, {});
  const blockedTasks = project.tasks
    .filter((task) => task.status === 'blocked')
    .slice(0, 6)
    .map((task) => `${task.title}（负责人：${task.owner || '未指派'}，进度：${task.progress ?? 0}%）`);
  const overdueOrDueTasks = project.tasks
    .filter((task) => task.dueDate)
    .slice(0, 8)
    .map((task) => `${task.title}：${task.dueDate} / ${labelOf(TASK_STATUS_LABELS, task.status)}`);
  const sprints = project.sprints
    .slice(0, 6)
    .map((sprint) => `${sprint.name}：${labelOf(SPRINT_STATUS_LABELS, sprint.status)}，${sprint.startDate || '未设开始'} 至 ${sprint.endDate || '未设结束'}`);

  return [
    '请作为项目管理 AI 助手，基于下面项目快照给出项目执行建议。',
    '请控制在 800 字以内，输出：1. 当前判断 2. 主要风险 3. 下一步行动 4. 需要补充的数据。',
    '',
    `项目：${project.name}（${project.code || project.id}）`,
    `状态：${labelOf(PROJECT_STATUS_LABELS, project.status)}，流程：${labelOf(PROCESS_MODE_LABELS, project.processMode)}`,
    `负责人：${project.owner}`,
    `进度：${project.progress}% / 健康分：${project.healthScore} / 风险数：${project.riskCount}`,
    `排期：${project.startDate || '未设开始'} 至 ${project.endDate || '未设结束'}`,
    `任务数：${project.tasks.length}`,
    `任务状态分布：${Object.entries(statusCounts).map(([status, count]) => `${labelOf(TASK_STATUS_LABELS, status)} ${count}`).join('、') || '无任务'}`,
    `阻塞任务：${blockedTasks.length ? blockedTasks.join('；') : '无'}`,
    `近期/已设截止任务：${overdueOrDueTasks.length ? overdueOrDueTasks.join('；') : '无'}`,
    `迭代：${sprints.length ? sprints.join('；') : '无'}`,
    `里程碑：${project.milestones.length ? project.milestones.map((item) => `${item.name} ${item.date || ''} ${labelOf(MILESTONE_STATUS_LABELS, item.status)}`).join('；') : '无'}`,
  ].join('\n');
}
