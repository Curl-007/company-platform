import { describe, expect, it } from 'vitest';
import { KNOWN_PAGES } from '../../../app/pageRegistry';
import {
  DSH_LINK_PAGE_KEYS,
  parseDshDeclarativeView,
  parseDshSectionOrder,
  parseDshSurfaceStyle,
} from './declarativeViewModel';

describe('declarativeViewModel', () => {
  it('parses and rebuilds only the seven whitelisted block types', () => {
    const parsed = parseDshDeclarativeView({
      id: 'portfolio',
      title: 'Portfolio pulse',
      description: 'Today',
      blocks: [
        { type: 'stat', id: 'health', label: 'Health', value: 93, tone: 'positive' },
        { type: 'text', id: 'summary', title: 'Summary', text: 'On track' },
        { type: 'list', id: 'risks', items: ['Dependency'] },
        { type: 'table', id: 'projects', columns: [{ key: 'name', label: 'Project' }], rows: [{ name: 'Atlas' }] },
        { type: 'progress', id: 'delivery', label: 'Delivery', value: 72.5 },
        { type: 'notice', id: 'notice', text: 'Review due', tone: 'warning' },
        { type: 'links', id: 'links', items: [{ label: 'Projects', page: 'projects' }] },
      ],
    });

    expect(parsed?.surface).toBe('dsh-view:portfolio');
    expect(parsed?.blocks.map((block) => block.type)).toEqual([
      'stat', 'text', 'list', 'table', 'progress', 'notice', 'links',
    ]);
  });

  it('rejects executable/HTML blocks, unknown fields and arbitrary URLs', () => {
    const base = { id: 'unsafe', title: 'Unsafe' };
    expect(parseDshDeclarativeView({ ...base, blocks: [{ type: 'html', id: 'x', html: '<script />' }] })).toBeNull();
    expect(parseDshDeclarativeView({ ...base, blocks: [{ type: 'text', id: 'x', text: 'safe', html: '<b>unsafe</b>' }] })).toBeNull();
    expect(parseDshDeclarativeView({
      ...base,
      blocks: [{ type: 'links', id: 'x', items: [{ label: 'Outside', page: 'https://example.com' }] }],
    })).toBeNull();
    expect(parseDshDeclarativeView({
      ...base,
      blocks: [{ type: 'links', id: 'x', items: [{ label: 'Outside', page: 'projects', href: 'https://example.com' }] }],
    })).toBeNull();
  });

  it('keeps the internal link whitelist aligned with every navigable PageKey', () => {
    expect([...DSH_LINK_PAGE_KEYS].sort()).toEqual(KNOWN_PAGES.filter((page) => page !== 'login').sort());
  });

  it('enforces finite surface styles and duplicate-free section orders', () => {
    expect(parseDshSurfaceStyle({ variant: 'quiet', columns: 3, gap: 32 })).toEqual({ variant: 'quiet', columns: 3, gap: 32 });
    expect(parseDshSurfaceStyle({ variant: 'custom-css', columns: 3, gap: 32 })).toBeNull();
    expect(parseDshSurfaceStyle({ variant: 'default', columns: 4, gap: 32 })).toBeNull();
    expect(parseDshSurfaceStyle({ variant: 'default', columns: 2, gap: 33 })).toBeNull();
    expect(parseDshSectionOrder(['overview', 'delivery'])).toEqual(['overview', 'delivery']);
    expect(parseDshSectionOrder(['overview', 'overview'])).toBeNull();
  });
});
