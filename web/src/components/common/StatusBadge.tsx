import React from 'react';
import { Badge, cn, type BadgeVariant } from '../ui';

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
  if (/blocked|on.?hold|purple/.test(lower)) {
    return 'blocked';
  }
  if (/risk|error|failed|critical|red|blocked|rejected/.test(lower)) {
    return 'risk';
  }
  if (/info|in.?progress|running|development|testing|blue/.test(lower)) {
    return 'info';
  }
  return 'neutral';
}

function primitiveVariantForStatus(variant: StatusBadgeVariant): BadgeVariant {
  if (variant === 'success' || variant === 'green') return 'success';
  if (variant === 'warning' || variant === 'amber') return 'warning';
  if (variant === 'risk' || variant === 'red') return 'destructive';
  if (variant === 'info' || variant === 'blue') return 'info';
  return 'secondary';
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
    <Badge
      className={cn('status-badge ui-status-badge', resolvedVariant, className)}
      variant={primitiveVariantForStatus(resolvedVariant)}
      data-status-variant={resolvedVariant}
    >
      {showDot && <span className="status-badge-dot" />}
      {label}
    </Badge>
  );
};

export default StatusBadge;
