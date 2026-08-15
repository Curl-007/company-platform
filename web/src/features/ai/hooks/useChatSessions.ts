import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiChatMessage } from '../../../types';

// ---------------------------------------------------------------------------
// useChatSessions: local chat-session persistence for the AI workspace.
//
// Chat is stateless on the BFF (POST /api/ai/chat returns one reply), so the
// conversation history lives in localStorage, bucketed by chat scope
// ('project-management' for the AI workspace, 'global-assistant' for the
// sidebar). A session records its messages plus a title derived from the
// first user message. Bounds: SESSION_LIMIT sessions per bucket, each kept
// whole; when storage is full the oldest sessions are dropped first.
// ---------------------------------------------------------------------------

const STORAGE_VERSION = 'v1';
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

function storageKey(scope: string): string {
  return `ai-chat-sessions:${STORAGE_VERSION}:${scope}`;
}

function readSessions(scope: string, storage: Storage | null): ChatSession[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey(scope));
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

function writeSessions(scope: string, sessions: ChatSession[], storage: Storage | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(storageKey(scope), JSON.stringify(sessions.slice(0, SESSION_LIMIT)));
    return true;
  } catch {
    return false;
  }
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
    storage = typeof window !== 'undefined' ? window.localStorage : null,
  }: { titleFallback?: string; storage?: Storage | null } = {},
): ChatSessionsState {
  const [sessions, setSessions] = useState<ChatSession[]>(() => readSessions(scope, storage));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const fallbackRef = useRef(titleFallback);
  fallbackRef.current = titleFallback;

  // Persist after every change; drop the oldest sessions when the bucket is
  // full or the storage quota rejects the write.
  useEffect(() => {
    const next = sessions.slice(0, SESSION_LIMIT);
    if (!writeSessions(scopeRef.current, next, storageRef.current) && next.length > 0) {
      writeSessions(scopeRef.current, next.slice(0, Math.max(0, next.length - 1)), storageRef.current);
    }
  }, [sessions]);

  const createSession = useCallback((): string => {
    const id = newSessionId();
    const now = new Date().toISOString();
    setSessions((current) => [
      { id, title: fallbackRef.current, messages: [], createdAt: now, updatedAt: now },
      ...current,
    ].slice(0, SESSION_LIMIT));
    setActiveSessionId(id);
    return id;
  }, []);

  const getSession = useCallback((id: string) => {
    return sessions.find((session) => session.id === id) ?? null;
  }, [sessions]);

  const upsertSession = useCallback((id: string, messages: AiChatMessage[]): ChatSession | null => {
    const now = new Date().toISOString();
    const existing = sessions.find((session) => session.id === id);
    const updated: ChatSession = {
      id,
      title: sessionTitleOf(messages, fallbackRef.current),
      messages,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    setSessions((current) => {
      if (current.some((session) => session.id === id)) {
        return current.map((session) => (session.id === id ? updated : session));
      }
      return [updated, ...current].slice(0, SESSION_LIMIT);
    });
    return updated;
  }, [sessions]);

  const removeSession = useCallback((id: string) => {
    setSessions((current) => current.filter((session) => session.id !== id));
    setActiveSessionId((active) => (active === id ? null : active));
  }, []);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    upsertSession,
    getSession,
    removeSession,
  };
}
