import type { ReactNode } from 'react';
import MetricCard, {
  type MetricCardSize,
  type MetricCardTone,
  type MetricTrendDirection,
} from './MetricCard';

// ---------------------------------------------------------------------------
// MetricStrip: shared container for KPI rows/grids built on MetricCard.
// Variants map to existing host class systems (grid strip, bar, hero).
// ---------------------------------------------------------------------------

export type MetricStripItem = {
  label: string;
  /** ReactNode so animated counters (e.g. CountUp) can be passed directly. */
  value: ReactNode;
  caption?: string;
  trend?: string;
  trendDirection?: MetricTrendDirection;
  icon?: ReactNode;
  tone?: MetricCardTone;
  size?: MetricCardSize;
  className?: string;
};

export type MetricStripVariant = 'grid' | 'bar' | 'hero';

const VARIANT_CLASS: Record<MetricStripVariant, string> = {
  grid: 'metric-grid',
  bar: 'metric-bar',
  hero: 'kpi-hero-grid',
};

export default function MetricStrip({
  items,
  variant = 'grid',
  className = '',
}: {
  items: MetricStripItem[];
  variant?: MetricStripVariant;
  className?: string;
}) {
  const rootClass = [VARIANT_CLASS[variant], className].filter(Boolean).join(' ');

  return (
    <div className={rootClass}>
      {items.map((item) => (
        <MetricCard
          key={item.label}
          label={item.label}
          value={item.value}
          caption={item.caption}
          trend={item.trend}
          trendDirection={item.trendDirection}
          icon={item.icon}
          tone={item.tone}
          size={item.size ?? (variant === 'hero' ? 'hero' : 'default')}
          className={item.className}
        />
      ))}
    </div>
  );
}
