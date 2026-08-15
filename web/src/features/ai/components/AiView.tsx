import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircleQuestion, RefreshCw } from 'lucide-react';
import { fetchAiJob, fetchAiSummary } from '../api/chat';
import { testAiProviderConfig } from '../api/providers';
import { fetchProjects } from '../../projects/api';
import { useAsync } from '../../../hooks/useAsync';
import { useAiJobPolling } from '../../../hooks/useAiJobPolling';
import { ApiError } from '../../../services/api';
import PageState from '../../../components/common/PageState';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/Tabs';
import type { Project } from '../../../types';
import { buildReviewDraft, type AiSummaryExtended } from '../models/aiChatModel';
import { useAiChatState } from '../hooks/useAiChatState';
import { useCapabilityRunner } from '../hooks/useCapabilityRunner';
import { useChatSessions } from '../hooks/useChatSessions';
import { useJobReviewActions } from '../hooks/useJobReviewActions';
import ChatHistoryPanel from './agent/ChatHistoryPanel';
import AiChatPanel from './AiChatPanel';
import AiInvocationTimeline from './AiInvocationTimeline';
import AiMaskingAdmin from './AiMaskingAdmin';
import AiRuntimePanel from './AiRuntimePanel';
import AiSessionReplay from './AiSessionReplay';
import AiSidePanel from './AiSidePanel';
import AiUiDirectiveConsole from './AiUiDirectiveConsole';
import AiUsagePanel from './AiUsagePanel';
import { getSessionUser } from '../../../services/auth';

/**
 * AI workspace composition layer. Data flows live in dedicated hooks
 * (useAiChatState / useJobReviewActions / useCapabilityRunner) and api
 * modules; the runtime strip stays on top and the workspace below is split
 * into tabbed sections: capabilities (chat + capability tray + job review),
 * usage and governance. Pending ask-user/approval interactions moved to the
 * global agent sidebar.
 */
