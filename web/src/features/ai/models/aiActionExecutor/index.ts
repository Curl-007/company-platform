import i18n from '../../../../i18n';
import type { AiProposedAction } from '../../../../types';
import type { ActionExecResult, AiActionDraftInput } from './types';
import { workItemHandlers } from './handlersWorkItems';
import { planningHandlers } from './handlersPlanning';
import { portfolioHandlers } from './handlersPortfolio';

// ---------------------------------------------------------------------------
// AI proposed-action executor: maps action types to concrete write handlers.
// Handlers are grouped by target domain (work items / planning / delivery &
// portfolio assets); each returns the id of the affected resource.
// ---------------------------------------------------------------------------

export type { ActionExecResult, AiActionDraftInput } from './types';

const ACTION_HANDLERS: Record<string, (draft: AiActionDraftInput) => Promise<string>> = {
  ...workItemHandlers,
  ...planningHandlers,
  ...portfolioHandlers,
};

export async function executeAiProposedAction(
  action: AiProposedAction,
  draft: AiActionDraftInput,
): Promise<ActionExecResult> {
  const type = String(action.type);
  const handler = ACTION_HANDLERS[type];
  if (!handler) {
    throw new Error(i18n.t('features.ai.aiActionExecutor.unsupportedType', { type }));
  }
  const id = await handler(draft);
  return { type, id, label: type };
}
