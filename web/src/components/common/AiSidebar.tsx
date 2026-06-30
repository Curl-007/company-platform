import { useRef, useState } from 'react';
import { Bot, FileText, Image as ImageIcon, Paperclip, Send, X } from 'lucide-react';
import { sendAiChat } from '../../services/resources';
import type { AiChatAttachment, AiChatMessage, PageKey } from '../../types';

interface AiSidebarProps {
  currentPage: PageKey;
  contextLabel: string;
  onClose?: () => void;
  className?: string;
}

const MAX_ATTACHMENTS = 4;

function nowIso() {
  return new Date().toISOString();
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
  const kind = file.type.startsWith('image/') ? 'image' : 'document';
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    kind,
    contentText: kind === 'document' && canReadText(file) ? (await file.text()).slice(0, 8000) : '',
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

function renderContent(content: string) {
  return content.split('\n').map((line, index) => {
    const text = line
      .replace(/\*\*/g, '')
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*]\s+/, '• ');
    return text.trim() ? <p key={`${index}-${text.slice(0, 12)}`}>{text}</p> : <br key={`br-${index}`} />;
  });
}

function AiSidebar({ currentPage, contextLabel, onClose, className = '' }: AiSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<AiChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'sidebar-welcome',
      role: 'assistant',
      content: `我会结合当前视图「${contextLabel}」和平台数据回答。可以直接提问，也可以附加截图或文档。`,
      createdAt: nowIso(),
      generatedBy: 'local',
    },
  ]);

  async function handleFiles(files: FileList | null) {
    setFileError(null);
    if (!files?.length) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length < files.length) setFileError(`最多附加 ${MAX_ATTACHMENTS} 个文件。`);

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
      id: `SIDEBAR-USER-${Date.now()}`,
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
        scope: 'global-assistant',
        currentPage: `${currentPage}:${contextLabel}`,
      });
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `SIDEBAR-ERR-${Date.now()}`,
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

  return (
    <aside className={`ai-sidebar ${className}`}>
      <div className="ai-sidebar-header">
        <div className="ai-sidebar-title">
          <Bot size={18} />
          <span>AI 助手</span>
        </div>
        {onClose && (
          <button className="topbar-icon-button" onClick={onClose} aria-label="关闭 AI 助手">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="ai-sidebar-context">当前视图：{contextLabel}</div>

      <div className="ai-sidebar-chat">
        {messages.map((message) => (
          <div key={message.id} className={`ai-sidebar-message ${message.role}`}>
            <div className="ai-sidebar-message-meta">
              <span>{message.role === 'assistant' ? 'AI' : '你'}</span>
              <span>{formatTime(message.createdAt)}</span>
              {message.modelUsed ? <span>{message.modelUsed}</span> : null}
              {message.fallback ? <span>兜底</span> : null}
            </div>
            <div className="ai-sidebar-message-body">{renderContent(message.content)}</div>
            {message.attachments?.length ? (
              <div className="ai-sidebar-files">
                {message.attachments.map((file) => (
                  <span key={`${message.id}-${file.name}`}>
                    {file.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
                    {file.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {sending ? (
          <div className="ai-sidebar-message assistant">
            <div className="ai-sidebar-message-meta"><span>AI</span></div>
            <div className="ai-sidebar-message-body"><p>正在结合当前页面和项目数据分析...</p></div>
          </div>
        ) : null}
      </div>

      <div className="ai-sidebar-composer">
        {attachments.length > 0 ? (
          <div className="ai-sidebar-files pending">
            {attachments.map((file) => (
              <span key={file.name}>
                {file.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
                {file.name}
                <button type="button" onClick={() => setAttachments((prev) => prev.filter((item) => item !== file))}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {fileError ? <div className="form-error">{fileError}</div> : null}
        <div className="ai-sidebar-input-row">
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => fileInputRef.current?.click()} disabled={sending}>
            <Paperclip size={14} />
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
            placeholder="问当前页面的问题..."
            disabled={sending}
          />
          <button className="btn btn-primary btn-sm" type="button" onClick={handleSend} disabled={sending || (!draft.trim() && attachments.length === 0)}>
            <Send size={14} />
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
    </aside>
  );
}

export default AiSidebar;
