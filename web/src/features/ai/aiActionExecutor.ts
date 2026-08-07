import i18n from '../../i18n';
import type { AiProposedAction } from '../../types';
import { createIdempotencyKey } from '../../services/idempotency';
import { businessDateKey } from '../../utils/businessDate';
import {
  createRequirement,
  deleteRequirement,
  fetchRequirement,
  updateRequirement,
  updateRequirementStatus,
} from '../requirements/api';
import {
  createDefect,
  deleteDefect,
  fetchDefects,
  updateDefect,
  updateDefectStatus,
  createTestCase,
  updateTestCase,
  updateTestCaseStatus,
  deleteTestCase,
} from '../testing/api';
import {
  createWbsTask,
  deleteTask,
  fetchTask,
  updateTask,
  updateTaskStatus,
  createSprint,
  updateSprint,
  deleteSprint,
} from '../tasks/api';
import {
  createProject,
  fetchProject,
  updateProject,
  updateProjectStatus,
  deleteProject,
  createProjectRisk,
} from '../projects/api';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  createProgram,
  createPortfolio,
  createStrategicGoal,
} from '../products/api';
import {
  createBuild,
  updateBuild,
  updateBuildStatus,
  deleteBuild,
  createRelease,
  updateReleaseStatus,
  deleteRelease,
} from '../delivery/api';
import {
  uploadDocument,
  updateDocument,
  deleteDocument,
} from '../documents/api';
import { createWorkLog } from '../workLogs/api';
import { createTimeEntry } from '../timeEntries/api';

export type ActionExecResult = { type: string; id: string; label: string };

function criteriaLines(text: string) {
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
}

