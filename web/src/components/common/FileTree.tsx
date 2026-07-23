import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react';
import type { FileTreeNode } from '../../types';

interface FileTreeProps {
  items: FileTreeNode[];
  onFileSelect: (path: string) => void;
  onExpandDir?: (path: string) => Promise<FileTreeNode[]> | void;
  selectedPath?: string;
  className?: string;
  loadingPaths?: Set<string>;
}

interface VisibleFileTreeNode {
  node: FileTreeNode;
  depth: number;
  parentPath: string | null;
  position: number;
  setSize: number;
}

export interface FileTreeNavigationNode {
  path: string;
  type: FileTreeNode['type'];
  parentPath: string | null;
  expanded: boolean;
}

export type FileTreeNavigationAction =
  | { type: 'focus'; path: string }
  | { type: 'expand'; path: string }
  | { type: 'collapse'; path: string }
  | { type: 'activate'; path: string }
  | null;

export function resolveFileTreeNavigationAction(
  items: readonly FileTreeNavigationNode[],
  currentPath: string,
  key: string,
): FileTreeNavigationAction {
  const index = items.findIndex((item) => item.path === currentPath);
  if (index === -1) return null;
  const current = items[index];

  if (key === 'ArrowUp') return index > 0 ? { type: 'focus', path: items[index - 1].path } : null;
  if (key === 'ArrowDown') return index < items.length - 1 ? { type: 'focus', path: items[index + 1].path } : null;
  if (key === 'Home') return items.length > 0 ? { type: 'focus', path: items[0].path } : null;
  if (key === 'End') return items.length > 0 ? { type: 'focus', path: items[items.length - 1].path } : null;
  if (key === 'Enter') return { type: 'activate', path: current.path };

  if (key === 'ArrowRight' && current.type === 'dir') {
    if (!current.expanded) return { type: 'expand', path: current.path };
    const firstChild = items[index + 1];
    return firstChild?.parentPath === current.path
      ? { type: 'focus', path: firstChild.path }
      : null;
  }

  if (key === 'ArrowLeft') {
    if (current.type === 'dir' && current.expanded) {
      return { type: 'collapse', path: current.path };
    }
    return current.parentPath ? { type: 'focus', path: current.parentPath } : null;
  }

  return null;
}

function collectInitiallyExpanded(items: readonly FileTreeNode[], result = new Set<string>()): Set<string> {
  for (const item of items) {
    if (item.type === 'dir' && item.expanded) result.add(item.path);
    if (item.children) collectInitiallyExpanded(item.children, result);
  }
  return result;
}

function visibleTreeNodes(
  items: readonly FileTreeNode[],
  expandedPaths: ReadonlySet<string>,
  loadedChildren: ReadonlyMap<string, FileTreeNode[]>,
): VisibleFileTreeNode[] {
  const result: VisibleFileTreeNode[] = [];

  function visit(nodes: readonly FileTreeNode[], depth: number, parentPath: string | null) {
    nodes.forEach((node, index) => {
      result.push({ node, depth, parentPath, position: index + 1, setSize: nodes.length });
      if (node.type !== 'dir' || !expandedPaths.has(node.path)) return;
      visit(loadedChildren.get(node.path) ?? node.children ?? [], depth + 1, node.path);
    });
  }

  visit(items, 0, null);
  return result;
}

