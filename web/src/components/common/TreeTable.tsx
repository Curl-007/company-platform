import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface TreeTableColumn<T> {
  key: string;
  title: string;
  render?: (row: T, index: number, depth: number) => React.ReactNode;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  indent?: boolean;
}

interface TreeTableProps<T extends { id: string }> {
  columns: TreeTableColumn<T>[];
  data: T[];
  getChildren: (item: T) => T[] | undefined;
  getDepth: (item: T) => number;
  rowKey?: string | ((row: T) => string);
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  indentSize?: number;
  showLines?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  defaultExpanded?: boolean;
  emptyText?: string;
  className?: string;
  expandedIds?: Set<string>;
  onToggleExpand?: (id: string) => void;
}

function TreeTable<T extends { id: string }>({
  columns,
  data,
  getChildren,
  getDepth,
  rowKey,
  onRowClick,
  rowActions,
  indentSize = 24,
  showLines = true,
  selectable = false,
  selectedIds,
  onSelectionChange,
  defaultExpanded = true,
  emptyText,
  className = '',
  expandedIds: controlledExpandedIds,
  onToggleExpand,
}: TreeTableProps<T>) {
  const { t } = useTranslation();
  const resolvedEmptyText = emptyText ?? t('common.empty');
  const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(() =>
    defaultExpanded ? new Set(data.map((item) => item.id)) : new Set<string>(),
  );

  const isControlled = controlledExpandedIds !== undefined;
  const expandedIds = isControlled ? controlledExpandedIds : internalExpandedIds;

  const toggleExpand = useCallback(
    (id: string) => {
      if (isControlled) {
        onToggleExpand?.(id);
      } else {
        setInternalExpandedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
    },
    [isControlled, onToggleExpand],
  );

  function buildVisibleRows(): { item: T; depth: number; isLastChild: boolean[] }[] {
    const result: { item: T; depth: number; isLastChild: boolean[] }[] = [];

    function getRootItems(): T[] {
      return data.filter((item) => getDepth(item) === 0);
    }

    function getChildrenOf(item: T): T[] {
      return data.filter((child) => getChildren(item)?.some((c) => c.id === child.id));
    }

    function getAncestry(item: T): T[] {
      const ancestry: T[] = [];
      let current = item;
      for (let i = 0; i < 20; i += 1) {
        const parent = data.find((d) => getChildren(d)?.some((c) => c.id === current.id));
        if (!parent) break;
        ancestry.unshift(parent);
        current = parent;
      }
      return ancestry;
    }

    const visibleIds = new Set<string>();
    for (const item of data) {
      const ancestry = getAncestry(item);
      const allExpanded = ancestry.every((ancestor) => expandedIds.has(ancestor.id));
      if (ancestry.length === 0 || allExpanded) {
        visibleIds.add(item.id);
      }
    }

    const visibleData = data.filter((item) => visibleIds.has(item.id));

    for (const item of visibleData) {
      const depth = getDepth(item);
      const ancestry = getAncestry(item);
      const isLastChildList: boolean[] = [];

      for (let d = 0; d < depth; d += 1) {
        const parentForLevel = d > 0 ? ancestry[d - 1] : null;
        const levelChildren = parentForLevel ? getChildrenOf(parentForLevel) : getRootItems();
        const currentNode = ancestry[d];
        const isLast = !currentNode || levelChildren[levelChildren.length - 1]?.id === currentNode.id;
        isLastChildList.push(isLast);
      }

      const parentForThis = depth > 0 ? ancestry[depth - 1] : null;
      const siblingsAtLevel = parentForThis ? getChildrenOf(parentForThis) : getRootItems();
      const isLastChild = siblingsAtLevel[siblingsAtLevel.length - 1]?.id === item.id;

      result.push({
        item,
        depth,
        isLastChild: [...isLastChildList, isLastChild],
      });
    }

    return result;
  }

  const visibleRows = buildVisibleRows();

  const getRowKey = useCallback(
    (item: T, index: number): string => {
      if (typeof rowKey === 'function') return rowKey(item);
      if (typeof rowKey === 'string') return String((item as Record<string, unknown>)[rowKey] ?? index);
      return item.id;
    },
    [rowKey],
  );

  const toggleSelect = useCallback(
    (id: string) => {
      if (!selectable || !onSelectionChange) return;
      const current = selectedIds ?? new Set<string>();
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange(next);
    },
    [selectable, selectedIds, onSelectionChange],
  );

  if (data.length === 0) {
    return (
      <div className={`tree-table-wrapper ${className}`}>
        <div className="tree-table-empty">{resolvedEmptyText}</div>
      </div>
    );
  }

  return (
    <div className={`tree-table-wrapper ${className}`}>
      <table className="tree-table">
        <thead>
          <tr>
            {selectable && (
              <th
                key="__checkbox__"
                className="tree-table-checkbox-col"
                style={{ width: 40 }}
                scope="col"
                aria-label={t('common.select')}
              />
            )}
            {columns.map((col) => (
              <th key={col.key} scope="col" style={{ width: col.width, textAlign: col.align ?? 'left' }}>
                {col.title}
              </th>
            ))}
            {rowActions && (
              <th
                key="__actions__"
                className="tree-table-actions-col"
                style={{ width: 120 }}
                scope="col"
                aria-label={t('common.actions')}
              />
            )}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(({ item, depth, isLastChild }, rowIndex) => {
            const key = getRowKey(item, rowIndex);
            const isExpanded = expandedIds.has(item.id);
            const children = getChildren(item);
            const canExpand = !!children && children.length > 0;

            return (
              <tr
                key={key}
                className={`${onRowClick ? 'clickable' : ''} ${selectedIds?.has(item.id) ? 'selected' : ''}`}
                onClick={() => onRowClick?.(item)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(event) => {
                  if (!onRowClick || event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick(item);
                  }
                }}
              >
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds?.has(item.id) ?? false}
                      onChange={() => toggleSelect(item.id)}
                      aria-label={`${t('common.select')} ${item.id}`}
                    />
                  </td>
                )}
                {columns.map((col, colIndex) => {
                  const isFirst = colIndex === 0 || col.indent;
                  const indent = isFirst ? depth * indentSize : 0;

                  return (
                    <td
                      key={col.key}
                      style={{
                        textAlign: col.align ?? 'left',
                        paddingLeft: indent + (isFirst ? 8 : 0),
                      }}
                    >
                      {isFirst && (canExpand ? (
                        <button
                          className="tree-table-toggle"
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={`${t(isExpanded ? 'common.collapse' : 'common.expand')} ${item.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleExpand(item.id);
                          }}
                        >
                          {isExpanded
                            ? <ChevronDown size={13} aria-hidden="true" />
                            : <ChevronRight size={13} aria-hidden="true" />}
                        </button>
                      ) : <span className="tree-table-toggle invisible" aria-hidden="true" />)}
                      {isFirst && showLines && depth > 0 && (
                        <span className="tree-table-lines" style={{ position: 'relative' }}>
                          {isLastChild.slice(0, depth).map((isLast, levelIdx) => (
                            <span
                              key={levelIdx}
                              className="tree-table-line"
                              style={{
                                position: 'absolute',
                                left:
                                  (levelIdx - depth) * indentSize +
                                  (levelIdx + 1) * indentSize -
                                  indentSize,
                                top: 0,
                                bottom: 0,
                                width: 1,
                                borderLeft: isLast ? 'none' : '1px dashed #d0d0d0',
                              }}
                            />
                          ))}
                        </span>
                      )}
                      {col.render
                        ? col.render(item, rowIndex, depth)
                        : String((item as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  );
                })}
                {rowActions && (
                  <td className="tree-table-actions" aria-label={t('common.actions')} onClick={(e) => e.stopPropagation()}>
                    {rowActions(item)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default TreeTable;
