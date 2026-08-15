import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, FileText, Image as ImageIcon } from 'lucide-react';
import type { AiChatMessage, Project } from '../../../../types';
import StatusBadge from '../../../../components/common/StatusBadge';
import {
  attachmentReadState,
  formatSize,
  formatTime,
  messageSource,
} from '../../models/aiChatModel';
import AiChatContent from '../AiChatContent';
import AiActionDraftCard from '../AiActionDraftCard';

// ---------------------------------------------------------------------------
// Shared agent message list: one rendering for the AI workspace chat panel
// and the global agent sidebar. Message rows carry source badges, model
// hints, attachments and proposed-action draft cards; the sidebar just adds
// the `is-compact` container class for narrower bubbles.
// ---------------------------------------------------------------------------

export default function AgentMessages({
  messages,
  sending,
  projects = [],
  onActionDone,
  compact = false,
}: {
  messages: AiChatMessage[];
  sending: boolean;
  /** Project choices for proposed-action draft forms. */
  projects?: Project[];
  onActionDone?: (result: { type: string; id: string; label: string }) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view: the list scrolls to the bottom when a
  // message arrives or the sending indicator appears.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  return (
    <div ref={scrollRef} className={`ai-chat-messages${compact ? ' is-compact' : ''}`}>
      {messages.map((message) => (
        <div key={message.id} className={`ai-chat-message ${message.role}`}>
          <div className="ai-chat-avatar">
            {message.role === 'assistant' ? <Bot size={16} /> : t('features.ai.aiChatPanel.me')}
          </div>
          <div className="ai-chat-bubble">
            <div className="ai-chat-meta">
              <span>{message.role === 'assistant' ? t('common.aiAssistant') : t('common.you')}</span>
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
            <div className="ai-chat-content"><AiChatContent content={message.content} /></div>
            {message.attachments?.length ? (
              <div className="ai-chat-attachments">
                {message.attachments.map((item) => (
                  <span key={`${message.id}-${item.name}`}>
                    {item.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}
                    {item.name}
                    {!compact ? <small>{formatSize(item.size)}</small> : null}
                    <small>{attachmentReadState(item, message.role)}</small>
                  </span>
                ))}
              </div>
            ) : null}
            {message.role === 'assistant' && message.proposedActions?.length ? (
              <div className="ai-chat-actions">
                {message.proposedActions.map((action, index) => (
                  <AiActionDraftCard
                    key={`${message.id}-act-${index}-${action.type}-${action.resourceId || action.title || index}`}
                    action={action}
                    projects={projects}
                    onDone={onActionDone}
                  />
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
            <div className="ai-chat-meta"><span>{t('common.aiAssistant')}</span></div>
            <div className="ai-chat-content"><p>{t('features.ai.aiChatPanel.analyzingHint')}</p></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
