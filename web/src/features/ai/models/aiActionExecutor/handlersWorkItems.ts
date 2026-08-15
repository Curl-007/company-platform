import i18n from '../../../../i18n';
import { createIdempotencyKey } from '../../../../services/idempotency';
import {
  createRequirement,
  deleteRequirement,
  fetchRequirement,
  updateRequirement,
  updateRequirementStatus,
} from '../../../requirements/api';
import {
  createDefect,
  deleteDefect,
  fetchDefect,
  updateDefect,
  updateDefectStatus,
  createTestCase,
  updateTestCase,
  updateTestCaseStatus,
  deleteTestCase,
} from '../../../testing/api';
import { criteriaLines, type AiActionHandler } from './types';

// ---------------------------------------------------------------------------
// Work-item actions: requirements, defects and test cases.
// ---------------------------------------------------------------------------

export const workItemHandlers: Record<string, AiActionHandler> = {
  create_requirement: async (draft) => {
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
    return created.id;
  },

  update_requirement: async (draft) => {
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
    return draft.resourceId.trim();
  },

  update_requirement_status: async (draft) => {
    if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.reqIdStatusRequired'));
    const current = await fetchRequirement(draft.resourceId.trim());
    await updateRequirementStatus(draft.resourceId.trim(), draft.status, Number(current.version || 1));
    return draft.resourceId.trim();
  },

  delete_requirement: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.reqIdRequired'));
    await deleteRequirement(draft.resourceId.trim());
    return draft.resourceId.trim();
  },

  create_defect: async (draft) => {
    if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.defectTitleProjectMissing'));
    const created = await createDefect({
      title: draft.title.trim(),
      projectId: draft.projectId,
      severity: draft.severity || 'medium',
      description: draft.description.trim() || undefined,
      assignee: draft.assignee.trim() || undefined,
      assigneeRole: draft.assignee.trim() ? draft.assigneeRole : undefined,
    });
    return created.id;
  },

  update_defect: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.defectIdRequired'));
    let current;
    try {
      current = await fetchDefect(draft.resourceId.trim());
    } catch {
      throw new Error(i18n.t('features.ai.aiActionExecutor.defectNotFound'));
    }
    await updateDefect(draft.resourceId.trim(), {
      version: current.version,
      title: draft.title.trim() || undefined,
      description: draft.description.trim() || undefined,
      severity: draft.severity || undefined,
      assignee: draft.assignee.trim() || undefined,
      assigneeRole: draft.assignee.trim() ? draft.assigneeRole : undefined,
    });
    return draft.resourceId.trim();
  },

  update_defect_status: async (draft) => {
    if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.defectIdStatusRequired'));
    let current;
    try {
      current = await fetchDefect(draft.resourceId.trim());
    } catch {
      throw new Error(i18n.t('features.ai.aiActionExecutor.defectNotFound'));
    }
    await updateDefectStatus(draft.resourceId.trim(), draft.status, current.version);
    return draft.resourceId.trim();
  },

  delete_defect: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.defectIdRequired'));
    await deleteDefect(draft.resourceId.trim());
    return draft.resourceId.trim();
  },

  create_test_case: async (draft) => {
    if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.testCaseNameProjectMissing'));
    const created = await createTestCase({
      name: draft.title.trim(),
      projectId: draft.projectId,
      owner: draft.owner.trim() || draft.assignee.trim() || undefined,
      assigneeRole: draft.assigneeRole || undefined,
    });
    return created.id;
  },

  update_test_case: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.testCaseIdRequired'));
    await updateTestCase(draft.resourceId.trim(), {
      name: draft.title.trim() || undefined,
      owner: draft.owner.trim() || draft.assignee.trim() || undefined,
      description: draft.description.trim() || undefined,
    });
    return draft.resourceId.trim();
  },

  update_test_case_status: async (draft) => {
    if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.testCaseIdStatusRequired'));
    await updateTestCaseStatus(draft.resourceId.trim(), draft.status);
    return draft.resourceId.trim();
  },

  delete_test_case: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.testCaseIdRequired'));
    await deleteTestCase(draft.resourceId.trim());
    return draft.resourceId.trim();
  },
};
