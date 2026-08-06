import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn, composeEventHandlers, onlyElement, useControllableState } from './utils';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = React.useContext(DialogContext);
  if (!context) throw new Error('Dialog components must be used within <Dialog>');
  return context;
}

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open: openProp, defaultOpen = false, onOpenChange, children }: DialogProps) {
  const [open, setOpen] = useControllableState({ prop: openProp, defaultProp: defaultOpen, onChange: onOpenChange });
  const id = React.useId();
  const triggerRef = React.useRef<HTMLElement | null>(null);

  return (
    <DialogContext.Provider value={{ open, setOpen, titleId: `${id}-title`, descriptionId: `${id}-description`, triggerRef }}>
      <div className="ui-dialog" data-slot="dialog" data-state={open ? 'open' : 'closed'}>
        {children}
      </div>
    </DialogContext.Provider>
  );
}

export interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ className, asChild = false, children, onClick, ...props }, ref) => {
    const context = useDialogContext();
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
        'data-slot': 'dialog-trigger',
        'data-state': context.open ? 'open' : 'closed',
      });
    }

    return (
      <button
        ref={ref}
        type="button"
        className={cn('ui-dialog-trigger', className)}
        aria-haspopup="dialog"
        aria-expanded={context.open}
        data-slot="dialog-trigger"
        data-state={context.open ? 'open' : 'closed'}
        onClick={composeEventHandlers<React.MouseEvent<HTMLButtonElement>>(onClick, handleClick)}
        {...props}
      >
        {children}
      </button>
    );
  },
);

DialogTrigger.displayName = 'DialogTrigger';

export interface DialogCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const DialogClose = React.forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ className, asChild = false, children, onClick, ...props }, ref) => {
    const context = useDialogContext();
    const handleClick = () => context.setOpen(false);

    if (asChild) {
      const child = onlyElement(children);
      return React.cloneElement(child, {
        ...props,
        className: cn(className, child.props.className as string | undefined),
        onClick: composeEventHandlers<React.MouseEvent<HTMLElement>>(child.props.onClick, handleClick),
        'data-slot': 'dialog-close',
        'data-state': context.open ? 'open' : 'closed',
      });
    }

    return (
      <button
        ref={ref}
        type="button"
        className={cn('ui-dialog-close', className)}
        onClick={composeEventHandlers<React.MouseEvent<HTMLButtonElement>>(onClick, handleClick)}
        data-slot="dialog-close"
        data-state={context.open ? 'open' : 'closed'}
        {...props}
      >
        {children}
      </button>
    );
  },
);

DialogClose.displayName = 'DialogClose';

export interface DialogOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  onInteractOutside?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export const DialogOverlay = React.forwardRef<HTMLDivElement, DialogOverlayProps>(
  ({ className, onPointerDown, onInteractOutside, ...props }, ref) => {
    const context = useDialogContext();
    if (!context.open) return null;

    return (
      <div
        ref={ref}
        className={cn('ui-dialog-overlay fixed inset-0 z-50 bg-black/50', className)}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (!event.defaultPrevented && event.target === event.currentTarget) {
            onInteractOutside?.(event);
            if (!event.defaultPrevented) context.setOpen(false);
          }
        }}
        data-slot="dialog-overlay"
        data-state="open"
        {...props}
      />
    );
  },
);

DialogOverlay.displayName = 'DialogOverlay';

export interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  showClose?: boolean;
  onInteractOutside?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, showClose = true, onPointerDown, onInteractOutside, children, ...props }, ref) => {
    const context = useDialogContext();
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

    return createPortal(
      <>
        <DialogOverlay onInteractOutside={onInteractOutside} />
        <div
          className="ui-dialog-portal fixed inset-0 z-[51] flex items-center justify-center p-4"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              onInteractOutside?.(event);
              if (!event.defaultPrevented) context.setOpen(false);
            }
          }}
          data-slot="dialog-portal"
          data-state="open"
        >
          <div
            ref={(node) => {
              contentRef.current = node;
              if (typeof ref === 'function') ref(node);
              else if (ref) ref.current = node;
            }}
            className={cn('ui-dialog-content relative w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--card-foreground)] shadow-xl outline-none', className)}
            role="dialog"
            aria-modal="true"
            aria-labelledby={props['aria-labelledby'] ?? `${context.titleId}`}
            aria-describedby={props['aria-describedby'] ?? `${context.descriptionId}`}
            tabIndex={-1}
            onPointerDown={(event) => {
              event.stopPropagation();
              onPointerDown?.(event);
            }}
            data-slot="dialog-content"
            data-state="open"
            {...props}
          >
            {children}
            {showClose ? (
              <button
                type="button"
                className="ui-dialog-close absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                aria-label="Close"
                onClick={() => context.setOpen(false)}
                data-slot="dialog-close-button"
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

DialogContent.displayName = 'DialogContent';

export const DialogHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('ui-dialog-header flex flex-col gap-1.5 text-left', className)} data-slot="dialog-header" {...props} />,
);

DialogHeader.displayName = 'DialogHeader';

export const DialogFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('ui-dialog-footer mt-6 flex justify-end gap-2', className)} data-slot="dialog-footer" {...props} />,
);

DialogFooter.displayName = 'DialogFooter';

export const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, id, ...props }, ref) => {
    const context = useDialogContext();
    return <h2 ref={ref} id={id ?? context.titleId} className={cn('ui-dialog-title text-lg font-semibold', className)} data-slot="dialog-title" {...props} />;
  },
);

DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, id, ...props }, ref) => {
    const context = useDialogContext();
    return <p ref={ref} id={id ?? context.descriptionId} className={cn('ui-dialog-description text-sm text-[var(--muted-foreground)]', className)} data-slot="dialog-description" {...props} />;
  },
);

DialogDescription.displayName = 'DialogDescription';