export default function AiView() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync<AiSummaryExtended>(fetchAiSummary, [], { cacheKey: 'ai:summary' });
  const projectsAsync = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const toast = useToast();
  const confirm = useConfirm();
  const chat = useAiChatState();
  const chatSessions = useChatSessions('project-management');

  // Entering the workspace right after a server restart can hit the 15s
  // request window and land on the error state; retry once automatically so
  // the page recovers instead of demanding a manual click.
  const autoRetried = useRef(false);
  useEffect(() => {
    if (!error || autoRetried.current) return;
    autoRetried.current = true;
    const timer = window.setTimeout(() => { reload(); }, 1200);
    return () => window.clearTimeout(timer);
  }, [error, reload]);
  // Persist the active conversation to the local history whenever it changes;
  // the message-id fingerprint skips redundant writes on unrelated re-renders.
  const lastSavedFingerprint = useRef('');
  useEffect(() => {
    if (!chat.messages.some((message) => message.role === 'user')) return;
    const fingerprint = chat.messages.map((message) => message.id).join('|');
    if (lastSavedFingerprint.current === fingerprint) return;
    lastSavedFingerprint.current = fingerprint;
    if (chatSessions.activeSessionId) {
      chatSessions.upsertSession(chatSessions.activeSessionId, chat.messages);
    } else {
      const id = chatSessions.createSession();
      chatSessions.upsertSession(id, chat.messages);
    }
  }, [chat.messages]);

  const jobReview = useJobReviewActions({ onSummaryChanged: reload });
  const runner = useCapabilityRunner({
    onInvocationQueued: (invocation) => (invocation.jobId ? jobReview.openJob(invocation.jobId) : undefined),
    onSummaryChanged: reload,
  });
  // Governance panels are admin-only (the server enforces it too; this is UX).
  const [isAdmin] = useState(() => getSessionUser()?.role === 'admin');

  const [connectionTesting, setConnectionTesting] = useState(false);
  const [connectionOnline, setConnectionOnline] = useState<boolean | null>(null);
  const [connectionLatencyMs, setConnectionLatencyMs] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const jobPolling = useAiJobPolling({
    job: jobReview.selectedJob,
    pollJob: fetchAiJob,
    onUpdate: jobReview.acceptPolledJob,
    onAwaitingReview: (latest) => {
      jobReview.setReviewDraft(buildReviewDraft(latest));
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

  function resetChat() {
    chat.resetChat();
    chatSessions.setActiveSessionId(null);
    runner.clearLatestInvocation();
  }

  /** Opens a persisted conversation into the workspace chat. */
  function handleEnterSession(id: string) {
    const session = chatSessions.getSession(id);
    if (!session) return;
    chat.loadMessages(session.messages);
    chatSessions.setActiveSessionId(id);
  }

  async function handleDeleteSession(id: string) {
    const confirmed = await confirm({
      title: t('features.ai.chatHistory.deleteConfirmTitle'),
      description: t('features.ai.chatHistory.deleteConfirmDesc'),
      confirmText: t('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    if (chatSessions.activeSessionId === id) {
      chat.resetChat();
      chatSessions.setActiveSessionId(null);
    }
    chatSessions.removeSession(id);
  }

  /** Starts a fresh conversation (the old one stays in the history list). */
  function handleNewChat() {
    chat.resetChat();
    chatSessions.setActiveSessionId(null);
  }

  function handleActionDone(result: { type: string; id: string; label: string }) {
    toast.success(t('features.ai.aiView.actionSuccess', { label: result.label, id: result.id }));
    chat.appendAssistantMessage(t('features.ai.aiView.actionConfirmed', { label: result.label, id: result.id }));
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

      <AiRuntimePanel />

      <Tabs defaultValue="capabilities" className="ai-view-tabs">
        <TabsList aria-label={t('features.ai.aiView.tabs.ariaLabel')}>
          <TabsTrigger value="capabilities">{t('features.ai.aiView.tabs.capabilities')}</TabsTrigger>
          <TabsTrigger value="usage">{t('features.ai.aiView.tabs.usage')}</TabsTrigger>
          <TabsTrigger value="governance">{t('features.ai.aiView.tabs.governance')}</TabsTrigger>
        </TabsList>

        {/* Capabilities: chat workspace with the capability tray, proposed
            action drafts and the AI job review side panel. */}
        <TabsContent value="capabilities" className="ai-view-tab-panel">
          <div className="ai-chat-layout">
            <AiChatPanel
              providerStatus={providerStatus}
              providerConfigured={Boolean(data.aiProvider?.configured && data.aiAssistant?.available)}
              messages={chat.messages}
              draft={chat.draft}
              setDraft={chat.setDraft}
              attachments={chat.attachments}
              setAttachments={chat.setAttachments}
              sending={chat.sending}
              fileError={chat.fileError}
              onFiles={chat.handleFiles}
              onSend={() => { void chat.handleSend(); }}
              projects={projectsAsync.data ?? []}
              onActionDone={handleActionDone}
            />

            <div className="ai-chat-history-column">
              <ChatHistoryPanel
                sessions={chatSessions.sessions}
                activeSessionId={chatSessions.activeSessionId}
                onEnter={handleEnterSession}
                onDelete={(id) => { void handleDeleteSession(id); }}
                onCreate={handleNewChat}
              />
            </div>
            <AiSidePanel
              data={data}
              connectionTesting={connectionTesting}
              connectionOnline={connectionOnline}
              connectionLatencyMs={connectionLatencyMs}
              connectionError={connectionError}
              onRefreshConnection={() => { void refreshConnection(); }}
              selectedJob={jobReview.selectedJob}
              reviewDraft={jobReview.reviewDraft}
              setReviewDraft={jobReview.setReviewDraft}
              jobLoading={jobReview.jobLoading}
              jobAction={jobReview.jobAction}
              pollingError={jobPolling.error}
              onOpenJob={jobReview.openJob}
              onConfirm={jobReview.confirmJob}
              onReject={jobReview.rejectJob}
              onRetry={jobReview.retryJob}
            />
          </div>

          {/* Pending ask-user/approval interactions are answered in the
              global agent sidebar (single mount point for every page). */}
          <div className="ai-interaction-moved-hint" role="note">
            <MessageCircleQuestion size={14} aria-hidden="true" />
            {t('features.ai.aiView.interactionsMovedToSidebar')}
          </div>
        </TabsContent>

        {/* Sprint 5.3 usage dashboard; shares the invocation project scope. */}
        <TabsContent value="usage" className="ai-view-tab-panel">
          <AiUsagePanel
            projects={projectsAsync.data ?? []}
            projectId={runner.invocationProjectId}
            onProjectChange={runner.setInvocationProjectId}
          />
        </TabsContent>

        {/* Governance (admin): masking rules, session replay and the UI
            directive test-fire console. Hidden for non-admins; the server
            rejects their requests anyway. */}
        <TabsContent value="governance" className="ai-view-tab-panel">
          {isAdmin ? (
            <div className="ai-view-governance-grid">
              <AiMaskingAdmin />
              <AiSessionReplay />
              <AiUiDirectiveConsole />
            </div>
          ) : (
            <div className="ai-view-governance" role="status">
              {t('features.ai.aiView.governance.adminOnly')}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {runner.timelineInvocationId ? (
        <AiInvocationTimeline
          invocationId={runner.timelineInvocationId}
          onClose={() => runner.setTimelineInvocationId(null)}
        />
      ) : null}
    </div>
  );
}
