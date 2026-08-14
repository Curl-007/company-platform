import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProposedAction, Project } from '../../../types';
import { ApiError } from '../../../services/api';
import { getSessionUser } from '../../../services/auth';
import { executeAiProposedAction } from '../aiActionExecutor';
import {
  aiActionLabelKey,
  availableAiActionProjects,
  createAiActionDraft,
  type AiActionDraftField,
  updateAiActionDraftField,
  updateAiActionDraftObjective,
} from '../aiActionDraftModel';
import { openAiActionResult } from '../aiActionDraftNavigation';
import { canWriteAiAction } from '../aiActionDraftPermissions';
import AiActionDraftForm from './AiActionDraftForm';
import AiActionDraftSuccess from './AiActionDraftSuccess';

export interface AiActionDraftCardProps {
  action: AiProposedAction;
  projects: Project[];
  onDone?: (result: { type: string; id: string; label: string }) => void;
}

export default function AiActionDraftController({ action, projects, onDone }: AiActionDraftCardProps) {
  const { t } = useTranslation();
  const liveProjects = useMemo(() => availableAiActionProjects(projects), [projects]);
  const type = String(action.type);
  const actionLabelKey = aiActionLabelKey(type);
  const actionLabel = actionLabelKey ? t(actionLabelKey) : type;
  const canWrite = canWriteAiAction(getSessionUser(), type);
  const [draft, setDraft] = useState(() => createAiActionDraft(action, liveProjects, { includeEstimatedHoursFallback: true }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  useEffect(() => {
    setDraft(createAiActionDraft(action, liveProjects));
    setDoneId(null);
    setError(null);
  }, [action, liveProjects]);

  function updateDraft(field: AiActionDraftField, value: string) {
    setDraft((current) => updateAiActionDraftField(current, field, value));
  }

  function updateObjective(value: string) {
    setDraft((current) => updateAiActionDraftObjective(current, value));
  }

  async function handleExecute() {
    if (!canWrite) {
      setError(t('features.ai.aiActionDraftCard.noWritePermission'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await executeAiProposedAction(action, draft);
      setDoneId(result.id);
      onDone?.({ type: result.type, id: result.id, label: actionLabel });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('features.ai.aiActionDraftCard.operationFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (doneId) {
    return (
      <AiActionDraftSuccess
        actionLabel={actionLabel}
        doneId={doneId}
        onOpen={() => openAiActionResult(type, doneId, draft.projectId)}
      />
    );
  }

  return (
    <AiActionDraftForm
      actionType={type}
      actionLabel={actionLabel}
      draft={draft}
      liveProjects={liveProjects}
      canWrite={canWrite}
      submitting={submitting}
      error={error}
      onChange={updateDraft}
      onObjectiveChange={updateObjective}
      onExecute={handleExecute}
    />
  );
}
