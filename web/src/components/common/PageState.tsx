import React from 'react';

// ---------------------------------------------------------------------------
// PageState: consistent loading / error / empty rendering for data pages.
// Wrap page content so every page handles the three non-success states the
// same way. Returns null when there is content to show.
// ---------------------------------------------------------------------------

interface PageStateProps {
  loading: boolean;
  error: string | null;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
}

const PageState: React.FC<PageStateProps> = ({
  loading,
  error,
  isEmpty = false,
  emptyTitle = 'Nothing here yet',
  emptyDescription = 'There is no data to display for this view.',
  onRetry,
}) => {
  if (loading) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="data-table-loading">
            <div className="spinner" />
            <div style={{ marginTop: 8 }}>Loading…</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty-state">
            <div className="empty-state-title">Could not load data</div>
            <p className="empty-state-desc">{error}</p>
            {onRetry && (
              <button className="btn btn-secondary btn-sm" onClick={onRetry} style={{ marginTop: 12 }}>
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty-state">
            <div className="empty-state-title">{emptyTitle}</div>
            <p className="empty-state-desc">{emptyDescription}</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default PageState;
