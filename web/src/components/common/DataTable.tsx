import React, { useState, useMemo, useCallback } from 'react';

// ---------------------------------------------------------------------------
// DataTable: reusable table with column definitions, sorting, and states
// ---------------------------------------------------------------------------

export interface DataTableColumn<T> {
  /** Unique column key */
  key: string;
  /** Column header text */
  title: string;
  /** How to extract the cell value from a row */
  render?: (row: T, index: number) => React.ReactNode;
  /** Sort comparator. Return negative/zero/positive like Array.sort */
  sorter?: (a: T, b: T) => number;
  /** Column width hint (CSS value) */
  width?: string | number;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
}

export type SortDirection = 'asc' | 'desc';

interface DataTableProps<T> {
  /** Column definitions */
  columns: DataTableColumn<T>[];
  /** Row data */
  data: T[];
  /** Unique key extractor for each row */
  rowKey: string | ((row: T) => string);
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Show loading spinner */
  loading?: boolean;
  /** Custom empty state message */
  emptyText?: string;
  /** Custom empty state component */
  emptyContent?: React.ReactNode;
  /** Additional CSS class for the wrapper */
  className?: string;
  /** Default sort column key */
  defaultSortKey?: string;
  /** Default sort direction */
  defaultSortDirection?: SortDirection;
}

function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  loading = false,
  emptyText = 'No data available',
  emptyContent,
  className = '',
  defaultSortKey,
  defaultSortDirection = 'asc',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDirection>(defaultSortDirection);

  const handleSort = useCallback(
    (column: DataTableColumn<T>) => {
      if (!column.sorter) return;

      if (sortKey === column.key) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(column.key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const sortedData = useMemo(() => {
    if (!sortKey) return data;

    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sorter) return data;

    const sorted = [...data].sort(column.sorter);
    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [data, columns, sortKey, sortDir]);

  const getKeyForRow = useCallback(
    (row: T, index: number): string => {
      if (typeof rowKey === 'function') return rowKey(row);
      return String((row as Record<string, unknown>)[rowKey] ?? index);
    },
    [rowKey],
  );

  // Loading state
  if (loading) {
    return (
      <div className={`data-table-wrapper ${className}`}>
        <div className="data-table-loading">
          <div className="spinner" />
          <div style={{ marginTop: 8 }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`data-table-wrapper ${className}`}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              const isSortable = !!col.sorter;

              return (
                <th
                  key={col.key}
                  className={`${isSortable ? 'sortable' : ''} ${isSorted ? 'sorted' : ''}`}
                  style={{
                    width: col.width,
                    textAlign: col.align ?? 'left',
                  }}
                  onClick={() => isSortable && handleSort(col)}
                >
                  {col.title}
                  {isSortable && (
                    <span className="sort-indicator">
                      {isSorted ? (sortDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                {emptyContent ?? (
                  <div className="data-table-empty">{emptyText}</div>
                )}
              </td>
            </tr>
          ) : (
            sortedData.map((row, rowIndex) => (
              <tr
                key={getKeyForRow(row, rowIndex)}
                className={onRowClick ? 'clickable' : ''}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ textAlign: col.align ?? 'left' }}
                  >
                    {col.render
                      ? col.render(row, rowIndex)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
