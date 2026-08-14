import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import {
  confirmAiJob,
  fetchAiCapabilityAvailability,
  fetchAiJob,
  fetchAiSummary,
  invokeAiCapability,
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
import type {
  AiCapabilityInvocation,
  AiCapabilityManifest,
  AiChatAttachment,
  AiChatMessage,
  AiJob,
  Project,
} from '../../../types';
import type { AiCapabilityAvailability } from '../api';
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
import AiCapabilityTray from './AiCapabilityTray';
import AiSidePanel from './AiSidePanel';

export default function AiView() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync<AiSummaryExtended>(fetchAiSummary, [], { cacheKey: 'ai:summary' });
  const projectsAsync = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const capabilitiesAsync = useAsync<AiCapabilityAvailability>(
    fetchAiCapabilityAvailability,
    [],
    { cacheKey: 'ai:capabilities' },
  );
  const toast = useToast();
  const confirm = useConfirm();
  const [messages, setMessages] = useState<AiChatMessage[]>([
    createWelcomeMessage(t('features.ai.aiView.welcomeMessage')),
  ]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<AiChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<AiJob | null>(null);
  const [reviewDraft, setReviewDraft] = useState<JobReviewDraft | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobAction, setJobAction] = useState<string | null>(null);
  const [connectionTesting, setConnectionTesting] = useState(false);
  const [connectionOnline, setConnectionOnline] = useState<boolean | null>(null);
  const [connectionLatencyMs, setConnectionLatencyMs] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [invokingCapabilityId, setInvokingCapabilityId] = useState<string | null>(null);
  const [latestCapabilityInvocation, setLatestCapabilityInvocation] = useState<AiCapabilityInvocation | null>(null);

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

  const providerStatus = useMemo(() => {
    const provider = data?.aiProvider;
    if (!provider) return t('features.ai.aiView.providerReading');
    if (!provider.configured || !data?.aiAssistant?.available) return t('features.ai.aiView.providerNotConfigured');
    const model = data.aiAssistant.resolvedModel || provider.model;
    return `${model} · ${provider.wireApi === 'responses' ? 'Responses' : 'Chat Completions'}`;
  }, [data, t]);

  async function refreshConnection() {
    setConnectionTesting(true);
    setConnectionError(null);
    try {
      const probe = await testAiProviderConfig({ id: data?.aiAssistant?.resolvedProviderId || undefined });
      setConnectionOnline(Boolean(probe.ok));
      setConnectionLatencyMs(probe.latencyMs ?? null);
      if (!probe.ok) setConnectionError(t('features.ai.aiView.probeFailed'));
    } catch (err) {
      const noAdminProbePermission = err instanceof ApiError && (err.status === 403 || err.status === 401);
      // A permission denial only tells us this user cannot run the admin probe.
      // Leave the connection unverified instead of treating configuration as reachability.
      setConnectionOnline(noAdminProbePermission ? null : false);
      setConnectionLatencyMs(null);
      if (!noAdminProbePermission) setConnectionError(err instanceof ApiError ? err.message : t('features.ai.aiView.connectionTestFailed'));
    } finally {
      setConnectionTesting(false);
    }
  }

  useEffect(() => {
    if (!data?.aiProvider) return;
    // Auto probe once summary is ready so the light is not stuck grey.
    void refreshConnection();
  }, [data?.aiProvider?.configured, data?.aiAssistant?.available, data?.aiAssistant?.resolvedModel, data?.aiAssistant?.resolvedProviderId]);

  async function handleFiles(files: FileList | null) {
    setFileError(null);
    if (!files?.length) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length < files.length) setFileError(t('features.ai.aiView.maxAttachmentsPerChat', { count: MAX_ATTACHMENTS }));
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
      setFileError(t('common.readAttachmentFailed'));
    }
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content && attachments.length === 0) return;

    const userMessage: AiChatMessage = {
      id: `USER-${Date.now()}`,
      role: 'user',
      content: content || t('common.analyzeAttachments'),
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
          content: err instanceof Error ? err.message : t('common.aiUnavailable'),
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
      createWelcomeMessage(t('features.ai.aiView.newChatWelcome'), `welcome-${Date.now()}`),
    ]);
    setAttachments([]);
    setDraft('');
    setFileError(null);
    setLatestCapabilityInvocation(null);
  }

  function handleActionDone(result: { type: string; id: string; label: string }) {
    toast.success(t('features.ai.aiView.actionSuccess', { label: result.label, id: result.id }));
    setMessages((prev) => [
      ...prev,
      {
        id: `SYS-${Date.now()}`,
        role: 'assistant',
        content: t('features.ai.aiView.actionConfirmed', { label: result.label, id: result.id }),
        createdAt: nowIso(),
        generatedBy: 'system',
      },
    ]);
  }

  async function handleInvokeCapability(
    capability: AiCapabilityManifest,
    input: Record<string, string>,
  ): Promise<void> {
    setInvokingCapabilityId(capability.id);
    try {
      const invocation = await invokeAiCapability(capability.id, input);
      setLatestCapabilityInvocation(invocation);
      toast.success(t('features.ai.aiView.capabilityQueued'));
      if (invocation.jobId) await openJob(invocation.jobId);
      reload();
    } catch {
      // Capability runtime failures stay inside the BFF boundary.
      toast.error(t('features.ai.aiView.capabilityInvokeFailed'));
    } finally {
      setInvokingCapabilityId(null);
    }
  }

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

  async function handleConfirmJob(mode: 'original' | 'edited' = 'original') {
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
      await reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.ai.aiView.confirmJobFailed'));
    } finally {
      setJobAction(null);
    }
  }

  async function handleRejectJob() {
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
      await reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.ai.aiView.rejectJobFailed'));
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
      toast.success(t('features.ai.aiView.jobReanalyzed'));
      await reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.ai.aiView.retryJobFailed'));
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
          {t('features.ai.aiView.newChat')}
        </button>
      </div>

      <div className="ai-chat-layout">
        <AiChatPanel
          providerStatus={providerStatus}
          providerConfigured={Boolean(data.aiProvider?.configured && data.aiAssistant?.available)}
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
          capabilityTray={
            <AiCapabilityTray
              availability={capabilitiesAsync.data}
              projects={projectsAsync.data ?? []}
              latestInvocation={latestCapabilityInvocation}
              invokingCapabilityId={invokingCapabilityId}
              onInvoke={handleInvokeCapability}
            />
          }
        />

        <AiSidePanel
          data={data}
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
