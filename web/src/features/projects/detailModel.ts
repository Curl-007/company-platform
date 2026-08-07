import { fetchRequirements } from '../requirements/api';
import { fetchDefects, fetchTestCases } from '../testing/api';
import { fetchBuilds, fetchReleases } from '../delivery/api';
import { ApiError } from '../../services/api';
import type { ProjectDetail } from '../../types';
import type { ProjectDeliveryData } from './deliveryModel';
import i18n from '../../i18n';
import {
  PROJECT_STATUS_LABELS,
  PROCESS_MODE_LABELS,
  TASK_STATUS_LABELS,
  SPRINT_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  labelOf,
} from '../../constants/enums';

export type DetailTab = 'overview' | 'wbs' | 'kanban' | 'flow' | 'governance';

export const PROJECT_ACTIVATION_MISSING_LABELS: Record<string, string> = {
  projectObjective: 'features.projects.detailModel.missingLabels.projectObjective',
  plannedDates: 'features.projects.detailModel.missingLabels.plannedDates',
  projectMembers: 'features.projects.detailModel.missingLabels.projectMembers',
  milestoneOrSprint: 'features.projects.detailModel.missingLabels.milestoneOrSprint',
  riskOwners: 'features.projects.detailModel.missingLabels.riskOwners',
  capacityAllocations: 'features.projects.detailModel.missingLabels.capacityAllocations',
  capacityPlans: 'features.projects.detailModel.missingLabels.capacityPlans',
  capacityApprovals: 'features.projects.detailModel.missingLabels.capacityApprovals',
};

export function activationGateMissing(error: unknown): string[] {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return [];
  const body = error.body as { errorCode?: unknown; details?: { missing?: unknown } };
  if (body.errorCode !== 'PROJECT_ACTIVATION_GATE_BLOCKED' || !Array.isArray(body.details?.missing)) return [];
  return body.details.missing.filter((item): item is string => typeof item === 'string');
}

export function activationGateSummary(missing: string[]): string {
  const labels = missing.map((item) => {
    const key = PROJECT_ACTIVATION_MISSING_LABELS[item];
    return key ? i18n.t(key) : item;
  });
  return labels.length
    ? i18n.t('features.projects.detailModel.activationSummary', { labels: labels.join('、') })
    : i18n.t('features.projects.detailModel.notSatisfied');
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
    .map((task) => i18n.t('features.projects.detailModel.aiBlockedTaskItem', {
      title: task.title,
      owner: task.owner || i18n.t('features.projects.common.unassigned'),
      progress: task.progress ?? 0,
    }));
  const overdueOrDueTasks = project.tasks
    .filter((task) => task.dueDate)
    .slice(0, 8)
    .map((task) => `${task.title}：${task.dueDate} / ${labelOf(TASK_STATUS_LABELS, task.status)}`);
  const sprints = project.sprints
    .slice(0, 6)
    .map((sprint) => i18n.t('features.projects.detailModel.aiSprintItem', {
      name: sprint.name,
      status: labelOf(SPRINT_STATUS_LABELS, sprint.status),
      start: sprint.startDate || i18n.t('features.projects.common.startUnset'),
      end: sprint.endDate || i18n.t('features.projects.common.endUnset'),
    }));

  return [
    i18n.t('features.projects.detailModel.aiIntro'),
    i18n.t('features.projects.detailModel.aiFormat'),
    '',
    i18n.t('features.projects.detailModel.aiProject', { name: project.name, id: project.code || project.id }),
    i18n.t('features.projects.detailModel.aiStatus', {
      status: labelOf(PROJECT_STATUS_LABELS, project.status),
      process: labelOf(PROCESS_MODE_LABELS, project.processMode),
    }),
    i18n.t('features.projects.detailModel.aiOwner', { owner: project.owner }),
    i18n.t('features.projects.detailModel.aiProgress', {
      progress: project.progress,
      health: project.healthScore,
      riskCount: project.riskCount,
    }),
    i18n.t('features.projects.detailModel.aiSchedule', {
      start: project.startDate || i18n.t('features.projects.common.startUnset'),
      end: project.endDate || i18n.t('features.projects.common.endUnset'),
    }),
    i18n.t('features.projects.detailModel.aiTaskCount', { count: project.tasks.length }),
    i18n.t('features.projects.detailModel.aiTaskDistribution', {
      distribution: Object.entries(statusCounts).map(([status, count]) => `${labelOf(TASK_STATUS_LABELS, status)} ${count}`).join('、') || i18n.t('features.projects.detailModel.noTasks'),
    }),
    i18n.t('features.projects.detailModel.aiBlockedTasks', {
      items: blockedTasks.length ? blockedTasks.join('；') : i18n.t('features.projects.common.none'),
    }),
    i18n.t('features.projects.detailModel.aiDueTasks', {
      items: overdueOrDueTasks.length ? overdueOrDueTasks.join('；') : i18n.t('features.projects.common.none'),
    }),
    i18n.t('features.projects.detailModel.aiSprints', {
      items: sprints.length ? sprints.join('；') : i18n.t('features.projects.common.none'),
    }),
    i18n.t('features.projects.detailModel.aiMilestones', {
      items: project.milestones.length
        ? project.milestones.map((item) => `${item.name} ${item.date || ''} ${labelOf(MILESTONE_STATUS_LABELS, item.status)}`).join('；')
        : i18n.t('features.projects.common.none'),
    }),
  ].join('\n');
}