export async function executeAiProposedAction(
  action: AiProposedAction,
  draft: {
    title: string;
    name: string;
    projectId: string;
    productId: string;
    resourceId: string;
    status: string;
    priority: string;
    severity: string;
    description: string;
    content: string;
    criteria: string;
    assignee: string;
    assigneeRole: string;
    owner: string;
    taskType: string;
    estimatedHours: string;
    hours: string;
    workDate: string;
    version: string;
    buildId: string;
    objective: string;
    category: string;
    reason: string;
  },
): Promise<ActionExecResult> {
  const type = String(action.type);
  let id = '';

  switch (type) {
    case 'create_requirement': {
      if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.reqTitleProjectMissing'));
      const created = await createRequirement({
        title: draft.title.trim(),
        projectId: draft.projectId,
        priority: draft.priority || 'medium',
        description: draft.description.trim() || undefined,
        acceptanceCriteria: criteriaLines(draft.criteria),
        assignee: draft.assignee.trim() || undefined,
        assigneeRole: draft.assignee.trim() ? draft.assigneeRole : undefined,
      }, createIdempotencyKey('ai-req'));
      id = created.id;
      break;
    }
    case 'update_requirement': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.reqIdRequired'));
      const current = await fetchRequirement(draft.resourceId.trim());
      await updateRequirement(draft.resourceId.trim(), {
        version: Number(current.version || 1),
        title: draft.title.trim() || undefined,
        description: draft.description.trim() || undefined,
        priority: draft.priority || undefined,
        acceptanceCriteria: draft.criteria ? criteriaLines(draft.criteria) : undefined,
        assignee: draft.assignee.trim() || undefined,
        assigneeRole: draft.assignee.trim() ? draft.assigneeRole : undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'update_requirement_status': {
      if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.reqIdStatusRequired'));
      const current = await fetchRequirement(draft.resourceId.trim());
      await updateRequirementStatus(draft.resourceId.trim(), draft.status, Number(current.version || 1));
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_requirement': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.reqIdRequired'));
      await deleteRequirement(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_defect': {
      if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.defectTitleProjectMissing'));
      const created = await createDefect({
        title: draft.title.trim(),
        projectId: draft.projectId,
        severity: draft.severity || 'medium',
        description: draft.description.trim() || undefined,
        assignee: draft.assignee.trim() || undefined,
        assigneeRole: draft.assignee.trim() ? draft.assigneeRole : undefined,
      });
      id = created.id;
      break;
    }
    case 'update_defect': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.defectIdRequired'));
      const current = (await fetchDefects()).find((item) => item.id === draft.resourceId.trim());
      if (!current) throw new Error('Defect not found. Refresh and retry.');
      await updateDefect(draft.resourceId.trim(), {
        version: current.version,
        title: draft.title.trim() || undefined,
        description: draft.description.trim() || undefined,
        severity: draft.severity || undefined,
        assignee: draft.assignee.trim() || undefined,
        assigneeRole: draft.assignee.trim() ? draft.assigneeRole : undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'update_defect_status': {
      if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.defectIdStatusRequired'));
      const current = (await fetchDefects()).find((item) => item.id === draft.resourceId.trim());
      if (!current) throw new Error('Defect not found. Refresh and retry.');
      await updateDefectStatus(draft.resourceId.trim(), draft.status, current.version);
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_defect': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.defectIdRequired'));
      await deleteDefect(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_task': {
      if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.taskTitleProjectMissing'));
      const created = await createWbsTask(draft.projectId, {
        title: draft.title.trim(),
        owner: draft.assignee.trim() || undefined,
        type: draft.taskType || 'task',
        estimatedHours: draft.estimatedHours ? Number(draft.estimatedHours) : undefined,
      }, createIdempotencyKey('ai-task'));
      id = created.id;
      break;
    }
    case 'update_task': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.taskIdRequired'));
      const current = await fetchTask(draft.resourceId.trim());
      await updateTask(draft.resourceId.trim(), {
        version: Number(current.version || 1),
        title: draft.title.trim() || undefined,
        owner: draft.assignee.trim() || undefined,
        type: draft.taskType || undefined,
        estimatedHours: draft.estimatedHours ? Number(draft.estimatedHours) : undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'update_task_status': {
      if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.taskIdStatusRequired'));
      const current = await fetchTask(draft.resourceId.trim());
      await updateTaskStatus(draft.resourceId.trim(), {
        status: draft.status,
        version: Number(current.version || 1),
        statusReason: draft.reason.trim() || undefined,
        progress: draft.status === 'done' ? 100 : undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_task': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.taskIdRequired'));
      await deleteTask(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_test_case': {
      if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.testCaseNameProjectMissing'));
      const created = await createTestCase({
        name: draft.title.trim(),
        projectId: draft.projectId,
        owner: draft.owner.trim() || draft.assignee.trim() || undefined,
        assigneeRole: draft.assigneeRole || undefined,
      });
      id = created.id;
      break;
    }
    case 'update_test_case': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.testCaseIdRequired'));
      await updateTestCase(draft.resourceId.trim(), {
        name: draft.title.trim() || undefined,
        owner: draft.owner.trim() || draft.assignee.trim() || undefined,
        description: draft.description.trim() || undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'update_test_case_status': {
      if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.testCaseIdStatusRequired'));
      await updateTestCaseStatus(draft.resourceId.trim(), draft.status);
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_test_case': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.testCaseIdRequired'));
      await deleteTestCase(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_project': {
      if (!draft.title.trim() || !draft.owner.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.projectNameOwnerMissing'));
      const created = await createProject({
        name: draft.title.trim(),
        owner: draft.owner.trim(),
        objective: draft.objective.trim() || draft.description.trim() || undefined,
      }, createIdempotencyKey('ai-prj'));
      id = created.id;
      break;
    }
    case 'update_project': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.projectIdRequired'));
      const current = await fetchProject(draft.resourceId.trim());
      await updateProject(draft.resourceId.trim(), {
        version: Number(current.version || 1),
        name: draft.title.trim() || undefined,
        objective: draft.objective.trim() || draft.description.trim() || undefined,
        owner: draft.owner.trim() || undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'update_project_status': {
      if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.projectIdStatusRequired'));
      const current = await fetchProject(draft.resourceId.trim());
      await updateProjectStatus(draft.resourceId.trim(), draft.status, Number(current.version || 1));
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_project': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.projectIdRequired'));
      await deleteProject(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_product': {
      if (!draft.title.trim() || !draft.owner.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.productNameOwnerMissing'));
      const created = await createProduct({
        name: draft.title.trim(),
        owner: draft.owner.trim(),
        description: draft.description.trim() || undefined,
        version: draft.version || undefined,
      });
      id = created.id;
      break;
    }
    case 'update_product': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.productIdRequired'));
      await updateProduct(draft.resourceId.trim(), {
        name: draft.title.trim() || undefined,
        owner: draft.owner.trim() || undefined,
        description: draft.description.trim() || undefined,
        version: draft.version || undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_product': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.productIdRequired'));
      await deleteProduct(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_build': {
      if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.buildNameProjectMissing'));
      const created = await createBuild({
        projectId: draft.projectId,
        name: draft.title.trim(),
        version: draft.version || undefined,
        notes: draft.description.trim() || undefined,
      });
      id = created.id;
      break;
    }
    case 'update_build': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.buildIdRequired'));
      await updateBuild(draft.resourceId.trim(), {
        name: draft.title.trim() || undefined,
        version: draft.version || undefined,
        notes: draft.description.trim() || undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'update_build_status': {
      if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.buildIdStatusRequired'));
      await updateBuildStatus(draft.resourceId.trim(), draft.status);
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_build': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.buildIdRequired'));
      await deleteBuild(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_release': {
      if (!draft.title.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.releaseNameRequired'));
      const created = await createRelease({
        name: draft.title.trim(),
        productId: draft.productId || undefined,
        version: draft.version || undefined,
        buildId: draft.buildId || undefined,
        releaseNotes: draft.description.trim() || undefined,
      });
      id = created.id;
      break;
    }
    case 'update_release_status': {
      if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.releaseIdStatusRequired'));
      await updateReleaseStatus(draft.resourceId.trim(), draft.status);
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_release': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.releaseIdRequired'));
      await deleteRelease(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_document': {
      if (!draft.title.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.documentTitleRequired'));
      const body = draft.content.trim() || draft.description.trim() || draft.title.trim();
      const created = await uploadDocument({
        title: draft.title.trim(),
        type: 'markdown',
        category: draft.category || 'project',
        owner: draft.owner.trim() || i18n.t('common.aiAssistant'),
        projectId: draft.projectId || undefined,
        fileName: `${draft.title.trim().slice(0, 40)}.md`,
        fileSize: body.length,
        fileType: 'text/markdown',
        contentBase64: btoa(unescape(encodeURIComponent(body))),
      });
      id = created.id;
      break;
    }
    case 'update_document': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.documentIdRequired'));
      await updateDocument(draft.resourceId.trim(), {
        title: draft.title.trim() || undefined,
        owner: draft.owner.trim() || undefined,
        projectId: draft.projectId || undefined,
        category: draft.category || undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_document': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.documentIdRequired'));
      await deleteDocument(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_sprint': {
      if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.sprintNameProjectMissing'));
      const created = await createSprint(draft.projectId, {
        name: draft.title.trim(),
        goal: draft.objective.trim() || draft.description.trim() || undefined,
      }, createIdempotencyKey('ai-spr'));
      id = created.id;
      break;
    }
    case 'update_sprint': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.sprintIdRequired'));
      await updateSprint(draft.resourceId.trim(), {
        name: draft.title.trim() || undefined,
        goal: draft.objective.trim() || draft.description.trim() || undefined,
        status: draft.status || undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_sprint': {
      if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.sprintIdRequired'));
      await deleteSprint(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_work_log': {
      const content = draft.content.trim() || draft.description.trim();
      if (!content) throw new Error(i18n.t('features.ai.aiActionExecutor.workLogContentRequired'));
      const created = await createWorkLog({
        content,
        logDate: draft.workDate || businessDateKey(),
        projectId: draft.projectId || undefined,
      }, createIdempotencyKey('ai-log'));
      id = created.id;
      break;
    }
    case 'create_time_entry': {
      if (!draft.projectId || !draft.hours) throw new Error(i18n.t('features.ai.aiActionExecutor.timeEntryProjectHoursRequired'));
      const created = await createTimeEntry({
        projectId: draft.projectId,
        workDate: draft.workDate || businessDateKey(),
        hours: Number(draft.hours),
        category: 'delivery',
        workNature: 'unspecified',
        note: draft.description.trim() || undefined,
      }, createIdempotencyKey('ai-time'));
      id = created.id;
      break;
    }
    case 'create_risk': {
      if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.riskTitleProjectMissing'));
      const created = await createProjectRisk(draft.projectId, {
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        severity: (draft.severity as 'low' | 'medium' | 'high' | 'critical') || 'medium',
        ownerName: draft.owner.trim() || undefined,
      });
      id = created.id;
      break;
    }
    case 'create_program': {
      if (!draft.title.trim() || !draft.owner.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.programNameOwnerMissing'));
      const created = await createProgram({
        name: draft.title.trim(),
        owner: draft.owner.trim(),
        objective: draft.objective.trim() || draft.description.trim() || i18n.t('features.ai.aiActionExecutor.programDefaultObjective'),
      });
      id = created.id;
      break;
    }
    case 'create_portfolio': {
      if (!draft.title.trim() || !draft.owner.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.portfolioNameOwnerMissing'));
      const created = await createPortfolio({
        name: draft.title.trim(),
        owner: draft.owner.trim(),
        objective: draft.objective.trim() || draft.description.trim() || i18n.t('features.ai.aiActionExecutor.portfolioDefaultObjective'),
      });
      id = created.id;
      break;
    }
    case 'create_strategic_goal': {
      if (!draft.title.trim() || !draft.owner.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.goalNameOwnerMissing'));
      const created = await createStrategicGoal({
        name: draft.title.trim(),
        owner: draft.owner.trim(),
        objective: draft.objective.trim() || draft.description.trim() || i18n.t('features.ai.aiActionExecutor.goalDefaultObjective'),
      });
      id = created.id;
      break;
    }
    default:
      throw new Error(i18n.t('features.ai.aiActionExecutor.unsupportedType', { type }));
  }

  return { type, id, label: type };
}
