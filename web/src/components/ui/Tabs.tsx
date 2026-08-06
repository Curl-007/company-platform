import React from 'react';
import { cn, useControllableState } from './utils';

type TabsOrientation = 'horizontal' | 'vertical';

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  orientation: TabsOrientation;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error('Tabs components must be used within <Tabs>');
  return context;
}

function tabId(baseId: string, value: string) {
  return `${baseId}-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  orientation?: TabsOrientation;
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, defaultValue = '', value: valueProp, onValueChange, orientation = 'horizontal', children, ...props }, ref) => {
    const [value, setValue] = useControllableState({ prop: valueProp, defaultProp: defaultValue, onChange: onValueChange });
    const baseId = React.useId();

    return (
      <TabsContext.Provider value={{ value, setValue, orientation, baseId }}>
        <div
          ref={ref}
          className={cn('ui-tabs', orientation === 'vertical' && 'flex gap-4', className)}
          data-slot="tabs"
          data-state="active"
          data-orientation={orientation}
          {...props}
        >
          {children}
        </div>
      </TabsContext.Provider>
    );
  },
);

Tabs.displayName = 'Tabs';

export const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { orientation } = useTabsContext();
    return (
      <div
        ref={ref}
        className={cn(
          'ui-tabs-list inline-flex items-center border-b border-[var(--border)]',
          orientation === 'vertical' && 'h-fit flex-col items-stretch border-b-0 border-r',
          className,
        )}
        role="tablist"
        aria-orientation={orientation}
        data-slot="tabs-list"
        data-state="default"
        data-orientation={orientation}
        {...props}
      />
    );
  },
);

TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, onClick, onKeyDown, disabled = false, children, ...props }, ref) => {
    const context = useTabsContext();
    const active = context.value === value;
    const triggerId = tabId(context.baseId, value);
    const contentId = `${triggerId}-content`;

    function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      const horizontalKey = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const verticalKey = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      if ((context.orientation === 'horizontal' && !horizontalKey) || (context.orientation === 'vertical' && !verticalKey)) {
        if (event.key !== 'Home' && event.key !== 'End') return;
      }

      const list = event.currentTarget.closest('[role="tablist"]');
      const triggers = list
        ? Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'))
        : [];
      if (!triggers.length) return;

      let nextIndex = triggers.indexOf(event.currentTarget);
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = triggers.length - 1;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (nextIndex + 1) % triggers.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (nextIndex - 1 + triggers.length) % triggers.length;
      else return;

      event.preventDefault();
      const nextTrigger = triggers[nextIndex];
      nextTrigger.focus();
      context.setValue(nextTrigger.dataset.value ?? value);
    }

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'ui-tabs-trigger inline-flex min-h-9 items-center justify-center border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors',
          'hover:text-[var(--foreground)] disabled:pointer-events-none disabled:opacity-50',
          active && 'border-[var(--primary)] text-[var(--foreground)]',
          context.orientation === 'vertical' && 'w-full justify-start border-b-0 border-r-2',
          className,
        )}
        role="tab"
        aria-selected={active}
        aria-controls={contentId}
        aria-disabled={disabled || undefined}
        tabIndex={active ? 0 : -1}
        disabled={disabled}
        data-slot="tabs-trigger"
        data-state={active ? 'active' : 'inactive'}
        data-value={value}
        id={triggerId}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented && !disabled) context.setValue(value);
        }}
        onKeyDown={handleKeyDown}
        {...props}
      >
        {children}
      </button>
    );
  },
);

TabsTrigger.displayName = 'TabsTrigger';

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  forceMount?: boolean;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, forceMount = false, children, ...props }, ref) => {
    const context = useTabsContext();
    const active = context.value === value;
    const triggerId = tabId(context.baseId, value);

    if (!active && !forceMount) return null;

    return (
      <div
        ref={ref}
        className={cn('ui-tabs-content mt-2 outline-none', className)}
        role="tabpanel"
        aria-labelledby={triggerId}
        hidden={!active}
        tabIndex={0}
        data-slot="tabs-content"
        data-state={active ? 'active' : 'inactive'}
        data-value={value}
        id={`${triggerId}-content`}
        {...props}
      >
        {children}
      </div>
    );
  },
);

TabsContent.displayName = 'TabsContent';
