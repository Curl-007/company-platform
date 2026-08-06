import React from 'react';
import { cn } from '../ui';

// ---------------------------------------------------------------------------
// Panel: a card/container with optional header, title, and toolbar
// ---------------------------------------------------------------------------

export interface PanelProps {
  /** Panel title text */
  title?: string;
  /** Semantic heading level for the panel title. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Subtitle or description */
  subtitle?: React.ReactNode;
  /** Icon element to show before the title */
  icon?: React.ReactNode;
  /** Toolbar actions rendered on the right side of the header */
  toolbar?: React.ReactNode;
  /** Panel body content */
  children?: React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** If true, no body padding */
  noPadding?: boolean;
}

const Panel: React.FC<PanelProps> = ({
  title,
  headingLevel = 2,
  subtitle,
  icon,
  toolbar,
  children,
  footer,
  className = '',
  style,
  noPadding = false,
}) => {
  const hasHeader = Boolean(title || subtitle || icon || toolbar);
  const Heading = `h${headingLevel}` as React.ElementType;

  return (
    <div
      className={cn(
        'panel ui-panel surface-panel min-w-0 max-w-full border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]',
        className,
      )}
      style={style}
      data-slot="panel"
      data-state="ready"
    >
      {hasHeader && (
        <div
          className="panel-header ui-panel-header min-w-0 border-[var(--border)] bg-[var(--muted)]"
          data-slot="panel-header"
        >
          <div className="panel-header-left min-w-0 flex-1">
            {icon}
            <div className="min-w-0">
              {title && (
                <Heading className="panel-title ui-panel-title text-[var(--card-foreground)]">
                  {title}
                </Heading>
              )}
              {subtitle && (
                <div className="panel-subtitle ui-panel-subtitle text-[var(--muted-foreground)]">
                  {subtitle}
                </div>
              )}
            </div>
          </div>
          {toolbar && <div className="panel-toolbar ui-panel-toolbar min-w-0 max-w-full">{toolbar}</div>}
        </div>
      )}
      <div
        className={cn('panel-body ui-panel-body min-w-0', noPadding && 'panel-body--flush')}
        style={noPadding ? { padding: 0 } : undefined}
        data-slot="panel-body"
      >
        {children}
      </div>
      {footer && <div className="card-footer panel-footer" data-slot="panel-footer">{footer}</div>}
    </div>
  );
};

export default Panel;
