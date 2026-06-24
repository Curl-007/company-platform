import React from 'react';

// ---------------------------------------------------------------------------
// StatusBadge: renders a colored pill/badge based on a status string
// ---------------------------------------------------------------------------

export type StatusBadgeVariant =
  | 'success' | 'green'
  | 'warning' | 'amber'
  | 'risk' | 'red'
  | 'info' | 'blue'
  | 'blocked' | 'purple'
  | 'neutral';

interface StatusBadgeProps {
  /** The text label to display */
  label: string;
  /** Visual variant. Can be a semantic name or a color name. */
  variant?: StatusBadgeVariant;
  /** If true, show a colored dot before the label */
  showDot?: boolean;
  /** Override the auto-detected variant from the status string */
  status?: string;
  /** Additional CSS class */
  className?: string;
}

/**
 * Map common status strings to badge variants automatically.
 */
function variantFromStatus(status: string): StatusBadgeVariant {
  const lower = status.toLowerCase();

  if (/success|done|completed|passed|approved|active|released|green/.test(lower)) {
    return 'success';
  }
  if (/warning|caution|attention|amber|pending|review|scheduled|planning/.test(lower)) {
    return 'warning';
  }
  if (/risk|error|failed|critical|red|blocked|rejected/.test(lower)) {
    return 'risk';
  }
  if (/info|in.?progress|running|development|testing|blue/.test(lower)) {
    return 'info';
  }
  if (/blocked|on.?hold|purple/.test(lower)) {
    return 'blocked';
  }

  return 'neutral';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant,
  showDot = true,
  status,
  className = '',
}) => {
  const resolvedVariant = variant ?? (status ? variantFromStatus(status) : 'neutral');

  return (
    <span className={`status-badge ${resolvedVariant} ${className}`}>
      {showDot && <span className="status-badge-dot" />}
      {label}
    </span>
  );
};

export default StatusBadge;
