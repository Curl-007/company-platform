import React from 'react';
import { cn } from './utils';

export function TooltipProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }

export function Tooltip({ children }: { children: React.ReactNode }) {
  return <span className="ui-tooltip" data-slot="tooltip">{children}</span>;
}

export const TooltipTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => <button ref={ref} {...props} type={props.type || 'button'} className={cn('ui-tooltip-trigger', className)} data-slot="tooltip-trigger" />,
);
TooltipTrigger.displayName = 'TooltipTrigger';

export function TooltipContent({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cn('ui-tooltip-content', className)} data-slot="tooltip-content" role="tooltip" />;
}
