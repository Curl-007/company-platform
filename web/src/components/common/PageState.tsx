import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from '../ui';
import Panel from './Panel';

interface PageStateProps {
  loading: boolean;
  error: string | null;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
}

interface PageStateEmptyProps {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

const PageStateEmpty: React.FC<PageStateEmptyProps> = ({ title, description, action }) => (
  <Empty className="empty-state empty-state-block page-state-empty ui-empty-state bg-[var(--card)] text-[var(--muted-foreground)]">
    <EmptyHeader>
      <EmptyTitle className="empty-state-title text-[var(--card-foreground)]">{title}</EmptyTitle>
      {description && (
        <EmptyDescription className="empty-state-desc text-[var(--muted-foreground)]">
          {description}
        </EmptyDescription>
      )}
    </EmptyHeader>
    {action && <EmptyContent className="empty-state-action">{action}</EmptyContent>}
  </Empty>
);

const PageState: React.FC<PageStateProps> = ({
  loading,
  error,
  isEmpty = false,
  emptyTitle,
  emptyDescription,
  onRetry,
}) => {
  const { t } = useTranslation();
  const resolvedEmptyTitle = emptyTitle ?? t('common.empty');
  const resolvedEmptyDescription = emptyDescription ?? t('common.emptyDescription');

  if (loading) {
    return (
      <Panel className="page-state-panel" noPadding>
        <div
          className="data-table-loading page-state-loading flex min-h-40 flex-col items-center justify-center gap-3 bg-[var(--card)] p-6 text-[var(--muted-foreground)]"
          role="status"
          aria-live="polite"
        >
          <Spinner size={28} className="page-state-spinner" />
          <div className="page-state-loading-text">{t('common.loading')}</div>
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel className="page-state-panel" noPadding>
        <PageStateEmpty
          title={t('common.loadFailed')}
          description={error}
          action={onRetry ? (
            <Button className="page-state-retry" variant="secondary" size="sm" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          ) : undefined}
        />
      </Panel>
    );
  }

  if (isEmpty) {
    return (
      <Panel className="page-state-panel" noPadding>
        <PageStateEmpty title={resolvedEmptyTitle} description={resolvedEmptyDescription} />
      </Panel>
    );
  }

  return null;
};

export default PageState;
