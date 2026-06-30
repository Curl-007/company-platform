import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
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
    <div className={`empty-state-block ${compact ? 'compact' : ''}`}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      <div className="empty-state-title">{title}</div>
      {description && <div className="empty-state-desc">{description}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
};

export default EmptyState;
