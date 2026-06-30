import { useMemo, useRef, useState } from 'react';
import { Bot, FileText, Image as ImageIcon, Paperclip, RefreshCw, Send, X } from 'lucide-react';
import { confirmAiJob, fetchAiJob, fetchAiSummary, rejectAiJob, retryAiJob, sendAiChat } from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import StatusBadge from '../components/common/StatusBadge';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import type { AiChatAttachment, AiChatMessage, AiJob, AiSummary } from '../types';

interface AiSummaryExtended extends AiSummary {
  metrics?: {
    totalJobs?: number;
    awaitingReview?: number;
    failed?: number;
    writtenToBusiness?: number;
    avgConfidence?: number;
  };
  recentJobs?: Array<{
    jobId: string;
    scene: string;
    status: string;
    progress: number;
    currentStep: string;
  }>;
}

interface JobReviewDraft {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  acceptanceCriteria: string;
}

const MAX_ATTACHMENTS = 6;

function nowIso() {
  return new Date().toISOString();
}

function attachmentKind(file: File): 'image' | 'document' {
  return file.type.startsWith('image/') ? 'image' : 'document';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',')[1] : value);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function canReadText(file: File) {
  return (
    file.type.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/x-yaml', 'text/markdown'].includes(file.type) ||
    /\.(md|txt|json|csv|xml|yaml|yml|log)$/i.test(file.name)
  );
}

async function fileToAttachment(file: File): Promise<AiChatAttachment> {
  const kind = attachmentKind(file);
  if (kind === 'image') {
    return {
      name: file.name,
      mimeType: file.type || 'image/png',
      size: file.size,
      kind,
      contentBase64: await fileToBase64(file),
    };
  }

  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    kind,
    contentText: canReadText(file) ? (await file.text()).slice(0, 12000) : '',
    contentBase64: await fileToBase64(file),
  };
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

function formatSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function messageSource(message: AiChatMessage) {
  if (message.role !== 'assistant') return null;
  if (message.fallback) return { label: '规则兜底', status: 'warning' };
  if (message.generatedBy === 'error') return { label: '调用失败', status: 'risk' };
  if (message.modelUsed) return { label: '真实模型', status: 'success' };
  return { label: '本地提示', status: 'neutral' };
}

function attachmentReadState(item: AiChatAttachment, role: AiChatMessage['role']) {
  if (item.kind === 'image') return role === 'assistant' ? '模型已接收' : '图片已附加';
  if (item.contentText) return '已读取文本';
  return role === 'assistant' ? '后端已处理' : '等待后端解析';
}

function arrayOfText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      return String(record.title || record.name || record.summary || JSON.stringify(record));
    }
    return String(item);
  }).filter(Boolean).slice(0, 5);
}

function firstRequirement(job: AiJob | null) {
  const requirements = job?.result?.requirements;
  return Array.isArray(requirements) && requirements[0] && typeof requirements[0] === 'object'
    ? requirements[0] as Record<string, unknown>
    : null;
}

function normalizePriority(value: unknown): JobReviewDraft['priority'] {
  return value === 'high' || value === 'low' ? value : 'medium';
}

function buildReviewDraft(job: AiJob | null): JobReviewDraft | null {
  const requirement = firstRequirement(job);
  if (!job || !requirement) return null;
  const criteria = Array.isArray(requirement.acceptanceCriteria)
    ? requirement.acceptanceCriteria.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return {
    title: String(requirement.title || '').trim(),
    description: String(job.result?.summary || '').trim(),
    priority: normalizePriority(requirement.priority),
    acceptanceCriteria: criteria.join('\n'),
  };
}

function jobSummary(job: AiJob | null) {
  if (!job?.result) return null;
  const result = job.result as Record<string, unknown>;
  return {
    summary: String(result.summary || ''),
    requirements: arrayOfText(result.requirements),
    risks: arrayOfText(result.risks),
    recommendations: arrayOfText(result.recommendations),
  };
}

function renderChatContent(content: string) {
  return content.split('\n').map((line, index) => {
    const text = line
      .replace(/\*\*/g, '')
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*]\s+/, '• ');
    return text.trim() ? <p key={`${index}-${text.slice(0, 12)}`}>{text}</p> : <br key={`br-${index}`} />;
  });
}

