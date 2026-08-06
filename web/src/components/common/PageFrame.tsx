import type { ReactNode } from 'react';
import { cn } from '../ui';
import {
  PageFrameContext,
  type PageBreadcrumb,
} from './PageHeader';

export interface PageFrameProps {
  /** @deprecated Top bar already shows the current page; content no longer renders a second title. */
  breadcrumb?: ReactNode;
  /** @deprecated Prefer AppHeader page label; kept for optional nested consumers. */
  breadcrumbs?: PageBreadcrumb[];
  /** @deprecated Prefer AppHeader page label. */
  title?: string;
  /** Optional page intro still accepted for future use, but not rendered in the shell. */
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
}

/**
 * Shared page shell. Title lives in AppHeader only — rendering another
 * title/breadcrumb block here stacked "工作台" on top of "工作台".
 */
function PageFrame({
  breadcrumb,
  breadcrumbs,
  actions,
  children,
  className,
  contentClassName,
}: PageFrameProps) {
  return (
    <PageFrameContext.Provider value={{ breadcrumb, breadcrumbs }}>
      <div
        className={cn('page-frame min-w-0 max-w-full', className)}
        data-slot="page-frame"
        data-state="ready"
      >
        {actions ? (
          <div className="page-frame-actions mb-4 flex min-w-0 flex-wrap justify-end gap-2" data-slot="page-frame-actions">
            {actions}
          </div>
        ) : null}
        <div
          className={cn('page-frame-content min-w-0 max-w-full', contentClassName)}
          data-slot="page-frame-content"
        >
          {children}
        </div>
      </div>
    </PageFrameContext.Provider>
  );
}

export default PageFrame;
