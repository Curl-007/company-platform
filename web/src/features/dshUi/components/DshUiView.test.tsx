import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithQueryClient } from '../../../test/renderWithQuery';
import { createMemoryStorage } from '../../../test/memoryStorage';
import type { SessionUser } from '../../../types';
import { openDshView, upsertDshView } from '../store/dshUiStore';
import DshUiView from './DshUiView';

const user: SessionUser = {
  id: 'user-a',
  name: 'User A',
  email: 'a@example.com',
  role: 'qa',
};

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
});

describe('DshUiView', () => {
  it('restores the saved dynamic view selection after a fresh mount', () => {
    upsertDshView(user.id, {
      id: 'delivery',
      title: 'Delivery',
      surface: 'dsh-view:delivery',
      blocks: [{ type: 'text', id: 'body', text: 'Delivery content' }],
    });
    upsertDshView(user.id, {
      id: 'risks',
      title: 'Risks',
      surface: 'dsh-view:risks',
      blocks: [{ type: 'notice', id: 'body', text: 'Risk content' }],
    });
    openDshView(user.id, 'risks');

    const { container, unmount } = renderWithQueryClient(<DshUiView user={user} />);
    expect(container.querySelector<HTMLSelectElement>('#dsh-ui-view-select')?.value).toBe('risks');
    expect(container.textContent).toContain('Risk content');
    unmount();
  });

  it('reacts to same-tab view updates from DSH commands', () => {
    const { container, unmount } = renderWithQueryClient(<DshUiView user={user} />);
    expect(container.textContent).toContain('暂无 DSH 声明式视图');

    act(() => {
      upsertDshView(user.id, {
        id: 'pulse',
        title: 'Pulse',
        surface: 'dsh-view:pulse',
        blocks: [{ type: 'stat', id: 'health', label: 'Health', value: 96 }],
      });
    });

    expect(container.textContent).toContain('Pulse');
    expect(container.textContent).toContain('96');
    unmount();
  });
});
