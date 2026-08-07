import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  cn,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../ui';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
}) => {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('common.empty');
  return (
    <Empty className={cn('empty-state-block ui-empty-state', compact && 'compact')}>
      {icon && <EmptyMedia className="empty-state-icon">{icon}</EmptyMedia>}
      <EmptyHeader>
        <EmptyTitle className="empty-state-title">{resolvedTitle}</EmptyTitle>
        {description && <EmptyDescription className="empty-state-desc">{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent className="empty-state-action">{action}</EmptyContent>}
    </Empty>
  );
};

export default EmptyState;
