import React from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { cn } from './utils';

/**
 * Popover primitive built on base-ui. Provides Popover (root), PopoverTrigger,
 * PopoverContent. Use it as the host for Calendar, Combobox, and any floating
 * panel triggered by a button.
 */
export const Popover = BasePopover.Root;
export const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof BasePopover.Trigger>
>(({ className, ...props }, ref) => (
  <BasePopover.Trigger ref={ref} className={cn('ui-popover-trigger', className)} {...props} />
));
PopoverTrigger.displayName = 'PopoverTrigger';

export const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof BasePopover.Popup>
>(({ className, children, ...props }, ref) => (
  <BasePopover.Portal>
    <BasePopover.Positioner sideOffset={6} className="ui-popover-positioner">
      <BasePopover.Popup
        ref={ref}
        className={cn('ui-popover-content popover-content', className)}
        data-slot="popover-content"
        {...props}
      >
        {children}
      </BasePopover.Popup>
    </BasePopover.Positioner>
  </BasePopover.Portal>
));
PopoverContent.displayName = 'PopoverContent';
