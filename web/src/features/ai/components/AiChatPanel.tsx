import { useRef, type Dispatch, type SetStateAction } from 'react';
import { Bot, FileText, Image as ImageIcon, Paperclip, Send, X } from 'lucide-react';
import type { AiChatAttachment, AiChatMessage } from '../../../types';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import {
  attachmentReadState,
  formatSize,
  formatTime,
  messageSource,
} from '../aiChatModel';
import AiChatContent from './AiChatContent';

export default function AiChatPanel({
  providerStatus,
  providerConfigured,
  messages,
  draft,
  setDraft,
  attachments,
  setAttachments,
  sending,
  fileError,
  onFiles,
  onSend,
}: {
  providerStatus: string;
  providerConfigured?: boolean;
  messages: AiChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  attachments: AiChatAttachment[];
  setAttachments: Dispatch<SetStateAction<AiChatAttachment[]>>;
  sending: boolean;
  fileError: string | null;
  onFiles: (files: FileList | null) => void;
  onSend: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Panel
      className="ai-chat-panel"
      title="项目 AI 对话"
      subtitle={providerStatus}
      toolbar={<StatusBadge label={providerConfigured ? '真实模型' : '规则兜底'} status={providerConfigured ? 'success' : 'warning'} />}
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
              <div className="ai-chat-content"><AiChatContent content={message.content} /></div>
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
                onSend();
              }
            }}
            placeholder="直接输入问题，或上传截图、TXT/Markdown/PDF 等文档后提问。"
            disabled={sending}
          />
          <button className="btn btn-primary btn-sm" type="button" onClick={onSend} disabled={sending || (!draft.trim() && attachments.length === 0)}>
            <Send size={15} />
            发送
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
    </Panel>
  );
}
