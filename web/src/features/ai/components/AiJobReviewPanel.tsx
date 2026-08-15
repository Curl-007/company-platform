import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiJob } from '../../../types';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import {
  jobSummary,
  normalizePriority,
  type JobReviewDraft,
} from '../models/aiChatModel';

export default function AiJobReviewPanel({
  selectedJob,
  reviewDraft,
  setReviewDraft,
  jobAction,
  onConfirm,
  onReject,
  onRetry,
}: {
  selectedJob: AiJob;
  reviewDraft: JobReviewDraft | null;
  setReviewDraft: Dispatch<SetStateAction<JobReviewDraft | null>>;
  jobAction: string | null;
  onConfirm: (mode?: 'original' | 'edited') => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const summary = jobSummary(selectedJob);

  return (
    <Panel title={t('features.ai.aiJobReviewPanel.title')} subtitle={`${selectedJob.jobId} · ${selectedJob.currentStep}`}>
      <div className="ai-job-review">
        <div className="ai-job-review-head">
          <StatusBadge label={selectedJob.status} status={selectedJob.status} />
          <span>{selectedJob.progress}%</span>
          {selectedJob.writtenRequirementId ? <span>{t('features.ai.aiJobReviewPanel.writtenSuffix', { id: selectedJob.writtenRequirementId })}</span> : null}
        </div>
        {summary ? (
          <div className="ai-job-result">
            {summary.summary ? <p>{summary.summary}</p> : null}
            {summary.requirements.length ? (
              <div>
                <strong>{t('features.ai.aiJobReviewPanel.candidateRequirements')}</strong>
                {summary.requirements.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : null}
            {summary.risks.length ? (
              <div>
                <strong>{t('common.risks')}</strong>
                {summary.risks.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : null}
          </div>
        ) : <div className="text-secondary">{t('features.ai.aiJobReviewPanel.noStructuredResult')}</div>}
        {selectedJob.errorMessage ? <div className="form-error">{selectedJob.errorMessage}</div> : null}
        {selectedJob.status === 'awaiting_review' && reviewDraft ? (
          <div className="ai-job-edit">
            <div className="ai-job-edit-title">{t('features.ai.aiJobReviewPanel.writeRequirementDraft')}</div>
            <label className="form-group">
              <span className="form-label">{t('features.ai.aiJobReviewPanel.requirementTitle')}</span>
              <input
                className="form-input"
                value={reviewDraft.title}
                onChange={(event) => setReviewDraft((prev) => prev ? { ...prev, title: event.target.value } : prev)}
                placeholder={t('features.ai.aiJobReviewPanel.draftTitlePlaceholder')}
              />
            </label>
            <div className="form-row">
              <label className="form-group">
                <span className="form-label">{t('features.ai.aiJobReviewPanel.priority')}</span>
                <select
                  className="form-select"
                  value={reviewDraft.priority}
                  onChange={(event) => setReviewDraft((prev) => prev ? { ...prev, priority: normalizePriority(event.target.value) } : prev)}
                >
                  <option value="high">{t('enums.priority.high')}</option>
                  <option value="medium">{t('enums.priority.medium')}</option>
                  <option value="low">{t('enums.priority.low')}</option>
                </select>
              </label>
            </div>
            <label className="form-group">
              <span className="form-label">{t('features.ai.aiJobReviewPanel.requirementDescription')}</span>
              <textarea
                className="form-textarea"
                rows={3}
                value={reviewDraft.description}
                onChange={(event) => setReviewDraft((prev) => prev ? { ...prev, description: event.target.value } : prev)}
                placeholder={t('features.ai.aiJobReviewPanel.descriptionPlaceholder')}
              />
            </label>
            <label className="form-group">
              <span className="form-label">{t('features.ai.aiJobReviewPanel.acceptanceCriteria')}</span>
              <textarea
                className="form-textarea"
                rows={3}
                value={reviewDraft.acceptanceCriteria}
                onChange={(event) => setReviewDraft((prev) => prev ? { ...prev, acceptanceCriteria: event.target.value } : prev)}
                placeholder={t('features.ai.aiJobReviewPanel.criteriaPlaceholder')}
              />
            </label>
          </div>
        ) : null}
        <div className="ai-job-review-actions">
          {selectedJob.status === 'awaiting_review' ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => void onConfirm()} disabled={jobAction !== null}>
                {jobAction === 'confirm' ? t('features.ai.aiJobReviewPanel.writing') : t('features.ai.aiJobReviewPanel.confirmWrite')}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => void onConfirm('edited')} disabled={jobAction !== null || !reviewDraft?.title.trim()}>
                {jobAction === 'confirm-edited' ? t('features.ai.aiJobReviewPanel.writing') : t('features.ai.aiJobReviewPanel.writeEdited')}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => void onReject()} disabled={jobAction !== null}>
                {jobAction === 'reject' ? t('features.ai.aiJobReviewPanel.ignoring') : t('features.ai.aiJobReviewPanel.ignore')}
              </button>
            </>
          ) : null}
          {['failed', 'rejected'].includes(selectedJob.status) ? (
            <button className="btn btn-primary btn-sm" onClick={() => void onRetry()} disabled={jobAction !== null}>
              {jobAction === 'retry' ? t('features.ai.aiJobReviewPanel.retrying') : t('features.ai.aiJobReviewPanel.reanalyze')}
            </button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
