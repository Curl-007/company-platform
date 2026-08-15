import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiChatAttachment, AiChatMessage } from '../../../types';
import { sendAiChat } from '../api/chat';
import {
  MAX_ATTACHMENTS,
  createWelcomeMessage,
  fileToAttachment,
  nowIso,
  validateAttachmentFiles,
} from '../models/aiChatModel';

// ---------------------------------------------------------------------------
// useAiChatState: chat workspace state machine extracted from AiView.
//
// Owns the message list, draft, attachments, sending/file-error flags and the
// send/attach/reset flows so AiView stays a pure composition layer.
// ---------------------------------------------------------------------------

export interface UseAiChatStateOptions {
  /** Chat scope sent to the BFF (AiView uses 'project-management'). */
  scope?: string;
  /** Resolved current page context sent with each message. */
  currentPage?: () => string;
}

export interface AiChatState {
  messages: AiChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  attachments: AiChatAttachment[];
  setAttachments: Dispatch<SetStateAction<AiChatAttachment[]>>;
  sending: boolean;
  fileError: string | null;
  handleFiles: (files: FileList | null) => Promise<void>;
  handleSend: () => Promise<void>;
  resetChat: () => void;
  /** Replaces the whole conversation (entering a persisted chat session). */
  loadMessages: (messages: AiChatMessage[]) => void;
  /** Appends an assistant-side system notice (e.g. after an action executes). */
  appendAssistantMessage: (content: string, generatedBy?: AiChatMessage['generatedBy']) => void;
}

export function useAiChatState({
  scope = 'project-management',
  currentPage = () => window.location.hash || '/ai',
}: UseAiChatStateOptions = {}): AiChatState {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AiChatMessage[]>([
    createWelcomeMessage(t('features.ai.aiView.welcomeMessage')),
  ]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<AiChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

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
        scope,
        currentPage: currentPage(),
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
  }

  function loadMessages(messages: AiChatMessage[]) {
    setMessages(Array.isArray(messages) && messages.length ? messages : [
      createWelcomeMessage(t('features.ai.aiView.welcomeMessage'), `welcome-${Date.now()}`),
    ]);
    setAttachments([]);
    setDraft('');
    setFileError(null);
  }

  function appendAssistantMessage(content: string, generatedBy: AiChatMessage['generatedBy'] = 'system') {
    setMessages((prev) => [
      ...prev,
      {
        id: `SYS-${Date.now()}`,
        role: 'assistant',
        content,
        createdAt: nowIso(),
        generatedBy,
      },
    ]);
  }

  return {
    messages,
    draft,
    setDraft,
    attachments,
    setAttachments,
    sending,
    fileError,
    handleFiles,
    handleSend,
    resetChat,
    loadMessages,
    appendAssistantMessage,
  };
}
