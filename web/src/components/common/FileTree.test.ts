import { describe, expect, it } from 'vitest';
import {
  resolveFileTreeNavigationAction,
  type FileTreeNavigationNode,
} from './FileTree';

const visibleItems: FileTreeNavigationNode[] = [
  { path: 'src', type: 'dir', parentPath: null, expanded: true },
  { path: 'src/app.ts', type: 'file', parentPath: 'src', expanded: false },
  { path: 'src/components', type: 'dir', parentPath: 'src', expanded: false },
  { path: 'README.md', type: 'file', parentPath: null, expanded: false },
];

describe('FileTree keyboard navigation', () => {
  it('moves through the flattened visible order and supports Home/End', () => {
    expect(resolveFileTreeNavigationAction(visibleItems, 'src/app.ts', 'ArrowDown'))
      .toEqual({ type: 'focus', path: 'src/components' });
    expect(resolveFileTreeNavigationAction(visibleItems, 'src/app.ts', 'ArrowUp'))
      .toEqual({ type: 'focus', path: 'src' });
    expect(resolveFileTreeNavigationAction(visibleItems, 'src/app.ts', 'Home'))
      .toEqual({ type: 'focus', path: 'src' });
    expect(resolveFileTreeNavigationAction(visibleItems, 'src/app.ts', 'End'))
      .toEqual({ type: 'focus', path: 'README.md' });
  });

  it('uses right and left arrows for parent/child expansion navigation', () => {
    expect(resolveFileTreeNavigationAction(visibleItems, 'src', 'ArrowRight'))
      .toEqual({ type: 'focus', path: 'src/app.ts' });
    expect(resolveFileTreeNavigationAction(visibleItems, 'src/components', 'ArrowRight'))
      .toEqual({ type: 'expand', path: 'src/components' });
    expect(resolveFileTreeNavigationAction(visibleItems, 'src', 'ArrowLeft'))
      .toEqual({ type: 'collapse', path: 'src' });
    expect(resolveFileTreeNavigationAction(visibleItems, 'src/app.ts', 'ArrowLeft'))
      .toEqual({ type: 'focus', path: 'src' });
  });

  it('activates the current item with Enter and stops at list boundaries', () => {
    expect(resolveFileTreeNavigationAction(visibleItems, 'README.md', 'Enter'))
      .toEqual({ type: 'activate', path: 'README.md' });
    expect(resolveFileTreeNavigationAction(visibleItems, 'src', 'ArrowUp')).toBeNull();
    expect(resolveFileTreeNavigationAction(visibleItems, 'README.md', 'ArrowDown')).toBeNull();
  });
});
