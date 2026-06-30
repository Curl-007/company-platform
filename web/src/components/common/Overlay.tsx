import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// Overlay: lightweight modal backdrop with accessibility.
//
// - Click outside (backdrop) to dismiss
// - ESC key to dismiss
// - Focus trap: focus moves into the dialog on open, Tab cycles within, and
//   focus is restored to the trigger on close
// - role="dialog" + aria-modal for screen readers
// ---------------------------------------------------------------------------

interface OverlayProps {
  children: ReactNode;
  onClose: () => void;
  maxWidth?: number;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function Overlay({ children, onClose, maxWidth = 560 }: OverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;

    // Move focus into the dialog.
    const node = dialogRef.current;
    if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && node) {
        const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    // Prevent background scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      previousFocus.current?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="app-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 12, 0.76)',
        backdropFilter: 'blur(22px) saturate(140%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(8px, 2vh, 24px) 16px',
        overflow: 'hidden',
        zIndex: 80,
      }}
    >
      <div
        className="app-overlay-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: 'calc(100dvh - clamp(16px, 4vh, 48px))',
          outline: 'none',
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default Overlay;
