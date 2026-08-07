import { createContext, useContext, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../ui';

// ---------------------------------------------------------------------------
// PageHeader: standard page title + description, with an optional actions slot
// on the right (buttons, filters). Used at the top of every page.
// ---------------------------------------------------------------------------

export interface PageBreadcrumb {
  label: ReactNode;
  href?: string;
  onClick?: () => void;
}

export interface PageHeaderProps {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  breadcrumbs?: PageBreadcrumb[];
  className?: string;
}

export interface PageFrameContextValue {
  breadcrumb?: ReactNode;
  breadcrumbs?: PageBreadcrumb[];
}

export const PageFrameContext = createContext<PageFrameContextValue | null>(null);

function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  const { t } = useTranslation();
  const frameContext = useContext(PageFrameContext);
  const resolvedBreadcrumb = breadcrumb ?? frameContext?.breadcrumb;
  const resolvedBreadcrumbs = breadcrumbs ?? frameContext?.breadcrumbs;

  // Drop the leaf crumb when it repeats the page title — otherwise every page
  // reads "日常工作 > 工作台 / 工作台" and the header looks noisy for no gain.
  const ancestorBreadcrumbs = (() => {
    if (!resolvedBreadcrumbs?.length) return resolvedBreadcrumbs;
    const last = resolvedBreadcrumbs[resolvedBreadcrumbs.length - 1];
    const lastLabel = typeof last.label === 'string' ? last.label.trim() : null;
    if (title && lastLabel && lastLabel === title.trim()) {
      return resolvedBreadcrumbs.slice(0, -1);
    }
    return resolvedBreadcrumbs;
  })();

  const hasBreadcrumbs = Boolean(ancestorBreadcrumbs?.length || resolvedBreadcrumb);

  // Skip empty shells: breadcrumbs-only headers leave a long divider with no
  // title and look broken next to content toolbars (Team / empty states).
  if (!title && !description && !actions && !hasBreadcrumbs) {
    return null;
  }

  return (
    <header
      className={cn(
        'page-header ui-page-header min-w-0 flex-wrap',
        !title && !description && !actions && 'page-header-crumbs-only',
        className,
      )}
      data-slot="page-header"
      data-state="ready"
    >
      <div className="page-header-info min-w-0 flex-1">
        {hasBreadcrumbs && (
          <nav
            className={cn(
              'page-breadcrumbs min-w-0 max-w-full text-xs text-[var(--muted-foreground)]',
              (title || description) && 'mb-1.5',
            )}
            aria-label={t('common.breadcrumbs')}
          >
            {ancestorBreadcrumbs?.length ? (
              <ol className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
                {ancestorBreadcrumbs.map((item, index) => {
                  const itemClassName = cn(
                    'page-breadcrumb-item min-w-0 max-w-full truncate text-[var(--muted-foreground)]',
                  );
                  const content = item.href ? (
                    <a className={itemClassName} href={item.href}>
                      {item.label}
                    </a>
                  ) : item.onClick ? (
                    <button className={itemClassName} type="button" onClick={item.onClick}>
                      {item.label}
                    </button>
                  ) : (
                    <span className={itemClassName}>{item.label}</span>
                  );

                  return (
                    <li key={index} className="flex min-w-0 max-w-full items-center gap-1">
                      {index > 0 && <ChevronRight size={12} className="shrink-0 opacity-40" aria-hidden="true" />}
                      {content}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="page-breadcrumbs-custom min-w-0 max-w-full truncate">{resolvedBreadcrumb}</div>
            )}
          </nav>
        )}
        {title && <h1 className="page-title page-header-title">{title}</h1>}
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-header-actions min-w-0 max-w-full flex-wrap">{actions}</div>}
    </header>
  );
}

export default PageHeader;
