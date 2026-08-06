import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn, composeEventHandlers, onlyElement, useControllableState } from './utils';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
type SheetSide = 'top' | 'right' | 'bottom' | 'left';

interface SheetContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
}

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const context = React.useContext(SheetContext);
  if (!context) throw new Error('Sheet components must be used within <Sheet>');
  return context;
}

export interface SheetProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Sheet({ open: openProp, defaultOpen = false, onOpenChange, children }: SheetProps) {
  const [open, setOpen] = useControllableState({ prop: openProp, defaultProp: defaultOpen, onChange: onOpenChange });
  const id = React.useId();
  const triggerRef = React.useRef<HTMLElement | null>(null);

  return (
    <SheetContext.Provider value={{ open, setOpen, titleId: `${id}-title`, descriptionId: `${id}-description`, triggerRef }}>
      <div className="ui-sheet" data-slot="sheet" data-state={open ? 'open' : 'closed'}>
        {children}
      </div>
    </SheetContext.Provider>
  );
}

export interface SheetTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const SheetTrigger = React.forwardRef<HTMLButtonElement, SheetTriggerProps>(
  ({ className, asChild = false, children, onClick, ...props }, ref) => {
    const context = useSheetContext();
    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      context.triggerRef.current = event.currentTarget;
      context.setOpen(true);
    };

    if (asChild) {
      const child = onlyElement(children);
      return React.cloneElement(child, {
        ...props,
        className: cn(className, child.props.className as string | undefined),
        onClick: composeEventHandlers<React.MouseEvent<HTMLElement>>(child.props.onClick, handleClick),
        'aria-haspopup': 'dialog',
        'aria-expanded': context.open,
        'data-slot': 'sheet-trigger',
        'data-state': context.open ? 'open' : 'closed',
      });
    }

    return (
      <button
        ref={ref}
        type="button"
        className={cn('ui-sheet-trigger', className)}
        aria-haspopup="dialog"
        aria-expanded={context.open}
        data-slot="sheet-trigger"
        data-state={context.open ? 'open' : 'closed'}
        onClick={composeEventHandlers<React.MouseEvent<HTMLButtonElement>>(onClick, handleClick)}
        {...props}
      >
        {children}
      </button>
    );
  },
);

SheetTrigger.displayName = 'SheetTrigger';

export interface SheetCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const SheetClose = React.forwardRef<HTMLButtonElement, SheetCloseProps>(
  ({ className, asChild = false, children, onClick, ...props }, ref) => {
    const context = useSheetContext();
    const handleClick = () => context.setOpen(false);

    if (asChild) {
      const child = onlyElement(children);
      return React.cloneElement(child, {
        ...props,
        className: cn(className, child.props.className as string | undefined),
        onClick: composeEventHandlers<React.MouseEvent<HTMLElement>>(child.props.onClick, handleClick),
        'data-slot': 'sheet-close',
        'data-state': context.open ? 'open' : 'closed',
      });
    }

    return (
      <button
        ref={ref}
        type="button"
        className={cn('ui-sheet-close', className)}
        onClick={composeEventHandlers<React.MouseEvent<HTMLButtonElement>>(onClick, handleClick)}
        data-slot="sheet-close"
        data-state={context.open ? 'open' : 'closed'}
        {...props}
      >
        {children}
      </button>
    );
  },
);

SheetClose.displayName = 'SheetClose';

export interface SheetOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  onInteractOutside?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export const SheetOverlay = React.forwardRef<HTMLDivElement, SheetOverlayProps>(
  ({ className, onPointerDown, onInteractOutside, ...props }, ref) => {
    const context = useSheetContext();
    if (!context.open) return null;

    return (
      <div
        ref={ref}
        className={cn('ui-sheet-overlay fixed inset-0 z-50 bg-black/50', className)}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (!event.defaultPrevented && event.target === event.currentTarget) {
            onInteractOutside?.(event);
            if (!event.defaultPrevented) context.setOpen(false);
          }
        }}
        data-slot="sheet-overlay"
        data-state="open"
        {...props}
      />
    );
  },
);

SheetOverlay.displayName = 'SheetOverlay';

export interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: SheetSide;
  showClose?: boolean;
  onInteractOutside?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, side = 'right', showClose = true, onPointerDown, onInteractOutside, children, ...props }, ref) => {
    const context = useSheetContext();
    const contentRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      if (!context.open || typeof document === 'undefined') return undefined;
      const previousFocus = document.activeElement as HTMLElement | null;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const node = contentRef.current;
      const focusables = node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
      (focusables[0] ?? node)?.focus();

      function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
          event.preventDefault();
          context.setOpen(false);
          return;
        }
        if (event.key !== 'Tab' || !node) return;
        const currentFocusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!currentFocusables.length) {
          event.preventDefault();
          node.focus();
          return;
        }
        const first = currentFocusables[0];
        const last = currentFocusables[currentFocusables.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === node)) {
          event.preventDefault();
          first.focus();
        }
      }

      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.removeEventListener('keydown', onKeyDown);
        document.body.style.overflow = previousOverflow;
        previousFocus?.focus();
      };
    }, [context.open, context.setOpen]);

    if (!context.open || typeof document === 'undefined') return null;

    const sideClass = {
      right: 'inset-y-0 right-0 w-[min(100%,28rem)] border-l',
      left: 'inset-y-0 left-0 w-[min(100%,28rem)] border-r',
      top: 'inset-x-0 top-0 max-h-[85vh] border-b',
      bottom: 'inset-x-0 bottom-0 max-h-[85vh] border-t',
    }[side];

    return createPortal(
      <>
        <SheetOverlay onInteractOutside={onInteractOutside} />
        <div
          className="ui-sheet-portal fixed inset-0 z-[51]"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              onInteractOutside?.(event);
              if (!event.defaultPrevented) context.setOpen(false);
            }
          }}
          data-slot="sheet-portal"
          data-state="open"
        >
          <div
            ref={(node) => {
              contentRef.current = node;
              if (typeof ref === 'function') ref(node);
              else if (ref) ref.current = node;
            }}
            className={cn('ui-sheet-content fixed flex h-full flex-col gap-4 overflow-y-auto border-[var(--border)] bg-[var(--card)] p-6 text-[var(--card-foreground)] shadow-xl outline-none', sideClass, side === 'top' || side === 'bottom' ? 'h-auto w-full' : '', className)}
            role="dialog"
            aria-modal="true"
            aria-labelledby={props['aria-labelledby'] ?? context.titleId}
            aria-describedby={props['aria-describedby'] ?? context.descriptionId}
            tabIndex={-1}
            onPointerDown={(event) => {
              event.stopPropagation();
              onPointerDown?.(event);
            }}
            data-slot="sheet-content"
            data-state="open"
            data-side={side}
            {...props}
          >
            {children}
            {showClose ? (
              <button
                type="button"
                className="ui-sheet-close absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                aria-label="Close"
                onClick={() => context.setOpen(false)}
                data-slot="sheet-close-button"
                data-state="open"
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </>,
      document.body,
    );
  },
);

SheetContent.displayName = 'SheetContent';

export const SheetHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('ui-sheet-header flex flex-col gap-1.5 text-left', className)} data-slot="sheet-header" {...props} />,
);

SheetHeader.displayName = 'SheetHeader';

export const SheetFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('ui-sheet-footer mt-auto flex justify-end gap-2', className)} data-slot="sheet-footer" {...props} />,
);

SheetFooter.displayName = 'SheetFooter';

export const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, id, ...props }, ref) => {
    const context = useSheetContext();
    return <h2 ref={ref} id={id ?? context.titleId} className={cn('ui-sheet-title text-lg font-semibold', className)} data-slot="sheet-title" {...props} />;
  },
);

SheetTitle.displayName = 'SheetTitle';

export const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, id, ...props }, ref) => {
    const context = useSheetContext();
    return <p ref={ref} id={id ?? context.descriptionId} className={cn('ui-sheet-description text-sm text-[var(--muted-foreground)]', className)} data-slot="sheet-description" {...props} />;
  },
);

SheetDescription.displayName = 'SheetDescription';
