import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiChatMessage } from '../../../types';

// ---------------------------------------------------------------------------
// useChatSessions: local chat-session persistence for the AI workspace.
//
// Chat is stateless on the BFF (POST /api/ai/chat returns one reply), so the
// conversation history lives in localStorage, bucketed by authenticated user
// and chat scope ('project-management' for the AI workspace,
// 'global-assistant' for the sidebar). A session records its messages plus a
// title derived from the first user message. Bounds: SESSION_LIMIT sessions
// per bucket, each kept whole; when storage is full the oldest sessions are
// dropped first.
// ---------------------------------------------------------------------------

const STORAGE_VERSION = 'v2';
const SESSION_LIMIT = 20;
const TITLE_MAX_LENGTH = 30;

export interface ChatSession {
  id: string;
  title: string;
  messages: AiChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionsState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  /** Creates a fresh session (no messages yet) and activates it. */
  createSession: () => string;
  /** Replaces the messages of an existing session; returns the saved session. */
  upsertSession: (id: string, messages: AiChatMessage[]) => ChatSession | null;
  getSession: (id: string) => ChatSession | null;
  removeSession: (id: string) => void;
}

interface LoadedChatSessionsState {
  key: string | null;
  storage: Storage | null;
  sessions: ChatSession[];
  activeSessionId: string | null;
}

function storageKey(scope: string, userId: string | null | undefined): string | null {
  const normalizedScope = String(scope ?? '').trim();
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedScope || !normalizedUserId) return null;
  return `ai-chat-sessions:${STORAGE_VERSION}:${encodeURIComponent(normalizedUserId)}:${encodeURIComponent(normalizedScope)}`;
}

function readSessions(key: string | null, storage: Storage | null): ChatSession[] {
  if (!key || !storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatSession).slice(0, SESSION_LIMIT);
  } catch {
    return [];
  }
}

function isChatSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string'
    && typeof record.title === 'string'
    && Array.isArray(record.messages)
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string';
}

function writeSessions(key: string | null, sessions: ChatSession[], storage: Storage | null): boolean {
  if (!key || !storage) return false;
  try {
    storage.setItem(key, JSON.stringify(sessions.slice(0, SESSION_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

function loadState(key: string | null, storage: Storage | null): LoadedChatSessionsState {
  return {
    key,
    storage,
    sessions: readSessions(key, storage),
    activeSessionId: null,
  };
}

function isCurrentState(state: LoadedChatSessionsState, key: string | null, storage: Storage | null): boolean {
  return state.key === key && state.storage === storage;
}

/** First user message text becomes the list title; empty chats fall back to a generic label. */
export function sessionTitleOf(messages: AiChatMessage[], fallback: string): string {
  const firstUser = messages.find((message) => message.role === 'user');
  const source = firstUser?.content?.trim();
  if (!source) return fallback;
  const collapsed = source.replace(/\s+/g, ' ');
  return collapsed.length > TITLE_MAX_LENGTH ? `${collapsed.slice(0, TITLE_MAX_LENGTH)}…` : collapsed;
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `SESS-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function useChatSessions(
  scope: string,
  {
    titleFallback = '新对话',
    userId = null,
    storage = typeof window !== 'undefined' ? window.localStorage : null,
  }: { titleFallback?: string; userId?: string | null; storage?: Storage | null } = {},
): ChatSessionsState {
  const key = storageKey(scope, userId);
  const [state, setState] = useState<LoadedChatSessionsState>(() => loadState(key, storage));
  const stateCurrent = isCurrentState(state, key, storage);
  // Do not render the previous account's in-memory state while the effect
  // schedules the actual state reset after a login/account switch.
  const visibleState = stateCurrent ? state : loadState(key, storage);
  const fallbackRef = useRef(titleFallback);
  fallbackRef.current = titleFallback;

  useEffect(() => {
    if (stateCurrent) return;
    setState((previous) => (isCurrentState(previous, key, storage) ? previous : loadState(key, storage)));
  }, [key, stateCurrent, storage]);

  // Persist after every change; drop the oldest sessions when the bucket is
  // full or the storage quota rejects the write.
  useEffect(() => {
    if (!stateCurrent || !state.key || !state.storage) return;
    const next = state.sessions.slice(0, SESSION_LIMIT);
    if (!writeSessions(state.key, next, state.storage) && next.length > 0) {
      writeSessions(state.key, next.slice(0, Math.max(0, next.length - 1)), state.storage);
    }
  }, [state, stateCurrent]);

  const createSession = useCallback((): string => {
    const id = newSessionId();
    const now = new Date().toISOString();
    setState((previous) => {
      const current = isCurrentState(previous, key, storage) ? previous : loadState(key, storage);
      return {
        ...current,
        sessions: [
          { id, title: fallbackRef.current, messages: [], createdAt: now, updatedAt: now },
          ...current.sessions,
        ].slice(0, SESSION_LIMIT),
        activeSessionId: id,
      };
    });
    return id;
  }, [key, storage]);

  const setActiveSessionId = useCallback((id: string | null) => {
    setState((previous) => {
      const current = isCurrentState(previous, key, storage) ? previous : loadState(key, storage);
      return { ...current, activeSessionId: id };
    });
  }, [key, storage]);

  const getSession = useCallback((id: string) => {
    return visibleState.sessions.find((session) => session.id === id) ?? null;
  }, [visibleState.sessions]);

  const upsertSession = useCallback((id: string, messages: AiChatMessage[]): ChatSession | null => {
    const now = new Date().toISOString();
    const existing = visibleState.sessions.find((session) => session.id === id);
    const updated: ChatSession = {
      id,
      title: sessionTitleOf(messages, fallbackRef.current),
      messages,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    setState((previous) => {
      const current = isCurrentState(previous, key, storage) ? previous : loadState(key, storage);
      const persisted = current.sessions.find((session) => session.id === id);
      const next = {
        ...updated,
        createdAt: persisted?.createdAt ?? updated.createdAt,
      };
      return {
        ...current,
        sessions: current.sessions.some((session) => session.id === id)
          ? current.sessions.map((session) => (session.id === id ? next : session))
          : [next, ...current.sessions].slice(0, SESSION_LIMIT),
      };
    });
    return updated;
  }, [key, storage, visibleState.sessions]);

  const removeSession = useCallback((id: string) => {
    setState((previous) => {
      const current = isCurrentState(previous, key, storage) ? previous : loadState(key, storage);
      return {
        ...current,
        sessions: current.sessions.filter((session) => session.id !== id),
        activeSessionId: current.activeSessionId === id ? null : current.activeSessionId,
      };
    });
  }, [key, storage]);

  return {
    sessions: visibleState.sessions,
    activeSessionId: visibleState.activeSessionId,
    setActiveSessionId,
    createSession,
    upsertSession,
    getSession,
    removeSession,
  };
}
