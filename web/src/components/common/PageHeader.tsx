import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// PageHeader: standard page title + description, with an optional actions slot
// on the right (buttons, filters). Used at the top of every page.
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-info">
        <h1 className="page-title">{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </div>
  );
}

export default PageHeader;
