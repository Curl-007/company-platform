import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  cn,
  Empty,
  EmptyDescription,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui';
import { Pagination } from './Pagination';

export interface DataTableColumn<T> {
  key: string;
  title: string;
  render?: (row: T, index: number) => React.ReactNode;
  sorter?: (a: T, b: T) => number;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
}

export type SortDirection = 'asc' | 'desc';

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: string | ((row: T) => string);
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyText?: string;
  emptyContent?: React.ReactNode;
  className?: string;
  defaultSortKey?: string;
  defaultSortDirection?: SortDirection;
  /**
   * Client-side page size. When set and the sorted row count exceeds it,
   * rows are windowed and a pagination bar is shown under the table.
   * Pass `false` / omit to keep the previous unpaginated behavior.
   */
  pageSize?: number;
}

function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  loading = false,
  emptyText,
  emptyContent,
  className = '',
  defaultSortKey,
  defaultSortDirection = 'asc',
  pageSize,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const resolvedEmptyText = emptyText ?? t('common.empty');
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDirection>(defaultSortDirection);
  const [page, setPage] = useState(1);

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

  const effectivePageSize = pageSize && pageSize > 0 ? pageSize : 0;
  const pageCount = effectivePageSize > 0
    ? Math.max(1, Math.ceil(sortedData.length / effectivePageSize))
    : 1;

  // Keep page in range when filters / data shrink the result set.
  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), pageCount));
  }, [pageCount]);

  // Reset to first page when the underlying dataset identity changes meaningfully
  // (e.g. new search keyword produces a shorter list).
  useEffect(() => {
    setPage(1);
  }, [data, sortKey, sortDir, effectivePageSize]);

  const pagedData = useMemo(() => {
    if (!effectivePageSize) return sortedData;
    const start = (page - 1) * effectivePageSize;
    return sortedData.slice(start, start + effectivePageSize);
  }, [sortedData, page, effectivePageSize]);

  const showPagination = effectivePageSize > 0 && sortedData.length > effectivePageSize;
  const rangeStart = sortedData.length === 0 ? 0 : (page - 1) * effectivePageSize + 1;
  const rangeEnd = Math.min(page * effectivePageSize, sortedData.length);

  const getKeyForRow = useCallback(
    (row: T, index: number): string => {
      if (typeof rowKey === 'function') return rowKey(row);
      return String((row as Record<string, unknown>)[rowKey] ?? index);
    },
    [rowKey],
  );

  if (loading) {
    return (
      <div
        className={cn(
          'data-table-wrapper ui-data-table-wrapper min-w-0 max-w-full border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]',
          className,
        )}
        data-slot="data-table"
        data-state="loading"
      >
        <div
          className="data-table-loading ui-data-table-loading flex min-h-32 flex-col items-center justify-center gap-3 bg-[var(--card)] p-6 text-[var(--muted-foreground)]"
          role="status"
          aria-live="polite"
        >
          <Spinner
            size={28}
            className="ui-data-table-spinner"
          />
          <span className="data-table-loading-text">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'data-table-wrapper ui-data-table-wrapper min-w-0 max-w-full border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]',
        className,
      )}
      data-slot="data-table"
      data-state="ready"
    >
      <Table className="data-table ui-table-surface bg-[var(--card)] text-[var(--card-foreground)]">
        <TableHeader className="data-table-header bg-[var(--muted)] text-[var(--muted-foreground)]">
          <TableRow className="data-table-header-row bg-[var(--muted)]">
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              const isSortable = !!col.sorter;

              return (
                <TableHead
                  key={col.key}
                  className={cn(
                    isSortable && 'sortable',
                    isSorted && 'sorted',
                    'data-table-head text-[var(--muted-foreground)]',
                  )}
                  scope="col"
                  aria-sort={isSortable ? (isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  style={{
                    width: col.width,
                    textAlign: col.align ?? 'left',
                  }}
                >
                  {isSortable ? (
                    <button
                      className="data-table-sort-button"
                      type="button"
                      data-slot="data-table-sort-button"
                      onClick={() => handleSort(col)}
                      style={{
                        justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
                      }}
                    >
                      <span>{col.title}</span>
                      <span className="sort-indicator" aria-hidden="true">
                        {isSorted ? (
                          sortDir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : <ArrowUpDown size={13} />}
                      </span>
                    </button>
                  ) : col.title}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedData.length === 0 ? (
            <TableRow className="data-table-empty-row">
              <TableCell className="data-table-empty-cell" colSpan={columns.length}>
                {emptyContent ?? (
                  <Empty className="data-table-empty ui-data-table-empty bg-[var(--card)] text-[var(--muted-foreground)]">
                    <EmptyDescription className="data-table-empty-text text-[var(--muted-foreground)]">
                      {resolvedEmptyText}
                    </EmptyDescription>
                  </Empty>
                )}
              </TableCell>
            </TableRow>
          ) : (
            pagedData.map((row, rowIndex) => (
              <TableRow
                key={getKeyForRow(row, rowIndex)}
                className={cn(onRowClick && 'clickable', 'data-table-row')}
                onClick={() => onRowClick?.(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(event) => {
                  if (!onRowClick || event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick(row);
                  }
                }}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className="data-table-cell text-[var(--card-foreground)]"
                    style={{ textAlign: col.align ?? 'left' }}
                  >
                    {col.render
                      ? col.render(row, (page - 1) * (effectivePageSize || 0) + rowIndex)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {showPagination ? (
        <div className="data-table-pagination" data-slot="data-table-pagination">
          <span className="data-table-pagination-meta text-secondary">
            第 {rangeStart}–{rangeEnd} 条，共 {sortedData.length} 条
          </span>
          <Pagination
            page={page}
            pageCount={pageCount}
            onPageChange={setPage}
          />
        </div>
      ) : null}
    </div>
  );
}

export default DataTable;
