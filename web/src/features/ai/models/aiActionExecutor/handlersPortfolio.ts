import i18n from '../../../../i18n';
import { createIdempotencyKey } from '../../../../services/idempotency';
import { businessDateKey } from '../../../../utils/businessDate';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  createProgram,
  createPortfolio,
  createStrategicGoal,
} from '../../../products/api';
import {
  createBuild,
  updateBuild,
  updateBuildStatus,
  deleteBuild,
  createRelease,
  updateReleaseStatus,
  deleteRelease,
} from '../../../delivery/api';
import {
  uploadDocument,
  updateDocument,
  deleteDocument,
} from '../../../documents/api';
import { createWorkLog } from '../../../workLogs/api';
import { createTimeEntry } from '../../../timeEntries/api';
import type { AiActionHandler } from './types';

// ---------------------------------------------------------------------------
// Delivery & portfolio assets: products, builds, releases, documents,
// work logs, time entries, programs, portfolios and strategic goals.
// ---------------------------------------------------------------------------

export const portfolioHandlers: Record<string, AiActionHandler> = {
  create_product: async (draft) => {
    if (!draft.title.trim() || !draft.owner.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.productNameOwnerMissing'));
    const created = await createProduct({
      name: draft.title.trim(),
      owner: draft.owner.trim(),
      description: draft.description.trim() || undefined,
      version: draft.version || undefined,
    });
    return created.id;
  },

  update_product: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.productIdRequired'));
    await updateProduct(draft.resourceId.trim(), {
      name: draft.title.trim() || undefined,
      owner: draft.owner.trim() || undefined,
      description: draft.description.trim() || undefined,
      version: draft.version || undefined,
    });
    return draft.resourceId.trim();
  },

  delete_product: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.productIdRequired'));
    await deleteProduct(draft.resourceId.trim());
    return draft.resourceId.trim();
  },

  create_build: async (draft) => {
    if (!draft.title.trim() || !draft.projectId) throw new Error(i18n.t('features.ai.aiActionExecutor.buildNameProjectMissing'));
    const created = await createBuild({
      projectId: draft.projectId,
      name: draft.title.trim(),
      version: draft.version || undefined,
      notes: draft.description.trim() || undefined,
    });
    return created.id;
  },

  update_build: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.buildIdRequired'));
    await updateBuild(draft.resourceId.trim(), {
      name: draft.title.trim() || undefined,
      version: draft.version || undefined,
      notes: draft.description.trim() || undefined,
    });
    return draft.resourceId.trim();
  },

  update_build_status: async (draft) => {
    if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.buildIdStatusRequired'));
    await updateBuildStatus(draft.resourceId.trim(), draft.status);
    return draft.resourceId.trim();
  },

  delete_build: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.buildIdRequired'));
    await deleteBuild(draft.resourceId.trim());
    return draft.resourceId.trim();
  },

  create_release: async (draft) => {
    if (!draft.title.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.releaseNameRequired'));
    const created = await createRelease({
      name: draft.title.trim(),
      productId: draft.productId || undefined,
      version: draft.version || undefined,
      buildId: draft.buildId || undefined,
      releaseNotes: draft.description.trim() || undefined,
    });
    return created.id;
  },

  update_release_status: async (draft) => {
    if (!draft.resourceId.trim() || !draft.status) throw new Error(i18n.t('features.ai.aiActionExecutor.releaseIdStatusRequired'));
    await updateReleaseStatus(draft.resourceId.trim(), draft.status);
    return draft.resourceId.trim();
  },

  delete_release: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.releaseIdRequired'));
    await deleteRelease(draft.resourceId.trim());
    return draft.resourceId.trim();
  },

  create_document: async (draft) => {
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
    return created.id;
  },

  update_document: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.documentIdRequired'));
    await updateDocument(draft.resourceId.trim(), {
      title: draft.title.trim() || undefined,
      owner: draft.owner.trim() || undefined,
      projectId: draft.projectId || undefined,
      category: draft.category || undefined,
    });
    return draft.resourceId.trim();
  },

  delete_document: async (draft) => {
    if (!draft.resourceId.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.documentIdRequired'));
    await deleteDocument(draft.resourceId.trim());
    return draft.resourceId.trim();
  },

  create_work_log: async (draft) => {
    const content = draft.content.trim() || draft.description.trim();
    if (!content) throw new Error(i18n.t('features.ai.aiActionExecutor.workLogContentRequired'));
    const created = await createWorkLog({
      content,
      logDate: draft.workDate || businessDateKey(),
      projectId: draft.projectId || undefined,
    }, createIdempotencyKey('ai-log'));
    return created.id;
  },

  create_time_entry: async (draft) => {
    if (!draft.projectId || !draft.hours) throw new Error(i18n.t('features.ai.aiActionExecutor.timeEntryProjectHoursRequired'));
    const created = await createTimeEntry({
      projectId: draft.projectId,
      workDate: draft.workDate || businessDateKey(),
      hours: Number(draft.hours),
      category: 'delivery',
      workNature: 'unspecified',
      note: draft.description.trim() || undefined,
    }, createIdempotencyKey('ai-time'));
    return created.id;
  },

  create_program: async (draft) => {
    if (!draft.title.trim() || !draft.owner.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.programNameOwnerMissing'));
    const created = await createProgram({
      name: draft.title.trim(),
      owner: draft.owner.trim(),
      objective: draft.objective.trim() || draft.description.trim() || i18n.t('features.ai.aiActionExecutor.programDefaultObjective'),
    });
    return created.id;
  },

  create_portfolio: async (draft) => {
    if (!draft.title.trim() || !draft.owner.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.portfolioNameOwnerMissing'));
    const created = await createPortfolio({
      name: draft.title.trim(),
      owner: draft.owner.trim(),
      objective: draft.objective.trim() || draft.description.trim() || i18n.t('features.ai.aiActionExecutor.portfolioDefaultObjective'),
    });
    return created.id;
  },

  create_strategic_goal: async (draft) => {
    if (!draft.title.trim() || !draft.owner.trim()) throw new Error(i18n.t('features.ai.aiActionExecutor.goalNameOwnerMissing'));
    const created = await createStrategicGoal({
      name: draft.title.trim(),
      owner: draft.owner.trim(),
      objective: draft.objective.trim() || draft.description.trim() || i18n.t('features.ai.aiActionExecutor.goalDefaultObjective'),
    });
    return created.id;
  },
};
