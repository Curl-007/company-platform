import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { renderWithQueryClient } from '../../../test/renderWithQuery';
import type { SessionUser } from '../../../types';
import type { DshDeclarativeView } from '../models/declarativeViewModel';
import DshDeclarativeViewRenderer from './DshDeclarativeViewRenderer';

const user: SessionUser = {
  id: 'user-a',
  name: 'User A',
  email: 'a@example.com',
  role: 'dev',
  capabilities: {
    role: 'dev',
    pages: ['projects'],
    operations: [],
    permissions: [],
  },
};

function renderView(view: DshDeclarativeView) {
  return renderWithQueryClient(
    <MemoryRouter><DshDeclarativeViewRenderer view={view} user={user} /></MemoryRouter>,
  );
}

describe('DshDeclarativeViewRenderer', () => {
  it('renders every DSL block as React text and never creates injected markup', () => {
    const markup = '<script>window.injected=true</script><img src=x onerror=alert(1)>';
    const view: DshDeclarativeView = {
      id: 'all-blocks',
      title: 'All blocks',
      surface: 'dsh-view:all-blocks',
      blocks: [
        { type: 'stat', id: 'stat', label: 'Health', value: 88 },
        { type: 'text', id: 'text', title: 'Literal text', text: markup },
        { type: 'list', id: 'list', items: ['One', 'Two'] },
        { type: 'table', id: 'table', columns: [{ key: 'name', label: 'Name' }], rows: [{ name: 'Atlas' }] },
        { type: 'progress', id: 'progress', label: 'Delivery', value: 64 },
        { type: 'notice', id: 'notice', text: 'Review due', tone: 'warning' },
        { type: 'links', id: 'links', items: [{ label: 'Open projects', page: 'projects' }, { label: 'Settings', page: 'settings' }] },
      ],
    };

    const { container, unmount } = renderView(view);
    expect(container.querySelectorAll('[data-dsh-block-type]')).toHaveLength(7);
    expect(container.querySelector('.dsh-ui-text')?.textContent).toBe(markup);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('64');
    expect(container.querySelector('a[href="/projects"]')?.textContent).toContain('Open projects');
    expect(container.textContent).not.toContain('Settings');
    unmount();
  });
});