function FileTree({
  items,
  onFileSelect,
  onExpandDir,
  selectedPath,
  className = '',
  loadingPaths,
}: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => collectInitiallyExpanded(items));
  const [loadedChildren, setLoadedChildren] = useState<Map<string, FileTreeNode[]>>(new Map());
  const [pendingPaths, setPendingPaths] = useState<Set<string>>(new Set());
  const [activePath, setActivePath] = useState<string | null>(() => items[0]?.path ?? null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const visibleItems = useMemo(
    () => visibleTreeNodes(items, expandedPaths, loadedChildren),
    [expandedPaths, items, loadedChildren],
  );
  const navigationItems = useMemo<FileTreeNavigationNode[]>(
    () => visibleItems.map(({ node, parentPath }) => ({
      path: node.path,
      type: node.type,
      parentPath,
      expanded: node.type === 'dir' && expandedPaths.has(node.path),
    })),
    [expandedPaths, visibleItems],
  );

  useEffect(() => {
    if (selectedPath && visibleItems.some(({ node }) => node.path === selectedPath)) {
      setActivePath(selectedPath);
    }
  }, [selectedPath, visibleItems]);

  useEffect(() => {
    if (!activePath || !visibleItems.some(({ node }) => node.path === activePath)) {
      setActivePath(visibleItems[0]?.node.path ?? null);
    }
  }, [activePath, visibleItems]);

  const focusPath = useCallback((path: string) => {
    setActivePath(path);
    itemRefs.current.get(path)?.focus();
  }, []);

  const collapseDirectory = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      next.delete(path);
      return next;
    });
  }, []);

  const expandDirectory = useCallback(async (node: FileTreeNode) => {
    if (node.type !== 'dir' || pendingPaths.has(node.path)) return;
    const isLoaded = loadedChildren.has(node.path) || node.children !== undefined;

    if (!isLoaded && onExpandDir) {
      setPendingPaths((current) => new Set(current).add(node.path));
      try {
        const result = await onExpandDir(node.path);
        if (mounted.current && result) {
          setLoadedChildren((current) => new Map(current).set(node.path, result));
        }
      } catch {
        return;
      } finally {
        if (mounted.current) {
          setPendingPaths((current) => {
            const next = new Set(current);
            next.delete(node.path);
            return next;
          });
        }
      }
    }

    if (mounted.current) {
      setExpandedPaths((current) => new Set(current).add(node.path));
    }
  }, [loadedChildren, onExpandDir, pendingPaths]);

  const activateNode = useCallback((node: FileTreeNode) => {
    if (node.type === 'file') {
      onFileSelect(node.path);
      return;
    }
    if (expandedPaths.has(node.path)) collapseDirectory(node.path);
    else void expandDirectory(node);
  }, [collapseDirectory, expandDirectory, expandedPaths, onFileSelect]);

  const handleKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLDivElement>,
    item: VisibleFileTreeNode,
  ) => {
    const action = resolveFileTreeNavigationAction(navigationItems, item.node.path, event.key);
    if (!action) return;
    event.preventDefault();

    if (action.type === 'focus') {
      focusPath(action.path);
    } else if (action.type === 'expand') {
      void expandDirectory(item.node);
    } else if (action.type === 'collapse') {
      collapseDirectory(item.node.path);
    } else {
      activateNode(item.node);
    }
  }, [activateNode, collapseDirectory, expandDirectory, focusPath, navigationItems]);

  if (items.length === 0) {
    return <div className={`file-tree-empty ${className}`}>没有文件</div>;
  }

  return (
    <div className={`file-tree ${className}`} role="tree" aria-label="文件目录">
      {visibleItems.map((item, index) => {
        const { node, depth, position, setSize } = item;
        const isDirectory = node.type === 'dir';
        const isExpanded = isDirectory && expandedPaths.has(node.path);
        const isSelected = selectedPath === node.path;
        const isLoading = pendingPaths.has(node.path) || (loadingPaths?.has(node.path) ?? false);
        const children = loadedChildren.get(node.path) ?? node.children ?? [];
        const isLoaded = loadedChildren.has(node.path) || node.children !== undefined;
        const isActive = activePath ? activePath === node.path : index === 0;

        return (
          <div className="file-tree-item" key={node.path} role="none">
            <div
              ref={(element) => {
                if (element) itemRefs.current.set(node.path, element);
                else itemRefs.current.delete(node.path);
              }}
              className={`file-tree-node ${isSelected ? 'selected' : ''}`}
              style={{ paddingLeft: depth * 16 + 8 }}
              role="treeitem"
              aria-level={depth + 1}
              aria-posinset={position}
              aria-setsize={setSize}
              aria-expanded={isDirectory ? isExpanded : undefined}
              aria-selected={isSelected}
              aria-busy={isLoading || undefined}
              tabIndex={isActive ? 0 : -1}
              title={node.name}
              onFocus={() => setActivePath(node.path)}
              onClick={(event) => {
                focusPath(node.path);
                event.currentTarget.focus();
                activateNode(node);
              }}
              onKeyDown={(event) => handleKeyDown(event, item)}
            >
              {isDirectory ? (
                <span className={`file-tree-arrow ${isLoading ? 'loading' : ''}`} aria-hidden="true">
                  {isLoading
                    ? <LoaderCircle size={12} />
                    : isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              ) : <span className="file-tree-icon" aria-hidden="true" />}
              <span className="file-tree-name">{node.name}</span>
            </div>
            {isDirectory && isExpanded && children.length === 0 && isLoaded && !isLoading && (
              <div className="file-tree-empty-dir" role="none" style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
                空目录
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FileTree;
