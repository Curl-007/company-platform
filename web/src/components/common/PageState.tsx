import React from 'react';

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
  emptyTitle = '暂无数据',
  emptyDescription = '当前视图还没有可展示的数据。',
  onRetry,
}) => {
  if (loading) {
    return (
      <div className="panel">
        <div className="panel-body">
          <div className="data-table-loading">
            <div className="spinner" />
            <div className="page-state-loading-text">加载中...</div>
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
            <div className="empty-state-title">数据加载失败</div>
            <p className="empty-state-desc">{error}</p>
            {onRetry && (
              <button className="btn btn-secondary btn-sm page-state-retry" onClick={onRetry}>
                重试
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
