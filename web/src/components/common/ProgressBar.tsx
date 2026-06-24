import React from 'react';

// ---------------------------------------------------------------------------
// ProgressBar: horizontal progress indicator with optional label
// ---------------------------------------------------------------------------

export type ProgressBarVariant = 'success' | 'warning' | 'risk' | 'info' | 'blocked' | 'neutral';

interface ProgressBarProps {
  /** Progress percentage, 0-100 */
  percent: number;
  /** Visual variant for fill color */
  variant?: ProgressBarVariant;
  /** Show label above the bar */
  label?: string;
  /** Show percentage number on the right side of the label */
  showPercent?: boolean;
  /** Height of the track in pixels */
  height?: number;
  /** Additional CSS class */
  className?: string;
}

function variantFromPercent(pct: number): ProgressBarVariant {
  if (pct >= 75) return 'success';
  if (pct >= 50) return 'info';
  if (pct >= 25) return 'warning';
  return 'risk';
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  variant,
  label,
  showPercent = true,
  height = 6,
  className = '',
}) => {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const resolvedVariant = variant ?? variantFromPercent(clampedPercent);

  return (
    <div className={`progress-bar ${className}`}>
      {(label || showPercent) && (
        <div className="progress-bar-label">
          {label && <span>{label}</span>}
          {showPercent && <span>{clampedPercent}%</span>}
        </div>
      )}
      <div className="progress-bar-track" style={{ height }}>
        <div
          className={`progress-bar-fill ${resolvedVariant}`}
          style={{ width: `${clampedPercent}%` }}
          role="progressbar"
          aria-valuenow={clampedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
