import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  confirmAiJob,
  fetchAiJob,
  fetchAiModels,
  fetchAiSummary,
  rejectAiJob,
  retryAiJob,
  sendAiChat,
  testAiProviderConfig,
} from '../api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import { useAiJobPolling } from '../../../hooks/useAiJobPolling';
import { ApiError } from '../../../services/api';
import PageState from '../../../components/common/PageState';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import type { AiChatAttachment, AiChatMessage, AiJob, AiModelOption, Project } from '../../../types';
import {
  MAX_ATTACHMENTS,
  validateAttachmentFiles,
  buildReviewDraft,
  createWelcomeMessage,
  fileToAttachment,
  nowIso,
  type AiSummaryExtended,
  type JobReviewDraft,
} from '../aiChatModel';
import AiChatPanel from './AiChatPanel';
import AiSidePanel from './AiSidePanel';

export default function AiView() {
  const { data, loading, error, reload } = useAsync<AiSummaryExtended>(fetchAiSummary, [], { cacheKey: 'ai:summary' });
  const projectsAsync = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const toast = useToast();
  const confirm = useConfirm();
  const [messages, setMessages] = useState<AiChatMessage[]>([
    createWelcomeMessage('我是项目管理 AI 助手。可对话查询，也可指令式写操作：需求/缺陷/任务/用例/项目/产品/构建/发布/文档/迭代/日报/工时/风险等；确认后才写入正式接口。'),
  ]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<AiChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<AiJob | null>(null);
  const [reviewDraft, setReviewDraft] = useState<JobReviewDraft | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobAction, setJobAction] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [connectionTesting, setConnectionTesting] = useState(false);
  const [connectionOnline, setConnectionOnline] = useState<boolean | null>(null);
  const [connectionLatencyMs, setConnectionLatencyMs] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const jobPolling = useAiJobPolling({
    job: selectedJob,
    pollJob: fetchAiJob,
    onUpdate: (latest) => {
      setSelectedJob((current) => current?.jobId === latest.jobId ? latest : current);
    },
    onAwaitingReview: (latest) => {
      setReviewDraft(buildReviewDraft(latest));
      reload();
    },
  });

  useEffect(() => {
    const configuredModel = data?.aiProvider?.model || '';
    if (!selectedModel && configuredModel) setSelectedModel(configuredModel);
  }, [data?.aiProvider?.model, selectedModel]);

  const providerStatus = useMemo(() => {
    const provider = data?.aiProvider;
    if (!provider) return '读取中';
    if (!provider.configured) return '未配置';
    const model = selectedModel || provider.model;
    return `${model} · ${provider.wireApi === 'responses' ? 'Responses' : 'Chat Completions'}`;
  }, [data, selectedModel]);

  async function refreshModels(preferredModel?: string) {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await fetchAiModels();
      const nextModels = result.models || [];
      setModels(nextModels);
      const nextModel = preferredModel
        || selectedModel
        || result.currentModel
        || nextModels[0]?.id
        || data?.aiProvider?.model
        || '';
      if (nextModel) setSelectedModel(nextModel);
      return result;
    } catch (err) {
      setModels([]);
      setModelsError(err instanceof ApiError ? err.message : '拉取模型列表失败');
      throw err;
    } finally {
      setModelsLoading(false);
    }
  }

  async function refreshConnection() {
    setConnectionTesting(true);
    setConnectionError(null);
    try {
      // 1) Always resolve models via /api/ai/models (ai:*). This is the source of the selector.
      const modelResult = await refreshModels();
      // 2) Optional live chat probe for latency (admin only). Non-admin keeps model-list connectivity.
      try {
        const probe = await testAiProviderConfig();
        setConnectionOnline(Boolean(probe.ok) && Boolean(modelResult.ok));
        setConnectionLatencyMs(probe.latencyMs ?? null);
        if (!probe.ok) setConnectionError('模型服务探测失败');
      } catch (err) {
        // 403 / no admin permission: treat successful model list as online.
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
          setConnectionOnline(Boolean(modelResult.ok));
          setConnectionLatencyMs(null);
        } else {
          // Admin probe failed for real connectivity reasons → red.
          setConnectionOnline(false);
          setConnectionLatencyMs(null);
          setConnectionError(err instanceof ApiError ? err.message : '接入检测失败');
        }
      }
    } catch (err) {
      setConnectionOnline(false);
      setConnectionLatencyMs(null);
      setConnectionError(err instanceof ApiError ? err.message : '接入检测失败');
    } finally {
      setConnectionTesting(false);
    }
  }

  useEffect(() => {
    if (!data?.aiProvider) return;
    // Auto probe once summary is ready so the light is not stuck grey.
    void refreshConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.aiProvider?.configured, data?.aiProvider?.model, data?.aiProvider?.baseUrlHost]);

  async function handleFiles(files: FileList | null) {
    setFileError(null);
    if (!files?.length) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length < files.length) setFileError(`单次对话最多附加 ${MAX_ATTACHMENTS} 个文件。`);
    const validationError = validateAttachmentFiles(
      selected,
      attachments.reduce((total, item) => total + item.size, 0),
    );
    if (validationError) {
      setFileError(validationError);
      return;
    }

    try {
      const next = await Promise.all(selected.map(fileToAttachment));
      setAttachments((prev) => [...prev, ...next]);
    } catch {
      setFileError('读取附件失败，请换一个文件重试。');
    }
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content && attachments.length === 0) return;

    const userMessage: AiChatMessage = {
      id: `USER-${Date.now()}`,
      role: 'user',
      content: content || '请分析这些附件。',
      createdAt: nowIso(),
      attachments,
    };
    const history = [...messages, userMessage];
    setMessages(history);
    setDraft('');
    setAttachments([]);
    setSending(true);

    try {
      const reply = await sendAiChat({
        messages: history.map((item) => ({ role: item.role, content: item.content })),
        attachments: userMessage.attachments,
        scope: 'project-management',
        currentPage: window.location.hash || '/ai',
        model: selectedModel || undefined,
      });
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ERR-${Date.now()}`,
          role: 'assistant',
          content: err instanceof Error ? err.message : 'AI 助手暂时不可用，请稍后重试。',
          createdAt: nowIso(),
          fallback: true,
          generatedBy: 'error',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function resetChat() {
    setMessages([
      createWelcomeMessage('新的对话已开始。可以问项目现状，也可以说「新建需求」或上传需求文档生成草稿。', `welcome-${Date.now()}`),
    ]);
    setAttachments([]);
    setDraft('');
    setFileError(null);
  }

  function handleActionDone(result: { type: string; id: string; label: string }) {
    toast.success(`${result.label}成功：${result.id}`);
    setMessages((prev) => [
      ...prev,
      {
        id: `SYS-${Date.now()}`,
        role: 'assistant',
        content: `已确认执行「${result.label}」→ ${result.id}。可继续下一条指令（创建/修改/删除/改状态）。`,
        createdAt: nowIso(),
        generatedBy: 'system',
      },
    ]);
  }

  async function openJob(jobId: string) {
    setJobLoading(true);
    try {
      const job = await fetchAiJob(jobId);
      setSelectedJob(job);
      setReviewDraft(buildReviewDraft(job));
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '读取 AI 任务失败');
    } finally {
      setJobLoading(false);
    }
  }

  async function handleConfirmJob(mode: 'original' | 'edited' = 'original') {
    if (!selectedJob) return;
    const edited = mode === 'edited';
    const criteria = reviewDraft?.acceptanceCriteria
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean) || [];
    if (edited && !reviewDraft?.title.trim()) {
      toast.error('编辑后写入前需要填写需求标题');
      return;
    }
    const ok = await confirm({
      title: edited ? '编辑后写入 AI 分析结果？' : '确认写入 AI 分析结果？',
      description: edited
        ? '确认后会按当前编辑稿写入业务需求池，并记录审计日志。'
        : '确认后会把 AI 生成的第一条需求写入业务需求池，并记录审计日志。',
      confirmText: edited ? '编辑后写入' : '确认写入',
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
      toast.success(job.writtenRequirementId ? `已写入需求：${job.writtenRequirementId}` : 'AI 任务已确认');
      await reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '确认 AI 任务失败');
    } finally {
      setJobAction(null);
    }
  }

  async function handleRejectJob() {
    if (!selectedJob) return;
    const ok = await confirm({
      title: '忽略 AI 分析结果？',
      description: '忽略后该任务不会写入业务数据，后续仍可重新分析。',
      confirmText: '忽略结果',
      tone: 'danger',
    });
    if (!ok) return;
    setJobAction('reject');
    try {
      const job = await rejectAiJob(selectedJob.jobId, { reason: '用户在 AI 助手页忽略' });
      setSelectedJob(job);
      setReviewDraft(buildReviewDraft(job));
      toast.success('已忽略 AI 分析结果');
      await reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '驳回 AI 任务失败');
    } finally {
      setJobAction(null);
    }
  }

  async function handleRetryJob() {
    if (!selectedJob) return;
    setJobAction('retry');
    try {
      const job = await retryAiJob(selectedJob.jobId);
      setSelectedJob(job);
      setReviewDraft(buildReviewDraft(job));
      toast.success('AI 任务已重新分析');
      await reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '重试 AI 任务失败');
    } finally {
      setJobAction(null);
    }
  }

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  return (
    <div className="ai-chat-page">
      <div className="page-inline-actions mb-4 flex justify-end">
        <button className="btn btn-secondary btn-sm" onClick={resetChat}>
          <RefreshCw size={15} />
          新对话
        </button>
      </div>

      <div className="ai-chat-layout">
        <AiChatPanel
          providerStatus={providerStatus}
          providerConfigured={data.aiProvider?.configured}
          messages={messages}
          draft={draft}
          setDraft={setDraft}
          attachments={attachments}
          setAttachments={setAttachments}
          sending={sending}
          fileError={fileError}
          onFiles={handleFiles}
          onSend={() => { void handleSend(); }}
          projects={projectsAsync.data ?? []}
          onActionDone={handleActionDone}
        />

        <AiSidePanel
          data={data}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          models={models}
          modelsLoading={modelsLoading}
          modelsError={modelsError}
          connectionTesting={connectionTesting}
          connectionOnline={connectionOnline}
          connectionLatencyMs={connectionLatencyMs}
          connectionError={connectionError}
          onRefreshConnection={() => { void refreshConnection(); }}
          selectedJob={selectedJob}
          reviewDraft={reviewDraft}
          setReviewDraft={setReviewDraft}
          jobLoading={jobLoading}
          jobAction={jobAction}
          pollingError={jobPolling.error}
          onOpenJob={openJob}
          onConfirm={handleConfirmJob}
          onReject={handleRejectJob}
          onRetry={handleRetryJob}
        />
      </div>
    </div>
  );
}
