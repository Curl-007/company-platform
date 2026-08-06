import type { Dispatch, SetStateAction } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { AiJob, AiModelOption, AiProviderConfig } from '../../../types';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import type { AiSummaryExtended, JobReviewDraft } from '../aiChatModel';
import AiJobReviewPanel from './AiJobReviewPanel';

type ConnectionTone = 'green' | 'red' | 'unknown';

function connectionMeta(provider?: AiProviderConfig | null): {
  tone: ConnectionTone;
  label: string;
  host: string;
} {
  const host = provider?.baseUrlHost || '未设置服务地址';
  if (!provider) return { tone: 'unknown', label: '读取中', host };
  if (!provider.enabled) return { tone: 'red', label: '已禁用', host };
  if (!provider.configured) return { tone: 'red', label: '未配置', host };

  const health = provider.health?.status;
  if (health === 'healthy') return { tone: 'green', label: '已接通', host };
  if (health === 'degraded') return { tone: 'red', label: '降级', host };
  if (health === 'unavailable' || health === 'disabled') return { tone: 'red', label: '不可用', host };
  if (health === 'unconfigured') return { tone: 'red', label: '未配置', host };
  // configured but never verified / unknown → still show green as “可连配置就绪”，测试结果再覆盖
  return { tone: 'green', label: '已配置', host };
}

export default function AiSidePanel({
  data,
  selectedModel,
  onModelChange,
  models,
  modelsLoading,
  modelsError,
  connectionTesting,
  connectionOnline,
  connectionLatencyMs,
  connectionError,
  onRefreshConnection,
  selectedJob,
  reviewDraft,
  setReviewDraft,
  jobLoading,
  jobAction,
  pollingError,
  onOpenJob,
  onConfirm,
  onReject,
  onRetry,
}: {
  data: AiSummaryExtended;
  selectedModel: string;
  onModelChange: (model: string) => void;
  models: AiModelOption[];
  modelsLoading: boolean;
  modelsError: string | null;
  connectionTesting: boolean;
  connectionOnline: boolean | null;
  connectionLatencyMs: number | null;
  connectionError: string | null;
  onRefreshConnection: () => void;
  selectedJob: AiJob | null;
  reviewDraft: JobReviewDraft | null;
  setReviewDraft: Dispatch<SetStateAction<JobReviewDraft | null>>;
  jobLoading: boolean;
  jobAction: string | null;
  pollingError: string | null;
  onOpenJob: (jobId: string) => void;
  onConfirm: (mode?: 'original' | 'edited') => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  const base = connectionMeta(data.aiProvider);
  const tone: ConnectionTone = connectionTesting
    ? 'unknown'
    : connectionOnline === true
      ? 'green'
      : connectionOnline === false
        ? 'red'
        : base.tone;
  const label = connectionTesting
    ? '检测中'
    : connectionOnline === true
      ? '已接通'
      : connectionOnline === false
        ? '未接通'
        : base.label;

  const modelOptions = models.length
    ? models
    : selectedModel
      ? [{ id: selectedModel, name: selectedModel, ownedBy: null }]
      : data.aiProvider?.model
        ? [{ id: data.aiProvider.model, name: data.aiProvider.model, ownedBy: null }]
        : [];

  return (
    <div className="ai-chat-side">
      <Panel
        className="ai-connection-panel"
        title="接入状态"
        subtitle={base.host}
        toolbar={(
          <button
            type="button"
            className="btn btn-text btn-xs btn-with-icon"
            onClick={onRefreshConnection}
            disabled={connectionTesting || modelsLoading}
            title="刷新接入状态与模型列表"
          >
            {connectionTesting || modelsLoading
              ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
              : <RefreshCw size={13} aria-hidden="true" />}
            检测
          </button>
        )}
      >
        <div className={`ai-connection-status is-${tone}`} role="status" aria-live="polite">
          <span className="ai-connection-dot" aria-hidden="true" />
          <div className="ai-connection-copy">
            <strong>{label}</strong>
            <em>
              {connectionTesting
                ? '正在探测模型服务…'
                : connectionOnline === true
                  ? `接口可用${connectionLatencyMs != null ? ` · ${connectionLatencyMs}ms` : ''}`
                  : connectionOnline === false
                    ? (connectionError || '接口不可用，请检查密钥与地址')
                    : data.aiProvider?.configured
                      ? '已配置，可点击检测确认连通性'
                      : '请先在系统设置中配置 AI Provider'}
            </em>
          </div>
        </div>

        <div className="ai-model-picker">
          <label className="form-label" htmlFor="ai-model-select">对话模型</label>
          <select
            id="ai-model-select"
            className="form-select"
            value={selectedModel || modelOptions[0]?.id || ''}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={modelsLoading || (!modelOptions.length && !selectedModel)}
            aria-label="选择对话模型"
          >
            {!modelOptions.length ? <option value="">暂无可用模型</option> : null}
            {modelOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.id}
              </option>
            ))}
          </select>
          <div className="ai-model-picker-meta">
            {modelsLoading
              ? '正在从接口拉取模型…'
              : modelsError
                ? modelsError
                : models.length
                  ? `已从接口获取 ${models.length} 个模型`
                  : '使用当前配置模型；检测成功后可刷新列表'}
          </div>
        </div>
      </Panel>

      {data.recentJobs?.length ? (
        <Panel title="近期 AI 任务" subtitle="文档和日志分析记录">
          <div className="ai-chat-job-list">
            {data.recentJobs.slice(0, 5).map((job) => (
              <button
                key={job.jobId}
                className="ai-chat-job ai-chat-job-button"
                onClick={() => void onOpenJob(job.jobId)}
                disabled={jobLoading || jobAction !== null}
              >
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
        <>
          {pollingError ? <div className="form-error" role="status">{pollingError}</div> : null}
          <AiJobReviewPanel
            selectedJob={selectedJob}
            reviewDraft={reviewDraft}
            setReviewDraft={setReviewDraft}
            jobAction={jobAction}
            onConfirm={onConfirm}
            onReject={onReject}
            onRetry={onRetry}
          />
        </>
      ) : null}
    </div>
  );
}
