import React from 'react';

// ---------------------------------------------------------------------------
// MetricCard: displays a single metric with label, value, icon, and trend.
// Supports an emphasized "hero" variant for top-line KPIs and a compact
// variant for secondary stats.
// ---------------------------------------------------------------------------

export type MetricTrendDirection = 'up' | 'down' | 'flat';
export type MetricCardTone = 'default' | 'info' | 'success' | 'warning' | 'risk';
export type MetricCardSize = 'default' | 'hero';

interface MetricCardProps {
  /** The metric label, e.g. "Active Tasks" */
  label: string;
  /** The metric value. Accepts a ReactNode so animated counters (e.g. CountUp)
     can be passed in directly, in addition to plain strings/numbers. */
  value: React.ReactNode;
  /** Optional trend text, e.g. "+5 this week" */
  trend?: string;
  /** Trend direction for color coding */
  trendDirection?: MetricTrendDirection;
  /** Optional icon to display in a colored chip */
  icon?: React.ReactNode;
  /** Color tone for the icon chip / accent */
  tone?: MetricCardTone;
  /** Size variant: hero (large KPI) or default */
  size?: MetricCardSize;
  /** Optional secondary line shown under the value (e.g. sub-label) */
  caption?: string;
  /** Additional CSS class */
  className?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  trend,
  trendDirection = 'flat',
  icon,
  tone = 'default',
  size = 'default',
  caption,
  className = '',
}) => {
  const classes = ['metric-card', `tone-${tone}`, size === 'hero' ? 'metric-card-hero' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className="metric-card-head">
        {icon && <span className={`metric-card-icon chip-${tone}`}>{icon}</span>}
        <span className="metric-card-label">{label}</span>
      </div>
      <div className="metric-card-value">{value}</div>
      {caption && <div className="metric-card-caption">{caption}</div>}
      {trend && (
        <div className={`metric-card-trend ${trendDirection}`}>
          {trendDirection === 'up' && '▲ '}
          {trendDirection === 'down' && '▼ '}
          {trend}
        </div>
      )}
    </div>
  );
};

export default MetricCard;
