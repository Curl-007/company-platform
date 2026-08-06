import React from 'react';
import { cn } from './utils';

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Pixel size of the spinner. */
  size?: number;
  /** Accessible label announced to screen readers. */
  label?: string;
}

/**
 * Single canonical loading spinner. Replaces the bespoke border-spinner that was
 * duplicated in DataTable and PageState. Relies on the global .ui-spinner class
 * which honors prefers-reduced-motion (animation is disabled there).
 */
export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, size = 16, label = '加载中', style, ...props }, ref) => (
    <span
      ref={ref}
      role="status"
      aria-label={label}
      className={cn('ui-spinner', className)}
      style={{ width: size, height: size, ...style }}
      data-slot="spinner"
      {...props}
    />
  ),
);

Spinner.displayName = 'Spinner';
