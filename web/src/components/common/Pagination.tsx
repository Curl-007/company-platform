import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../ui/utils';

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  /** Current 1-based page number. */
  page: number;
  /** Total number of pages. */
  pageCount: number;
  /** Called with the new page when the user requests a change. */
  onPageChange: (page: number) => void;
  /** How many page numbers to show on each side of the current page. */
  siblingCount?: number;
  /** Disabled state (e.g. while a table is loading). */
  disabled?: boolean;
}

/**
 * Controlled pagination control. Computes a windowed page list with ellipses
 * so large datasets stay navigable. Accessible: rendered as <nav> with
 * aria-label, current page marked aria-current, buttons aria-disabled.
 */
export const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  (
    {
      page,
      pageCount,
      onPageChange,
      siblingCount = 1,
      disabled = false,
      className,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const pages = buildPageList(page, Math.max(pageCount, 1), siblingCount);
    const go = (next: number) => {
      const clamped = Math.min(Math.max(next, 1), pageCount);
      if (clamped !== page && !disabled) onPageChange(clamped);
    };

    return (
      <nav
        ref={ref}
        className={cn('pagination', className)}
        aria-label={t('common.pagination')}
        data-slot="pagination"
        {...props}
      >
        <PaginationButton
          aria-label={t('common.previousPage')}
          onClick={() => go(page - 1)}
          disabled={disabled || page <= 1}
        >
          <ChevronLeft size={16} />
        </PaginationButton>

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="pagination-ellipsis" aria-hidden="true">
              <MoreHorizontal size={16} />
            </span>
          ) : (
            <PaginationButton
              key={p}
              active={p === page}
              aria-current={p === page ? 'page' : undefined}
              aria-label={t('common.pageN', { page: p })}
              onClick={() => go(p)}
              disabled={disabled}
            >
              {p}
            </PaginationButton>
          ),
        )}

        <PaginationButton
          aria-label={t('common.nextPage')}
          onClick={() => go(page + 1)}
          disabled={disabled || page >= pageCount}
        >
          <ChevronRight size={16} />
        </PaginationButton>
      </nav>
    );
  },
);

Pagination.displayName = 'Pagination';

function PaginationButton({
  children,
  active = false,
  disabled = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn('pagination-button', active && 'pagination-button-active')}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

/** Returns an array like [1, '…', 4, 5, 6, '…', 20] for windowed display. */
function buildPageList(
  page: number,
  pageCount: number,
  siblingCount: number,
): (number | '…')[] {
  // Always show first and last; show a window around the current page.
  const rangeStart = Math.max(page - siblingCount, 2);
  const rangeEnd = Math.min(page + siblingCount, pageCount - 1);

  const result: (number | '…')[] = [1];
  if (rangeStart > 2) result.push('…');
  for (let p = rangeStart; p <= rangeEnd; p += 1) result.push(p);
  if (rangeEnd < pageCount - 1) result.push('…');
  if (pageCount > 1) result.push(pageCount);
  return result;
}
