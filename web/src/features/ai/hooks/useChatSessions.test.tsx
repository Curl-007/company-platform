import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { useChatSessions, sessionTitleOf } from './useChatSessions';
import { flushAct, renderWithQueryClient } from '../../../test/renderWithQuery';
import type { AiChatMessage } from '../../../types';

function userMessage(id: string, content: string): AiChatMessage {
  return { id, role: 'user', content, createdAt: '2026-08-15T00:00:00.000Z' };
}

let values = new Map<string, string>();
let storage: Storage | null = null;

function createMemoryStorage(): Storage {
  values = new Map();
  return {
    get length() { return values.size; },
    clear: vi.fn(() => { values.clear(); }),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  } as unknown as Storage;
}

let api: ReturnType<typeof useChatSessions> | null = null;

function Driver({ scope = 'project-management' }: { scope?: string }) {
  api = useChatSessions(scope, { storage });
  return <div data-testid="state">{JSON.stringify({
    active: api.activeSessionId,
    ids: api.sessions.map((s) => s.id),
    titles: api.sessions.map((s) => s.title),
    counts: api.sessions.map((s) => s.messages.length),
  })}</div>;
}

beforeEach(() => {
  storage = createMemoryStorage();
  api = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  storage = null;
  api = null;
});

describe('useChatSessions', () => {
  it('creates, activates and persists a session under the scope bucket', async () => {
    const { unmount } = renderWithQueryClient(<Driver />);
    await flushAct();

    let id = '';
    await act(async () => { id = api!.createSession(); });
    await flushAct();
    await act(async () => { api!.upsertSession(id, [userMessage('U1', '帮我看看这个项目的需求')]); });
    await flushAct();

    expect(api!.activeSessionId).toBe(id);
    expect(api!.sessions[0]?.title).toBe('帮我看看这个项目的需求');
    expect(api!.sessions[0]?.messages).toHaveLength(1);
    expect(values.has('ai-chat-sessions:v1:project-management')).toBe(true);

    unmount();
  });

  it('restores persisted sessions on mount from the same scope', async () => {
    const { unmount: first } = renderWithQueryClient(<Driver />);
    await flushAct();
    let id = '';
    await act(async () => { id = api!.createSession(); });
    await flushAct();
    await act(async () => { api!.upsertSession(id, [userMessage('U1', '历史对话标题')]); });
    await flushAct();
    first();

    // A fresh mount reads the same bucket back.
    const { unmount } = renderWithQueryClient(<Driver />);
    await flushAct();
    expect(api!.sessions).toHaveLength(1);
    expect(api!.sessions[0]?.title).toBe('历史对话标题');
    unmount();
  });

  it('keeps scopes isolated', async () => {
    const { unmount } = renderWithQueryClient(<Driver scope="global-assistant" />);
    await flushAct();
    let id = '';
    await act(async () => { id = api!.createSession(); });
    await flushAct();
    await act(async () => { api!.upsertSession(id, [userMessage('U1', '侧栏对话')]); });
    await flushAct();
    expect(values.has('ai-chat-sessions:v1:project-management')).toBe(false);
    unmount();
  });

  it('removing the active session clears the active id and the bucket entry', async () => {
    const { unmount } = renderWithQueryClient(<Driver />);
    await flushAct();
    let id = '';
    await act(async () => { id = api!.createSession(); });
    await flushAct();
    expect(api!.activeSessionId).toBe(id);

    await act(async () => { api!.removeSession(id); });
    await flushAct();
    expect(api!.activeSessionId).toBeNull();
    expect(api!.sessions).toHaveLength(0);
    expect(JSON.parse(values.get('ai-chat-sessions:v1:project-management') ?? '[]')).toEqual([]);

    unmount();
  });

  it('caps the bucket at the session limit, dropping the oldest first', async () => {
    const { unmount } = renderWithQueryClient(<Driver />);
    await flushAct();

    for (let index = 0; index < 25; index += 1) {
      let id = '';
      await act(async () => { id = api!.createSession(); });
      await flushAct();
      await act(async () => { api!.upsertSession(id, [userMessage(`U-${index}`, `会话 ${index}`)]); });
      await flushAct();
    }
    expect(api!.sessions).toHaveLength(20);
    expect(api!.sessions.some((s) => s.title === '会话 0')).toBe(false);
    expect(api!.sessions.some((s) => s.title === '会话 24')).toBe(true);

    unmount();
  });

  it('derives the session title from the first user message', () => {
    expect(sessionTitleOf([userMessage('a', '  新建一个需求   ')], '新对话')).toBe('新建一个需求');
    expect(sessionTitleOf([userMessage('a', 'x'.repeat(40))], '新对话')).toHaveLength(31);
    expect(sessionTitleOf([], '新对话')).toBe('新对话');
    expect(sessionTitleOf([{ id: 'b', role: 'assistant', content: 'hi', createdAt: 'x' }], '新对话')).toBe('新对话');
  });
});
