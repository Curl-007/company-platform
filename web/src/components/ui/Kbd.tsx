import React from 'react';
import { cn } from './utils';

export const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        'ui-kbd inline-flex min-h-5 items-center justify-center rounded border border-[var(--border)] bg-[var(--muted)] px-1.5 font-mono text-[11px] leading-4 text-[var(--muted-foreground)]',
        className,
      )}
      data-slot="kbd"
      data-state="default"
      {...props}
    />
  ),
);

Kbd.displayName = 'Kbd';

export const KbdGroup = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span ref={ref} className={cn('ui-kbd-group inline-flex items-center gap-1', className)} data-slot="kbd-group" {...props} />
  ),
);

KbdGroup.displayName = 'KbdGroup';
