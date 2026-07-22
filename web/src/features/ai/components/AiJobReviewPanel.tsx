import type { Dispatch, SetStateAction } from 'react';
import type { AiJob } from '../../../types';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import {
  jobSummary,
  normalizePriority,
  type JobReviewDraft,
} from '../aiChatModel';

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
  const summary = jobSummary(selectedJob);

  return (
    <Panel title="AI 结果审核" subtitle={`${selectedJob.jobId} · ${selectedJob.currentStep}`}>
      <div className="ai-job-review">
        <div className="ai-job-review-head">
          <StatusBadge label={selectedJob.status} status={selectedJob.status} />
          <span>{selectedJob.progress}%</span>
          {selectedJob.writtenRequirementId ? <span>已写入 {selectedJob.writtenRequirementId}</span> : null}
        </div>
        {summary ? (
          <div className="ai-job-result">
            {summary.summary ? <p>{summary.summary}</p> : null}
            {summary.requirements.length ? (
              <div>
                <strong>候选需求</strong>
                {summary.requirements.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : null}
            {summary.risks.length ? (
              <div>
                <strong>风险</strong>
                {summary.risks.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : null}
          </div>
        ) : <div className="text-secondary">暂无结构化结果。</div>}
        {selectedJob.errorMessage ? <div className="form-error">{selectedJob.errorMessage}</div> : null}
        {selectedJob.status === 'awaiting_review' && reviewDraft ? (
          <div className="ai-job-edit">
            <div className="ai-job-edit-title">写入需求草稿</div>
            <label className="form-group">
              <span className="form-label">需求标题</span>
              <input
                className="form-input"
                value={reviewDraft.title}
                onChange={(event) => setReviewDraft((prev) => prev ? { ...prev, title: event.target.value } : prev)}
                placeholder="输入确认后要写入的需求标题"
              />
            </label>
            <div className="form-row">
              <label className="form-group">
                <span className="form-label">优先级</span>
                <select
                  className="form-select"
                  value={reviewDraft.priority}
                  onChange={(event) => setReviewDraft((prev) => prev ? { ...prev, priority: normalizePriority(event.target.value) } : prev)}
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </label>
            </div>
            <label className="form-group">
              <span className="form-label">需求描述</span>
              <textarea
                className="form-textarea"
                rows={3}
                value={reviewDraft.description}
                onChange={(event) => setReviewDraft((prev) => prev ? { ...prev, description: event.target.value } : prev)}
                placeholder="补充背景、范围和业务价值"
              />
            </label>
            <label className="form-group">
              <span className="form-label">验收标准</span>
              <textarea
                className="form-textarea"
                rows={3}
                value={reviewDraft.acceptanceCriteria}
                onChange={(event) => setReviewDraft((prev) => prev ? { ...prev, acceptanceCriteria: event.target.value } : prev)}
                placeholder="每行一条验收标准"
              />
            </label>
          </div>
        ) : null}
        <div className="ai-job-review-actions">
          {selectedJob.status === 'awaiting_review' ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => void onConfirm()} disabled={jobAction !== null}>
                {jobAction === 'confirm' ? '写入中...' : '确认写入'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => void onConfirm('edited')} disabled={jobAction !== null || !reviewDraft?.title.trim()}>
                {jobAction === 'confirm-edited' ? '写入中...' : '编辑后写入'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => void onReject()} disabled={jobAction !== null}>
                {jobAction === 'reject' ? '忽略中...' : '忽略'}
              </button>
            </>
          ) : null}
          {['failed', 'rejected'].includes(selectedJob.status) ? (
            <button className="btn btn-primary btn-sm" onClick={() => void onRetry()} disabled={jobAction !== null}>
              {jobAction === 'retry' ? '重试中...' : '重新分析'}
            </button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
