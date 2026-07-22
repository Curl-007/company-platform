import type { Dispatch, SetStateAction } from 'react';
import type { AiJob } from '../../../types';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import type { AiSummaryExtended, JobReviewDraft } from '../aiChatModel';
import AiJobReviewPanel from './AiJobReviewPanel';

export default function AiSidePanel({
  data,
  selectedJob,
  reviewDraft,
  setReviewDraft,
  jobLoading,
  jobAction,
  onOpenJob,
  onConfirm,
  onReject,
  onRetry,
}: {
  data: AiSummaryExtended;
  selectedJob: AiJob | null;
  reviewDraft: JobReviewDraft | null;
  setReviewDraft: Dispatch<SetStateAction<JobReviewDraft | null>>;
  jobLoading: boolean;
  jobAction: string | null;
  onOpenJob: (jobId: string) => void;
  onConfirm: (mode?: 'original' | 'edited') => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="ai-chat-side">
      <Panel title="接入状态" subtitle={data.aiProvider?.baseUrlHost || '未设置服务地址'}>
        <div className="ai-chat-status-list">
          <div>
            <span>Provider</span>
            <strong>{data.aiProvider?.provider || '未配置'}</strong>
          </div>
          <div>
            <span>模型</span>
            <strong>{data.aiProvider?.model || '未配置'}</strong>
          </div>
          <div>
            <span>密钥</span>
            <strong>{data.aiProvider?.apiKeyMasked || '未配置'}</strong>
          </div>
          <div>
            <span>任务落地</span>
            <strong>{data.metrics?.writtenToBusiness ?? 0}</strong>
          </div>
        </div>
      </Panel>

      {data.recentJobs?.length ? (
        <Panel title="近期 AI 任务" subtitle="文档和日志分析记录">
          <div className="ai-chat-job-list">
            {data.recentJobs.slice(0, 5).map((job) => (
              <button key={job.jobId} className="ai-chat-job ai-chat-job-button" onClick={() => void onOpenJob(job.jobId)} disabled={jobLoading || jobAction !== null}>
                <div>
                  <strong>{job.scene}</strong>
                  <span>{job.jobId} · {job.currentStep}</span>
                </div>
                <StatusBadge label={`${job.progress}%`} status={job.status} showDot={false} />
              </button>
            ))}
          </div>
        </Panel>
      ) : null}

      {selectedJob ? (
        <AiJobReviewPanel
          selectedJob={selectedJob}
          reviewDraft={reviewDraft}
          setReviewDraft={setReviewDraft}
          jobAction={jobAction}
          onConfirm={onConfirm}
          onReject={onReject}
          onRetry={onRetry}
        />
      ) : null}
    </div>
  );
}
