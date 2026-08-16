import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
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

function Driver({ scope = 'project-management', userId = 'USR-1' }: { scope?: string; userId?: string | null }) {
  api = useChatSessions(scope, { storage, userId });
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
  it('creates, activates and persists a session under the user and scope bucket', async () => {
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
    expect(values.has('ai-chat-sessions:v2:USR-1:project-management')).toBe(true);

    unmount();
  });

  it('restores persisted sessions on mount for the same user and scope', async () => {
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
    expect(values.has('ai-chat-sessions:v2:USR-1:project-management')).toBe(false);
    expect(values.has('ai-chat-sessions:v2:USR-1:global-assistant')).toBe(true);
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
    expect(JSON.parse(values.get('ai-chat-sessions:v2:USR-1:project-management') ?? '[]')).toEqual([]);

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

  it('keeps account buckets isolated and never exposes the previous account after a switch', async () => {
    const userAKey = 'ai-chat-sessions:v2:USR-A:project-management';
    const userBKey = 'ai-chat-sessions:v2:USR-B:project-management';
    values.set(userBKey, JSON.stringify([{
      id: 'B-1',
      title: '乙账号历史',
      messages: [userMessage('B-MSG', '乙账号的会话')],
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    }]));

    const rendered = renderWithQueryClient(<Driver userId="USR-A" />);
    await flushAct();
    let userASessionId = '';
    await act(async () => { userASessionId = api!.createSession(); });
    await flushAct();
    await act(async () => { api!.upsertSession(userASessionId, [userMessage('A-MSG', '甲账号的会话')]); });
    await flushAct();

    act(() => {
      rendered.root.render(
        <QueryClientProvider client={rendered.queryClient}>
          <Driver userId="USR-B" />
        </QueryClientProvider>,
      );
    });

    expect(api!.sessions.map((session) => session.title)).toEqual(['乙账号历史']);
    expect(api!.activeSessionId).toBeNull();
    expect(JSON.parse(values.get(userAKey) ?? '[]')).toMatchObject([{ title: '甲账号的会话' }]);

    let userBSessionId = '';
    await act(async () => { userBSessionId = api!.createSession(); });
    await flushAct();
    await act(async () => { api!.upsertSession(userBSessionId, [userMessage('B-MSG-2', '乙账号的新会话')]); });
    await flushAct();

    expect(JSON.parse(values.get(userAKey) ?? '[]')).toMatchObject([{ title: '甲账号的会话' }]);
    expect(JSON.parse(values.get(userBKey) ?? '[]')).toHaveLength(2);
    rendered.unmount();
  });

  it('derives the session title from the first user message', () => {
    expect(sessionTitleOf([userMessage('a', '  新建一个需求   ')], '新对话')).toBe('新建一个需求');
    expect(sessionTitleOf([userMessage('a', 'x'.repeat(40))], '新对话')).toHaveLength(31);
    expect(sessionTitleOf([], '新对话')).toBe('新对话');
    expect(sessionTitleOf([{ id: 'b', role: 'assistant', content: 'hi', createdAt: 'x' }], '新对话')).toBe('新对话');
  });
});
