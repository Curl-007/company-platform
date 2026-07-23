import React from 'react';

// ---------------------------------------------------------------------------
// Panel: a card/container with optional header, title, and toolbar
// ---------------------------------------------------------------------------

interface PanelProps {
  /** Panel title text */
  title?: string;
  /** Semantic heading level for the panel title. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Subtitle or description */
  subtitle?: string;
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
  const hasHeader = title || toolbar;
  const Heading = `h${headingLevel}` as React.ElementType;

  return (
    <div className={`panel ${className}`} style={style}>
      {hasHeader && (
        <div className="panel-header">
          <div className="panel-header-left">
            {icon}
            <div>
              {title && <Heading className="panel-title">{title}</Heading>}
              {subtitle && <div className="panel-subtitle">{subtitle}</div>}
            </div>
          </div>
          {toolbar && <div className="panel-toolbar">{toolbar}</div>}
        </div>
      )}
      <div className="panel-body" style={noPadding ? { padding: 0 } : undefined}>
        {children}
      </div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
};

export default Panel;
