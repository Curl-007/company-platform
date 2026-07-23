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
      if (!draft.title.trim() || !draft.projectId) throw new Error('请填写需求标题并选择项目。');
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
      if (!draft.resourceId.trim()) throw new Error('请填写需求编号 REQ-xxx。');
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
      if (!draft.resourceId.trim() || !draft.status) throw new Error('请填写需求编号与目标状态。');
      const current = await fetchRequirement(draft.resourceId.trim());
      await updateRequirementStatus(draft.resourceId.trim(), draft.status, Number(current.version || 1));
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_requirement': {
      if (!draft.resourceId.trim()) throw new Error('请填写需求编号 REQ-xxx。');
      await deleteRequirement(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_defect': {
      if (!draft.title.trim() || !draft.projectId) throw new Error('请填写缺陷标题并选择项目。');
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
      if (!draft.resourceId.trim()) throw new Error('请填写缺陷编号 BUG-xxx。');
      await updateDefect(draft.resourceId.trim(), {
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
      if (!draft.resourceId.trim() || !draft.status) throw new Error('请填写缺陷编号与目标状态。');
      await updateDefectStatus(draft.resourceId.trim(), draft.status);
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_defect': {
      if (!draft.resourceId.trim()) throw new Error('请填写缺陷编号 BUG-xxx。');
      await deleteDefect(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_task': {
      if (!draft.title.trim() || !draft.projectId) throw new Error('请填写任务标题并选择项目。');
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
      if (!draft.resourceId.trim()) throw new Error('请填写任务编号 TASK-xxx。');
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
      if (!draft.resourceId.trim() || !draft.status) throw new Error('请填写任务编号与目标状态。');
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
      if (!draft.resourceId.trim()) throw new Error('请填写任务编号 TASK-xxx。');
      await deleteTask(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_test_case': {
      if (!draft.title.trim() || !draft.projectId) throw new Error('请填写用例名称并选择项目。');
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
      if (!draft.resourceId.trim()) throw new Error('请填写用例编号 TC-xxx。');
      await updateTestCase(draft.resourceId.trim(), {
        name: draft.title.trim() || undefined,
        owner: draft.owner.trim() || draft.assignee.trim() || undefined,
        description: draft.description.trim() || undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'update_test_case_status': {
      if (!draft.resourceId.trim() || !draft.status) throw new Error('请填写用例编号与目标状态。');
      await updateTestCaseStatus(draft.resourceId.trim(), draft.status);
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_test_case': {
      if (!draft.resourceId.trim()) throw new Error('请填写用例编号 TC-xxx。');
      await deleteTestCase(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_project': {
      if (!draft.title.trim() || !draft.owner.trim()) throw new Error('请填写项目名称与负责人。');
      const created = await createProject({
        name: draft.title.trim(),
        owner: draft.owner.trim(),
        objective: draft.objective.trim() || draft.description.trim() || undefined,
      }, createIdempotencyKey('ai-prj'));
      id = created.id;
      break;
    }
    case 'update_project': {
      if (!draft.resourceId.trim()) throw new Error('请填写项目编号 PRJ-xxx。');
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
      if (!draft.resourceId.trim() || !draft.status) throw new Error('请填写项目编号与目标状态。');
      const current = await fetchProject(draft.resourceId.trim());
      await updateProjectStatus(draft.resourceId.trim(), draft.status, Number(current.version || 1));
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_project': {
      if (!draft.resourceId.trim()) throw new Error('请填写项目编号 PRJ-xxx。');
      await deleteProject(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_product': {
      if (!draft.title.trim() || !draft.owner.trim()) throw new Error('请填写产品名称与负责人。');
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
      if (!draft.resourceId.trim()) throw new Error('请填写产品编号 PROD-xxx。');
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
      if (!draft.resourceId.trim()) throw new Error('请填写产品编号 PROD-xxx。');
      await deleteProduct(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_build': {
      if (!draft.title.trim() || !draft.projectId) throw new Error('请填写构建名称并选择项目。');
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
      if (!draft.resourceId.trim()) throw new Error('请填写构建编号 BLD-xxx。');
      await updateBuild(draft.resourceId.trim(), {
        name: draft.title.trim() || undefined,
        version: draft.version || undefined,
        notes: draft.description.trim() || undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'update_build_status': {
      if (!draft.resourceId.trim() || !draft.status) throw new Error('请填写构建编号与目标状态。');
      await updateBuildStatus(draft.resourceId.trim(), draft.status);
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_build': {
      if (!draft.resourceId.trim()) throw new Error('请填写构建编号 BLD-xxx。');
      await deleteBuild(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_release': {
      if (!draft.title.trim()) throw new Error('请填写发布名称。');
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
      if (!draft.resourceId.trim() || !draft.status) throw new Error('请填写发布编号与目标状态。');
      await updateReleaseStatus(draft.resourceId.trim(), draft.status);
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_release': {
      if (!draft.resourceId.trim()) throw new Error('请填写发布编号 REL-xxx。');
      await deleteRelease(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_document': {
      if (!draft.title.trim()) throw new Error('请填写文档标题。');
      const body = draft.content.trim() || draft.description.trim() || draft.title.trim();
      const created = await uploadDocument({
        title: draft.title.trim(),
        type: 'markdown',
        category: draft.category || 'project',
        owner: draft.owner.trim() || 'AI 助手',
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
      if (!draft.resourceId.trim()) throw new Error('请填写文档编号 DOC-xxx。');
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
      if (!draft.resourceId.trim()) throw new Error('请填写文档编号 DOC-xxx。');
      await deleteDocument(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_sprint': {
      if (!draft.title.trim() || !draft.projectId) throw new Error('请填写迭代名称并选择项目。');
      const created = await createSprint(draft.projectId, {
        name: draft.title.trim(),
        goal: draft.objective.trim() || draft.description.trim() || undefined,
      }, createIdempotencyKey('ai-spr'));
      id = created.id;
      break;
    }
    case 'update_sprint': {
      if (!draft.resourceId.trim()) throw new Error('请填写迭代编号 SPR-xxx。');
      await updateSprint(draft.resourceId.trim(), {
        name: draft.title.trim() || undefined,
        goal: draft.objective.trim() || draft.description.trim() || undefined,
        status: draft.status || undefined,
      });
      id = draft.resourceId.trim();
      break;
    }
    case 'delete_sprint': {
      if (!draft.resourceId.trim()) throw new Error('请填写迭代编号 SPR-xxx。');
      await deleteSprint(draft.resourceId.trim());
      id = draft.resourceId.trim();
      break;
    }
    case 'create_work_log': {
      const content = draft.content.trim() || draft.description.trim();
      if (!content) throw new Error('请填写日报内容。');
      const created = await createWorkLog({
        content,
        logDate: draft.workDate || businessDateKey(),
        projectId: draft.projectId || undefined,
      }, createIdempotencyKey('ai-log'));
      id = created.id;
      break;
    }
    case 'create_time_entry': {
      if (!draft.projectId || !draft.hours) throw new Error('请选择项目并填写工时小时数。');
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
      if (!draft.title.trim() || !draft.projectId) throw new Error('请填写风险标题并选择项目。');
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
      if (!draft.title.trim() || !draft.owner.trim()) throw new Error('请填写项目集名称与负责人。');
      const created = await createProgram({
        name: draft.title.trim(),
        owner: draft.owner.trim(),
        objective: draft.objective.trim() || draft.description.trim() || '战略对齐',
      });
      id = created.id;
      break;
    }
    case 'create_portfolio': {
      if (!draft.title.trim() || !draft.owner.trim()) throw new Error('请填写组合名称与负责人。');
      const created = await createPortfolio({
        name: draft.title.trim(),
        owner: draft.owner.trim(),
        objective: draft.objective.trim() || draft.description.trim() || '组合目标',
      });
      id = created.id;
      break;
    }
    case 'create_strategic_goal': {
      if (!draft.title.trim() || !draft.owner.trim()) throw new Error('请填写目标名称与负责人。');
      const created = await createStrategicGoal({
        name: draft.title.trim(),
        owner: draft.owner.trim(),
        objective: draft.objective.trim() || draft.description.trim() || '战略目标',
      });
      id = created.id;
      break;
    }
    default:
      throw new Error(`暂不支持的操作类型：${type}`);
  }

  return { type, id, label: type };
}
