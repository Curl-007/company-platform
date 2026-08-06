import React from 'react';
import { cn } from './utils';

interface CommandContextValue {
  items: React.MutableRefObject<HTMLElement[]>;
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  onSelect?: (value: string) => void;
}

const CommandContext = React.createContext<CommandContextValue | null>(null);

export function Command({ className, children, onSelect, ...props }: Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  onSelect?: (value: string) => void;
}) {
  const items = React.useRef<HTMLElement[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);

  return (
    <CommandContext.Provider value={{ items, activeIndex, setActiveIndex, onSelect }}>
      <div
        {...props}
        className={cn('ui-command', className)}
        data-slot="command"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, Math.min(items.current.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            items.current[activeIndex]?.click();
          }
          props.onKeyDown?.(event);
        }}
      >
        {children}
      </div>
    </CommandContext.Provider>
  );
}

export const CommandInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} {...props} className={cn('ui-command-input', className)} data-slot="command-input" />,
);
CommandInput.displayName = 'CommandInput';

export function CommandList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('ui-command-list', className)} data-slot="command-list" role="listbox" />;
}

export function CommandEmpty({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('ui-command-empty', className)} data-slot="command-empty" />;
}

export function CommandGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('ui-command-group', className)} data-slot="command-group" role="group" />;
}

export function CommandItem({ className, value, onSelect, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
  onSelect?: (value: string) => void;
}) {
  const context = React.useContext(CommandContext);
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!context || !ref.current) return undefined;
    context.items.current = [...context.items.current.filter((item) => item !== ref.current), ref.current];
    return () => {
      context.items.current = context.items.current.filter((item) => item !== ref.current);
    };
  }, [context]);
  const active = Boolean(context && context.items.current[context.activeIndex] === ref.current);
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn('ui-command-item', className)}
      data-slot="command-item"
      data-active={active ? 'true' : 'false'}
      role="option"
      aria-selected={active}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) {
          onSelect?.(value);
          context?.onSelect?.(value);
        }
      }}
    >
      {children}
    </button>
  );
}
