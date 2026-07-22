import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { confirmAiJob, fetchAiJob, fetchAiSummary, rejectAiJob, retryAiJob, sendAiChat } from '../api';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import PageHeader from '../../../components/common/PageHeader';
import PageState from '../../../components/common/PageState';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import type { AiChatAttachment, AiChatMessage, AiJob, Project } from '../../../types';
import {
  MAX_ATTACHMENTS,
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
  const { data, loading, error, reload } = useAsync<AiSummaryExtended>(fetchAiSummary, []);
  const projectsAsync = useAsync<Project[]>(fetchProjects, []);
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

  useEffect(() => {
    const jobId = selectedJob?.jobId;
    if (!jobId || !['queued', 'running', 'retried'].includes(selectedJob.status)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const latest = await fetchAiJob(jobId);
        if (cancelled) return;
        setSelectedJob((current) => current?.jobId === jobId ? latest : current);
        if (latest.status === 'awaiting_review') {
          setReviewDraft(buildReviewDraft(latest));
          reload();
        }
      } catch {
        // Keep the current status visible; the user can refresh manually.
      }
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reload, selectedJob?.jobId, selectedJob?.status]);

  const providerStatus = useMemo(() => {
    const provider = data?.aiProvider;
    if (!provider) return '读取中';
    if (!provider.configured) return '未配置';
    return `${provider.model} · ${provider.wireApi === 'responses' ? 'Responses' : 'Chat Completions'}`;
  }, [data]);

  async function handleFiles(files: FileList | null) {
    setFileError(null);
    if (!files?.length) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length < files.length) setFileError(`单次对话最多附加 ${MAX_ATTACHMENTS} 个文件。`);

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
    return (
      <div>
        <PageHeader title="AI 助手" description="通过对话分析项目数据、截图和文档。" />
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="ai-chat-page">
      <PageHeader
        title="AI 助手"
        description="对话分析 + 全业务写操作草稿（创建/修改/删除/改状态）；确认后走正式 API，从不静默写库。"
        actions={(
          <button className="btn btn-secondary btn-sm" onClick={resetChat}>
            <RefreshCw size={15} />
            新对话
          </button>
        )}
      />

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
          selectedJob={selectedJob}
          reviewDraft={reviewDraft}
          setReviewDraft={setReviewDraft}
          jobLoading={jobLoading}
          jobAction={jobAction}
          onOpenJob={openJob}
          onConfirm={handleConfirmJob}
          onReject={handleRejectJob}
          onRetry={handleRetryJob}
        />
      </div>
    </div>
  );
}
