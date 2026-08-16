import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Bot, X } from 'lucide-react';
import type { PageKey } from '../../../../types';
import { fetchProjects } from '../../../projects/api';
import { useAgentPageContext } from '../../agentPageContext';
import { useHarnessStatus } from '../../hooks/useHarnessStatus';
import { usePendingInteractions } from '../../hooks/usePendingInteractions';
import { useAiChatState } from '../../hooks/useAiChatState';
import AiInteractionCard from '../AiInteractionCard';
import AgentMessages from './AgentMessages';
import AgentComposer from './AgentComposer';

/**
 * Condensed dsh harness status chip for the sidebar header: runtime
 * active/idle dot, queue depth when non-zero, proxy liveness.
 */
function HarnessStatusChip() {
  const { t } = useTranslation();
  const statusQuery = useHarnessStatus();
  const runtime = statusQuery.data?.runtime;

  if (!runtime) {
    return (
      <span className="ai-sidebar-harness-chip is-unknown" role="status">
        <span className="ai-sidebar-harness-dot" aria-hidden="true" />
        {t('features.ai.agentSidebar.harnessUnknown')}
      </span>
    );
  }

  const chipTitle = [
    runtime.active ? t('features.ai.aiRuntimePanel.runtimeActive') : t('features.ai.aiRuntimePanel.runtimeIdle'),
    t('features.ai.aiRuntimePanel.queued', { count: runtime.queued }),
    runtime.proxy.started
      ? t('features.ai.aiRuntimePanel.proxyStarted')
      : t('features.ai.aiRuntimePanel.proxyStopped'),
  ].join(' · ');

  return (
    <span
      className={`ai-sidebar-harness-chip ${runtime.active ? 'is-active' : 'is-idle'}`}
      role="status"
      title={chipTitle}
    >
      <span className="ai-sidebar-harness-dot" aria-hidden="true" />
      {runtime.active ? t('features.ai.aiRuntimePanel.runtimeActive') : t('features.ai.aiRuntimePanel.runtimeIdle')}
      {runtime.queued > 0 ? ` · ${t('features.ai.aiRuntimePanel.queued', { count: runtime.queued })}` : ''}
      {` · ${runtime.proxy.started
        ? t('features.ai.aiRuntimePanel.proxyStarted')
        : t('features.ai.aiRuntimePanel.proxyStopped')}`}
    </span>
  );
}

/**
 * Global agent (dsh Copilot) sidebar: chat and pending interactions available
 * on every page. Manual capability controls stay hidden; the backend retains
 * approved-tool discovery, permission, scope, audit, and confirmation gates.
 */
export default function AgentSidebar({
  currentPage,
  contextLabel,
  onClose,
  className = '',
}: {
  currentPage: PageKey;
  contextLabel: string;
  onClose?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  const publishedContext = useAgentPageContext();
  // Navigation unmounts the old publisher first; matching the page key keeps
  // a stale project scope from leaking into the next page.
  const pageContext = publishedContext && publishedContext.page === currentPage ? publishedContext : null;
  const projectName = pageContext?.projectName ?? '';

  const chat = useAiChatState({
    scope: 'global-assistant',
    currentPage: () => `${currentPage}:${contextLabel}${projectName ? ` · ${projectName}` : ''}`,
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', 'list'],
    queryFn: () => fetchProjects(),
  });
  // Read-only pending count (Layout owns the toast variant of this query).
  const { pendingCount } = usePendingInteractions({ notify: false });

  return (
    <aside className={['ai-sidebar', 'agent-sidebar', pendingCount > 0 ? 'has-interactions' : '', className]
      .filter(Boolean)
      .join(' ')}
    >
      <div className="ai-sidebar-header">
        <div className="ai-sidebar-title">
          <Bot size={18} />
          <span>{t('features.ai.agentSidebar.title')}</span>
        </div>
        <HarnessStatusChip />
        {onClose && (
          <button className="topbar-icon-button" onClick={onClose} aria-label={t('common.closeAiAssistant')}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="ai-sidebar-context">
        <span>{t('features.ai.agentSidebar.contextPage', { page: contextLabel })}</span>
        {projectName ? (
          <span className="ai-sidebar-context-project">
            {t('features.ai.agentSidebar.contextProject', { name: projectName })}
          </span>
        ) : null}
      </div>

      {pendingCount > 0 ? (
        <div className="ai-sidebar-interactions">
          <AiInteractionCard />
        </div>
      ) : null}

      <div className="ai-sidebar-chat">
        <AgentMessages
          messages={chat.messages}
          sending={chat.sending}
          projects={projectsQuery.data ?? []}
          compact
        />
      </div>

      <div className="ai-sidebar-composer">
        <AgentComposer
          draft={chat.draft}
          setDraft={chat.setDraft}
          attachments={chat.attachments}
          setAttachments={chat.setAttachments}
          sending={chat.sending}
          fileError={chat.fileError}
          onFiles={(files) => { void chat.handleFiles(files); }}
          onSend={() => { void chat.handleSend(); }}
          compact
        />
      </div>
    </aside>
  );
}
