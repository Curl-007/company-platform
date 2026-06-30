import React, { useState, useCallback } from 'react';
import type { FileTreeNode } from '../../types';

// ---------------------------------------------------------------------------
// FileTree: lazy-load recursive directory tree for source code browsing
// ---------------------------------------------------------------------------

interface FileTreeProps {
  /** Root nodes (direct children of the base path) */
  items: FileTreeNode[];
  /** Called when a file is clicked */
  onFileSelect: (path: string) => void;
  /** Called when a directory is expanded — should trigger fetchChildren(path) */
  onExpandDir?: (path: string) => Promise<FileTreeNode[]> | void;
  /** Currently selected file path */
  selectedPath?: string;
  /** Additional CSS class */
  className?: string;
  /** Loading state for a specific path */
  loadingPaths?: Set<string>;
}

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  onFileSelect: (path: string) => void;
  onExpandDir?: (path: string) => Promise<FileTreeNode[]> | void;
  selectedPath?: string;
  loadingPaths?: Set<string>;
}

function FileTreeItem({
  node,
  depth,
  onFileSelect,
  onExpandDir,
  selectedPath,
  loadingPaths,
}: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(node.expanded ?? false);
  const [children, setChildren] = useState<FileTreeNode[]>(node.children ?? []);
  const [loaded, setLoaded] = useState(!!node.children);

  const isLoading = loadingPaths?.has(node.path) ?? false;

  const handleToggle = useCallback(async () => {
    if (node.type === 'file') {
      onFileSelect(node.path);
      return;
    }
    if (!expanded && !loaded && onExpandDir) {
      const result = await onExpandDir(node.path);
      if (result) {
        setChildren(result);
        setLoaded(true);
      }
    }
    setExpanded((prev) => !prev);
  }, [node.type, node.path, expanded, loaded, onExpandDir, onFileSelect]);

  const isSelected = selectedPath === node.path;

  return (
    <div className="file-tree-item">
      <div
        className={`file-tree-node ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleToggle}
      >
        {node.type === 'dir' ? (
          <span className="file-tree-arrow">
            {isLoading ? '\u23F3' : expanded ? '\u25BC' : '\u25B6'}
          </span>
        ) : (
          <span className="file-tree-icon" />
        )}
        <span className="file-tree-name">{node.name}</span>
      </div>
      {node.type === 'dir' && expanded && children.length > 0 && (
        <div className="file-tree-children">
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              onExpandDir={onExpandDir}
              selectedPath={selectedPath}
              loadingPaths={loadingPaths}
            />
          ))}
        </div>
      )}
      {node.type === 'dir' && expanded && children.length === 0 && loaded && (
        <div className="file-tree-empty-dir" style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
          空目录
        </div>
      )}
    </div>
  );
}

function FileTree({
  items,
  onFileSelect,
  onExpandDir,
  selectedPath,
  className = '',
  loadingPaths,
}: FileTreeProps) {
  if (items.length === 0) {
    return <div className={`file-tree-empty ${className}`}>没有文件</div>;
  }

  return (
    <div className={`file-tree ${className}`}>
      {items.map((item) => (
        <FileTreeItem
          key={item.path}
          node={item}
          depth={0}
          onFileSelect={onFileSelect}
          onExpandDir={onExpandDir}
          selectedPath={selectedPath}
          loadingPaths={loadingPaths}
        />
      ))}
    </div>
  );
}

export default FileTree;
