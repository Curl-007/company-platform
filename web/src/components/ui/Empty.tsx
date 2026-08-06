import React from 'react';
import { cn } from './utils';

export const Empty = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('ui-empty flex min-h-32 flex-col items-center justify-center gap-3 p-6 text-center', className)}
      role="status"
      aria-live="polite"
      data-slot="empty"
      data-state="empty"
      {...props}
    />
  ),
);

Empty.displayName = 'Empty';

export const EmptyMedia = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('ui-empty-media flex size-10 items-center justify-center text-[var(--muted-foreground)]', className)} data-slot="empty-media" {...props} />
  ),
);

EmptyMedia.displayName = 'EmptyMedia';

export const EmptyHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('ui-empty-header space-y-1', className)} data-slot="empty-header" {...props} />
  ),
);

EmptyHeader.displayName = 'EmptyHeader';

export const EmptyTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('ui-empty-title text-sm font-semibold text-[var(--foreground)]', className)} data-slot="empty-title" {...props} />
  ),
);

EmptyTitle.displayName = 'EmptyTitle';

export const EmptyDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('ui-empty-description max-w-sm text-sm text-[var(--muted-foreground)]', className)} data-slot="empty-description" {...props} />
  ),
);

EmptyDescription.displayName = 'EmptyDescription';

export const EmptyContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('ui-empty-content flex items-center gap-2', className)} data-slot="empty-content" {...props} />
  ),
);

EmptyContent.displayName = 'EmptyContent';
