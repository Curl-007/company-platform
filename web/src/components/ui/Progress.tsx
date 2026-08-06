import React from 'react';
import { cn } from './utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number | null;
  max?: number;
  indicatorClassName?: string;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, indicatorClassName, ...props }, ref) => {
    const boundedMax = max > 0 ? max : 100;
    const boundedValue = value === null ? null : Math.min(Math.max(value, 0), boundedMax);
    const percentage = boundedValue === null ? 0 : (boundedValue / boundedMax) * 100;

    return (
      <div
        ref={ref}
        className={cn('ui-progress relative h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]', className)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={boundedMax}
        aria-valuenow={boundedValue === null ? undefined : boundedValue}
        aria-busy={boundedValue === null || undefined}
        data-slot="progress"
        data-state={boundedValue === null ? 'indeterminate' : 'determinate'}
        data-value={boundedValue === null ? undefined : boundedValue}
        {...props}
      >
        <div
          className={cn('ui-progress-indicator h-full bg-[var(--primary)] transition-[width]', boundedValue === null && 'animate-pulse', indicatorClassName)}
          style={{ width: `${percentage}%` }}
          data-slot="progress-indicator"
          data-state={boundedValue === null ? 'indeterminate' : 'determinate'}
        />
      </div>
    );
  },
);

Progress.displayName = 'Progress';
