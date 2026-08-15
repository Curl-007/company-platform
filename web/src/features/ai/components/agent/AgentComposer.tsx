import { useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Image as ImageIcon, Paperclip, Send, X } from 'lucide-react';
import type { AiChatAttachment } from '../../../../types';
import { formatSize } from '../../models/aiChatModel';

// ---------------------------------------------------------------------------
// Shared chat composer: draft textarea + attachments + send. The AI workspace
// panel and the global agent sidebar render the same control so e2e flows
// (placeholder / Enter-to-send / attachment chips) behave identically.
// ---------------------------------------------------------------------------

export default function AgentComposer({
  draft,
  setDraft,
  attachments,
  setAttachments,
  sending,
  fileError,
  onFiles,
  onSend,
  placeholder,
  compact = false,
  before,
}: {
  draft: string;
  setDraft: (value: string) => void;
  attachments: AiChatAttachment[];
  setAttachments: Dispatch<SetStateAction<AiChatAttachment[]>>;
  sending: boolean;
  fileError: string | null;
  onFiles: (files: FileList | null) => void;
  onSend: () => void;
  /** Defaults to the workspace placeholder so sidebar and page match. */
  placeholder?: string;
  compact?: boolean;
  /** Optional slot above the input row (the workspace mounts the capability tray here). */
  before?: ReactNode;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`ai-chat-composer${compact ? ' is-compact' : ''}`}>
      {before}
      {attachments.length > 0 && (
        <div className="ai-chat-pending-files">
          {attachments.map((item) => (
            <span key={item.name}>
              {item.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}
              {item.name}
              {!compact ? <small>{formatSize(item.size)}</small> : null}
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
              onSend();
            }
          }}
          placeholder={placeholder ?? t('features.ai.aiChatPanel.inputPlaceholder')}
          disabled={sending}
        />
        <button className="btn btn-primary btn-sm" type="button" onClick={onSend} disabled={sending || (!draft.trim() && attachments.length === 0)}>
          <Send size={15} />
          {t('features.ai.aiChatPanel.send')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.txt,.md,.json,.csv,.xml,.yaml,.yml,.log,.pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={(event) => {
            onFiles(event.target.files);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
      </div>
    </div>
  );
}
