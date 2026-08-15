import i18n from '../../../../i18n';
import { createIdempotencyKey } from '../../../../services/idempotency';
import {
  createWbsTask,
  deleteTask,
  fetchTask,
  updateTask,
  updateTaskStatus,
  createSprint,
  updateSprint,
  deleteSprint,
} from '../../../tasks/api';
import {
  createProject,
  fetchProject,
  updateProject,
  updateProjectStatus,
  deleteProject,
  createProjectRisk,
} from '../../../projects/api';
import type { AiActionHandler } from './types';

// ---------------------------------------------------------------------------
// Planning actions: WBS tasks, sprints, projects and project risks.
// ---------------------------------------------------------------------------

export const planningHandlers: Record<string, AiActionHandler> = {
  create_task: async (draft) => {
    if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.taskTitleProjectMissing'));
    const created = await createWbsTask(draft.projectId, {
      title: draft.title.trim(),
      owner: draft.assignee.trim() || undefined,
      type: draft.taskType || 'task',
      estimatedHours: draft.estimatedHours ? Number(draft.estimatedHours) : undefined,
    }, createIdempotencyKey('ai-task'));
    return created.id;
  },

  update_task: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.taskIdRequired'));
    const current = await fetchTask(draft.resourceId.trim());
    await updateTask(draft.resourceId.trim(), {
      version: Number(current.version || 1),
      title: draft.title.trim() || undefined,
      owner: draft.assignee.trim() || undefined,
      type: draft.taskType || undefined,
      estimatedHours: draft.estimatedHours ? Number(draft.estimatedHours) : undefined,
    });
    return draft.resourceId.trim();
  },

  update_task_status: async (draft) => {
    if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.taskIdStatusRequired'));
    const current = await fetchTask(draft.resourceId.trim());
    await updateTaskStatus(draft.resourceId.trim(), {
      status: draft.status,
      version: Number(current.version || 1),
      statusReason: draft.reason.trim() || undefined,
      progress: draft.status === 'done' ? 100 : undefined,
    });
    return draft.resourceId.trim();
  },

  delete_task: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.taskIdRequired'));
    await deleteTask(draft.resourceId.trim());
    return draft.resourceId.trim();
  },

  create_sprint: async (draft) => {
    if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.sprintNameProjectMissing'));
    const created = await createSprint(draft.projectId, {
      name: draft.title.trim(),
      goal: draft.objective.trim() || draft.description.trim() || undefined,
    }, createIdempotencyKey('ai-spr'));
    return created.id;
  },

  update_sprint: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.sprintIdRequired'));
    await updateSprint(draft.resourceId.trim(), {
      name: draft.title.trim() || undefined,
      goal: draft.objective.trim() || draft.description.trim() || undefined,
      status: draft.status || undefined,
    });
    return draft.resourceId.trim();
  },

  delete_sprint: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.sprintIdRequired'));
    await deleteSprint(draft.resourceId.trim());
    return draft.resourceId.trim();
  },

  create_project: async (draft) => {
    if (!draft.title.trim() || !draft.owner.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.projectNameOwnerMissing'));
    const created = await createProject({
      name: draft.title.trim(),
      owner: draft.owner.trim(),
      objective: draft.objective.trim() || draft.description.trim() || undefined,
    }, createIdempotencyKey('ai-prj'));
    return created.id;
  },

  update_project: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.projectIdRequired'));
    const current = await fetchProject(draft.resourceId.trim());
    await updateProject(draft.resourceId.trim(), {
      version: Number(current.version || 1),
      name: draft.title.trim() || undefined,
      objective: draft.objective.trim() || draft.description.trim() || undefined,
      owner: draft.owner.trim() || undefined,
    });
    return draft.resourceId.trim();
  },

  update_project_status: async (draft) => {
    if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.projectIdStatusRequired'));
    const current = await fetchProject(draft.resourceId.trim());
    await updateProjectStatus(draft.resourceId.trim(), draft.status, Number(current.version || 1));
    return draft.resourceId.trim();
  },

  delete_project: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.projectIdRequired'));
    await deleteProject(draft.resourceId.trim());
    return draft.resourceId.trim();
  },

  create_risk: async (draft) => {
    if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.riskTitleProjectMissing'));
    const created = await createProjectRisk(draft.projectId, {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      severity: (draft.severity as 'low' | 'medium' | 'high' | 'critical') || 'medium',
      ownerName: draft.owner.trim() || undefined,
    });
    return created.id;
  },
};
