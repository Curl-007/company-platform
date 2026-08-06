import React from 'react';
import { cn } from './utils';

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'ui-badge inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-5',
        variant === 'default' && 'border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]',
        variant === 'secondary' && 'border-transparent bg-[var(--secondary)] text-[var(--secondary-foreground)]',
        variant === 'outline' && 'border-[var(--border)] bg-transparent text-[var(--foreground)]',
        variant === 'destructive' && 'border-transparent bg-[var(--destructive)] text-[var(--destructive-foreground)]',
        variant === 'success' && 'border-transparent bg-[var(--success)] text-[var(--success-foreground)]',
        variant === 'warning' && 'border-transparent bg-[var(--warning)] text-[var(--warning-foreground)]',
        variant === 'info' && 'border-transparent bg-[var(--info)] text-[var(--info-foreground)]',
        className,
      )}
      data-slot="badge"
      data-state="default"
      data-variant={variant}
      {...props}
    />
  ),
);

Badge.displayName = 'Badge';
