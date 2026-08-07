import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { AiJob, AiModelOption, AiProviderConfig } from '../../../types';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import type { AiSummaryExtended, JobReviewDraft } from '../aiChatModel';
import AiJobReviewPanel from './AiJobReviewPanel';

type ConnectionTone = 'green' | 'red' | 'unknown';

function connectionMeta(t: (key: string) => string, provider?: AiProviderConfig | null): {
  tone: ConnectionTone;
  label: string;
  host: string;
} {
  const host = provider?.baseUrlHost || t('features.ai.aiSidePanel.noServiceUrl');
  if (!provider) return { tone: 'unknown', label: t('features.ai.aiSidePanel.reading'), host };
  if (!provider.enabled) return { tone: 'red', label: t('features.ai.aiSidePanel.disabled'), host };
  if (!provider.configured) return { tone: 'red', label: t('features.ai.aiSidePanel.notConfigured'), host };

  const health = provider.health?.status;
  if (health === 'healthy') return { tone: 'green', label: t('features.ai.aiSidePanel.connected'), host };
  if (health === 'degraded') return { tone: 'red', label: t('features.ai.aiSidePanel.degraded'), host };
  if (health === 'unavailable' || health === 'disabled') return { tone: 'red', label: t('features.ai.aiSidePanel.unavailable'), host };
  if (health === 'unconfigured') return { tone: 'red', label: t('features.ai.aiSidePanel.notConfigured'), host };
  // configured but never verified / unknown → still show green as “可连配置就绪”，测试结果再覆盖
  return { tone: 'green', label: t('features.ai.aiSidePanel.configured'), host };
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
  const { t } = useTranslation();
  const base = connectionMeta(t, data.aiProvider);
  const tone: ConnectionTone = connectionTesting
    ? 'unknown'
    : connectionOnline === true
      ? 'green'
      : connectionOnline === false
        ? 'red'
        : base.tone;
  const label = connectionTesting
    ? t('features.ai.aiSidePanel.testing')
    : connectionOnline === true
      ? t('features.ai.aiSidePanel.connected')
      : connectionOnline === false
        ? t('features.ai.aiSidePanel.notConnected')
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
        title={t('features.ai.aiSidePanel.connectionTitle')}
        subtitle={base.host}
        toolbar={(
          <button
            type="button"
            className="btn btn-text btn-xs btn-with-icon"
            onClick={onRefreshConnection}
            disabled={connectionTesting || modelsLoading}
            title={t('features.ai.aiSidePanel.refreshConnectionTitle')}
          >
            {connectionTesting || modelsLoading
              ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
              : <RefreshCw size={13} aria-hidden="true" />}
            {t('features.ai.aiSidePanel.testButton')}
          </button>
        )}
      >
        <div className={`ai-connection-status is-${tone}`} role="status" aria-live="polite">
          <span className="ai-connection-dot" aria-hidden="true" />
          <div className="ai-connection-copy">
            <strong>{label}</strong>
            <em>
              {connectionTesting
                ? t('features.ai.aiSidePanel.probingModelService')
                : connectionOnline === true
                  ? t('features.ai.aiSidePanel.interfaceAvailable', { latency: connectionLatencyMs != null ? ` · ${connectionLatencyMs}ms` : '' })
                  : connectionOnline === false
                    ? (connectionError || t('features.ai.aiSidePanel.interfaceUnavailable'))
                    : data.aiProvider?.configured
                      ? t('features.ai.aiSidePanel.configuredReadyToTest')
                      : t('features.ai.aiSidePanel.configureInSettings')}
            </em>
          </div>
        </div>

        <div className="ai-model-picker">
          <label className="form-label" htmlFor="ai-model-select">{t('features.ai.aiSidePanel.chatModel')}</label>
          <select
            id="ai-model-select"
            className="form-select"
            value={selectedModel || modelOptions[0]?.id || ''}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={modelsLoading || (!modelOptions.length && !selectedModel)}
            aria-label={t('features.ai.aiSidePanel.selectChatModel')}
          >
            {!modelOptions.length ? <option value="">{t('features.ai.aiSidePanel.noModels')}</option> : null}
            {modelOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name || item.id}
              </option>
            ))}
          </select>
          <div className="ai-model-picker-meta">
            {modelsLoading
              ? t('features.ai.aiSidePanel.fetchingModels')
              : modelsError
                ? modelsError
                : models.length
                  ? t('features.ai.aiSidePanel.modelsLoaded', { count: models.length })
                  : t('features.ai.aiSidePanel.useCurrentModel')}
          </div>
        </div>
      </Panel>

      {data.recentJobs?.length ? (
        <Panel title={t('features.ai.aiSidePanel.recentJobs')} subtitle={t('features.ai.aiSidePanel.recentJobsSubtitle')}>
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
