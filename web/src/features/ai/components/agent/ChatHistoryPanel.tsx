import { useTranslation } from 'react-i18next';
import { History, MessageSquarePlus, Trash2 } from 'lucide-react';
import Panel from '../../../../components/common/Panel';
import type { ChatSession } from '../../hooks/useChatSessions';

function relativeTime(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * Chat history list for the AI workspace side column: enter a previous
 * conversation (loads its messages) or delete it. The active session is
 * highlighted; a delete on the active session starts a fresh chat.
 */
export default function ChatHistoryPanel({
  sessions,
  activeSessionId,
  onEnter,
  onDelete,
  onCreate,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onEnter: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Panel
      className="ai-chat-history"
      title={t('features.ai.chatHistory.title')}
      toolbar={(
        <button
          type="button"
          className="topbar-icon-button"
          onClick={onCreate}
          aria-label={t('features.ai.chatHistory.newChat')}
          title={t('features.ai.chatHistory.newChat')}
        >
          <MessageSquarePlus size={15} />
        </button>
      )}
    >
      {sessions.length === 0 ? (
        <div className="ai-chat-history-empty" role="status">
          <History size={14} aria-hidden="true" />
          <span>{t('features.ai.chatHistory.empty')}</span>
        </div>
      ) : (
        <ul className="ai-chat-history-list">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <li key={session.id} className={active ? 'is-active' : ''}>
                <button
                  type="button"
                  className="ai-chat-history-item"
                  onClick={() => onEnter(session.id)}
                  aria-pressed={active}
                  title={session.title}
                >
                  <span className="ai-chat-history-item-title">{session.title}</span>
                  <span className="ai-chat-history-item-time">{relativeTime(session.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  className="icon-button ai-chat-history-delete"
                  onClick={() => onDelete(session.id)}
                  aria-label={t('features.ai.chatHistory.delete', { title: session.title })}
                  title={t('features.ai.chatHistory.delete', { title: session.title })}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
