import React from 'react';

interface PageErrorBoundaryProps {
  children: React.ReactNode;
  /** Label shown in the fallback, e.g. current page key */
  pageLabel?: string;
}

interface PageErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches lazy-route import failures and render errors so a single page
 * crash does not blank the whole viewport (Layout chrome stays mounted).
 */
export default class PageErrorBoundary extends React.Component<
  PageErrorBoundaryProps,
  PageErrorBoundaryState
> {
  state: PageErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[PageErrorBoundary]', error, info?.componentStack);
    }
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const isChunkError =
      /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        error.message || '',
      ) || error.name === 'ChunkLoadError';

    const title = isChunkError ? '页面资源加载失败' : '页面渲染出错';
    const description = isChunkError
      ? '前端分包未能加载（常见于网络中断、部署后旧缓存，或 HTTP 被错误升级为 HTTPS）。请重试；若仍失败请硬刷新。'
      : error.message || '未知错误';

    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty-state">
            <div className="empty-state-title">{title}</div>
            <p className="empty-state-desc">
              {this.props.pageLabel ? `页面：${this.props.pageLabel}。` : null}
              {description}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={this.handleRetry}>
                重试
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={this.handleReload}>
                刷新整页
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
