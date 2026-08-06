import React from 'react';
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
  title = '暂无数据',
  description,
  action,
  compact = false,
}) => {
  return (
    <Empty className={cn('empty-state-block ui-empty-state', compact && 'compact')}>
      {icon && <EmptyMedia className="empty-state-icon">{icon}</EmptyMedia>}
      <EmptyHeader>
        <EmptyTitle className="empty-state-title">{title}</EmptyTitle>
        {description && <EmptyDescription className="empty-state-desc">{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent className="empty-state-action">{action}</EmptyContent>}
    </Empty>
  );
};

export default EmptyState;
