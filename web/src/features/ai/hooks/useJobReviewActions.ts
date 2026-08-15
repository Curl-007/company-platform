import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiJob } from '../../../types';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import { ApiError } from '../../../services/api';
import { confirmAiJob, fetchAiJob, rejectAiJob, retryAiJob } from '../api/chat';
import { buildReviewDraft, type JobReviewDraft } from '../models/aiChatModel';

// ---------------------------------------------------------------------------
// useJobReviewActions: AI job review workflow extracted from AiView.
//
// Owns the selected job, its editable review draft and the confirm / reject /
// retry flows (including confirm dialogs and toasts). Polling results are fed
// back through acceptPolledJob so the shared useAiJobPolling stays at the view.
// ---------------------------------------------------------------------------

export interface UseJobReviewActionsOptions {
  /** Called after a successful confirm/reject/retry so the summary panel reloads. */
  onSummaryChanged: () => Promise<void> | void;
}

export interface JobReviewActions {
  selectedJob: AiJob | null;
  reviewDraft: JobReviewDraft | null;
  setReviewDraft: Dispatch<SetStateAction<JobReviewDraft | null>>;
  jobLoading: boolean;
  jobAction: string | null;
  openJob: (jobId: string) => Promise<void>;
  confirmJob: (mode?: 'original' | 'edited') => Promise<void>;
  rejectJob: () => Promise<void>;
  retryJob: () => Promise<void>;
  /** Applies a polled job update when it still matches the selected job. */
  acceptPolledJob: (latest: AiJob) => void;
}

export function useJobReviewActions({ onSummaryChanged }: UseJobReviewActionsOptions): JobReviewActions {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [selectedJob, setSelectedJob] = useState<AiJob | null>(null);
  const [reviewDraft, setReviewDraft] = useState<JobReviewDraft | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobAction, setJobAction] = useState<string | null>(null);

  async function openJob(jobId: string) {
    setJobLoading(true);
    try {
      const job = await fetchAiJob(jobId);
      setSelectedJob(job);
      setReviewDraft(buildReviewDraft(job));
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.ai.aiView.fetchJobFailed'));
    } finally {
      setJobLoading(false);
    }
  }

  async function confirmJob(mode: 'original' | 'edited' = 'original') {
    if (!selectedJob) return;
    const edited = mode === 'edited';
    const criteria = reviewDraft?.acceptanceCriteria
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean) || [];
    if (edited && !reviewDraft?.title.trim()) {
      toast.error(t('features.ai.aiView.editedTitleRequired'));
      return;
    }
    const ok = await confirm({
      title: edited ? t('features.ai.aiView.confirmWriteEditedTitle') : t('features.ai.aiView.confirmWriteTitle'),
      description: edited
        ? t('features.ai.aiView.confirmWriteEditedDescription')
        : t('features.ai.aiView.confirmWriteDescription'),
      confirmText: edited ? t('features.ai.aiView.writeEdited') : t('features.ai.aiView.confirmWrite'),
      tone: 'info',
    });
    if (!ok) return;
    setJobAction(edited ? 'confirm-edited' : 'confirm');
    try {
      const job = await confirmAiJob(selectedJob.jobId, edited && reviewDraft ? {
        requirement: {
          title: reviewDraft.title.trim(),
          description: reviewDraft.description.trim(),
          priority: reviewDraft.priority,
          acceptanceCriteria: criteria,
        },
      } : {});
      setSelectedJob(job);
      setReviewDraft(buildReviewDraft(job));
      toast.success(job.writtenRequirementId ? t('features.ai.aiView.requirementWritten', { id: job.writtenRequirementId }) : t('features.ai.aiView.jobConfirmed'));
      await onSummaryChanged();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.ai.aiView.confirmJobFailed'));
    } finally {
      setJobAction(null);
    }
  }

  async function rejectJob() {
    if (!selectedJob) return;
    const ok = await confirm({
      title: t('features.ai.aiView.ignoreResultTitle'),
      description: t('features.ai.aiView.ignoreResultDescription'),
      confirmText: t('features.ai.aiView.ignoreResult'),
      tone: 'danger',
    });
    if (!ok) return;
    setJobAction('reject');
    try {
      const job = await rejectAiJob(selectedJob.jobId, { reason: t('features.ai.aiView.rejectReason') });
      setSelectedJob(job);
      setReviewDraft(buildReviewDraft(job));
      toast.success(t('features.ai.aiView.resultIgnored'));
      await onSummaryChanged();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.ai.aiView.rejectJobFailed'));
    } finally {
      setJobAction(null);
    }
  }

  async function retryJob() {
    if (!selectedJob) return;
    setJobAction('retry');
    try {
      const job = await retryAiJob(selectedJob.jobId);
      setSelectedJob(job);
      setReviewDraft(buildReviewDraft(job));
      toast.success(t('features.ai.aiView.jobReanalyzed'));
      await onSummaryChanged();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.ai.aiView.retryJobFailed'));
    } finally {
      setJobAction(null);
    }
  }

  function acceptPolledJob(latest: AiJob) {
    setSelectedJob((current) => current?.jobId === latest.jobId ? latest : current);
  }

  return {
    selectedJob,
    reviewDraft,
    setReviewDraft,
    jobLoading,
    jobAction,
    openJob,
    confirmJob,
    rejectJob,
    retryJob,
    acceptPolledJob,
  };
}
