import React from 'react';
import { cn } from './utils';

const MenuContext = React.createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

export function Menu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return <MenuContext.Provider value={{ open, setOpen }}><div className="ui-menu" data-state={open ? 'open' : 'closed'}>{children}</div></MenuContext.Provider>;
}

export const MenuTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, onClick, ...props }, ref) => {
    const context = React.useContext(MenuContext);
    return <button ref={ref} {...props} type={props.type || 'button'} className={className} aria-expanded={context?.open} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) context?.setOpen(!context.open); }} />;
  },
);
MenuTrigger.displayName = 'MenuTrigger';

export function MenuContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(MenuContext);
  if (!context?.open) return null;
  return <div {...props} className={cn('ui-menu-content', className)} role="menu" data-slot="menu-content" />;
}

export function MenuItem({ className, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = React.useContext(MenuContext);
  return <button {...props} type={props.type || 'button'} className={cn('ui-menu-item', className)} role="menuitem" onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) context?.setOpen(false); }} />;
}

export const DropdownMenu = Menu;
export const DropdownMenuTrigger = MenuTrigger;
export const DropdownMenuContent = MenuContent;
export const DropdownMenuItem = MenuItem;
