import React from 'react';
import { cn } from './utils';

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal' | 'both';
}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, orientation = 'vertical', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'ui-scroll-area relative',
        orientation === 'vertical' && 'overflow-x-hidden overflow-y-auto',
        orientation === 'horizontal' && 'overflow-x-auto overflow-y-hidden',
        orientation === 'both' && 'overflow-auto',
        className,
      )}
      data-slot="scroll-area"
      data-orientation={orientation}
      data-state="default"
      {...props}
    />
  ),
);

ScrollArea.displayName = 'ScrollArea';