function AiPage() {
  const { data, loading, error, reload } = useAsync<AiSummaryExtended>(fetchAiSummary, []);
  const toast = useToast();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '我是项目管理 AI 助手。你可以直接问项目进度、风险、需求、缺陷、交付，也可以上传截图或文档让我分析。',
      createdAt: nowIso(),
      generatedBy: 'local',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<AiChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<AiJob | null>(null);
  const [reviewDraft, setReviewDraft] = useState<JobReviewDraft | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobAction, setJobAction] = useState<string | null>(null);

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
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: '新的对话已开始。可以问我项目现状，也可以上传截图、需求文档或测试记录。',
        createdAt: nowIso(),
        generatedBy: 'local',
      },
    ]);
    setAttachments([]);
    setDraft('');
    setFileError(null);
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
        description="以对话方式分析项目、需求、缺陷、交付、图片和文档。"
        actions={(
          <button className="btn btn-secondary btn-sm" onClick={resetChat}>
            <RefreshCw size={15} />
            新对话
          </button>
        )}
      />

      <div className="ai-chat-layout">
        <Panel
          className="ai-chat-panel"
          title="项目 AI 对话"
          subtitle={providerStatus}
          toolbar={<StatusBadge label={data.aiProvider?.configured ? '真实模型' : '规则兜底'} status={data.aiProvider?.configured ? 'success' : 'warning'} />}
        >
          <div className="ai-chat-messages">
            {messages.map((message) => (
              <div key={message.id} className={`ai-chat-message ${message.role}`}>
                <div className="ai-chat-avatar">
                  {message.role === 'assistant' ? <Bot size={16} /> : '我'}
                </div>
                <div className="ai-chat-bubble">
                  <div className="ai-chat-meta">
                    <span>{message.role === 'assistant' ? 'AI 助手' : '你'}</span>
                    <span>{formatTime(message.createdAt)}</span>
                    {messageSource(message) ? (
                      <StatusBadge
                        label={messageSource(message)!.label}
                        status={messageSource(message)!.status}
                        showDot
                      />
                    ) : null}
                    {message.modelUsed ? <span className="text-mono">{message.modelUsed}</span> : null}
                    {message.generatedBy && !['local', 'error'].includes(message.generatedBy) ? <span>{message.generatedBy}</span> : null}
                  </div>
                  <div className="ai-chat-content">{renderChatContent(message.content)}</div>
                  {message.attachments?.length ? (
                    <div className="ai-chat-attachments">
                      {message.attachments.map((item) => (
                        <span key={`${message.id}-${item.name}`}>
                          {item.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}
                          {item.name}
                          <small>{formatSize(item.size)}</small>
                          <small>{attachmentReadState(item, message.role)}</small>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {sending ? (
              <div className="ai-chat-message assistant">
                <div className="ai-chat-avatar"><Bot size={16} /></div>
                <div className="ai-chat-bubble">
                  <div className="ai-chat-meta"><span>AI 助手</span></div>
                  <div className="ai-chat-content"><p>正在结合项目数据和附件分析...</p></div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="ai-chat-composer">
            {attachments.length > 0 && (
              <div className="ai-chat-pending-files">
                {attachments.map((item) => (
                  <span key={item.name}>
                    {item.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}
                    {item.name}
                    <small>{formatSize(item.size)}</small>
                    <button type="button" onClick={() => setAttachments((prev) => prev.filter((file) => file !== item))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {fileError ? <div className="form-error">{fileError}</div> : null}
            <div className="ai-chat-input-row">
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                <Paperclip size={15} />
              </button>
              <textarea
                className="form-textarea"
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="直接输入问题，或上传截图、TXT/Markdown/PDF 等文档后提问。"
                disabled={sending}
              />
              <button className="btn btn-primary btn-sm" type="button" onClick={handleSend} disabled={sending || (!draft.trim() && attachments.length === 0)}>
                <Send size={15} />
                发送
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.txt,.md,.json,.csv,.xml,.yaml,.yml,.log,.pdf,.doc,.docx"
                style={{ display: 'none' }}
                onChange={(event) => handleFiles(event.target.files)}
              />
            </div>
          </div>
        </Panel>

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
                  <button key={job.jobId} className="ai-chat-job ai-chat-job-button" onClick={() => void openJob(job.jobId)} disabled={jobLoading || jobAction !== null}>
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
            <Panel title="AI 结果审核" subtitle={`${selectedJob.jobId} · ${selectedJob.currentStep}`}>
              <div className="ai-job-review">
                <div className="ai-job-review-head">
                  <StatusBadge label={selectedJob.status} status={selectedJob.status} />
                  <span>{selectedJob.progress}%</span>
                  {selectedJob.writtenRequirementId ? <span>已写入 {selectedJob.writtenRequirementId}</span> : null}
                </div>
                {(() => {
                  const summary = jobSummary(selectedJob);
                  return summary ? (
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
                  ) : <div className="text-secondary">暂无结构化结果。</div>;
                })()}
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
                      <button className="btn btn-primary btn-sm" onClick={() => void handleConfirmJob()} disabled={jobAction !== null}>
                        {jobAction === 'confirm' ? '写入中...' : '确认写入'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => void handleConfirmJob('edited')} disabled={jobAction !== null || !reviewDraft?.title.trim()}>
                        {jobAction === 'confirm-edited' ? '写入中...' : '编辑后写入'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => void handleRejectJob()} disabled={jobAction !== null}>
                        {jobAction === 'reject' ? '忽略中...' : '忽略'}
                      </button>
                    </>
                  ) : null}
                  {['failed', 'rejected'].includes(selectedJob.status) ? (
                    <button className="btn btn-primary btn-sm" onClick={() => void handleRetryJob()} disabled={jobAction !== null}>
                      {jobAction === 'retry' ? '重试中...' : '重新分析'}
                    </button>
                  ) : null}
                </div>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default AiPage;
