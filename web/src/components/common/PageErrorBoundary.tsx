import React from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';

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
class PageErrorBoundary extends React.Component<
  PageErrorBoundaryProps & WithTranslation,
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
    const { t, pageLabel } = this.props;
    if (!error) {
      return this.props.children;
    }

    const isChunkError =
      /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        error.message || '',
      ) || error.name === 'ChunkLoadError';

    const title = isChunkError ? t('common.pageLoadFailed') : t('common.pageRenderError');
    const description = isChunkError
      ? t('common.pageLoadFailedDesc')
      : error.message || t('common.unknownError');

    return (
      <div className="panel">
        <div className="panel-body">
          <div className="empty-state">
            <div className="empty-state-title">{title}</div>
            <p className="empty-state-desc">
              {pageLabel ? t('common.pageLabel', { label: pageLabel }) : null}
              {description}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={this.handleRetry}>
                {t('common.retry')}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={this.handleReload}>
                {t('common.reloadPage')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default withTranslation()(PageErrorBoundary);
