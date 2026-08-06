import React from 'react';
import { cn } from './utils';

export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('ui-skeleton animate-pulse rounded-md bg-[var(--muted)]', className)}
      aria-hidden="true"
      data-slot="skeleton"
      data-state="loading"
      {...props}
    />
  ),
);

Skeleton.displayName = 'Skeleton';
