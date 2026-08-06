import { type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
} from '../ui';

// Keep the historical Overlay API while routing every business modal through
// the shared dialog primitive. This lets existing forms migrate incrementally.

interface OverlayProps {
  children: ReactNode;
  onClose: () => void;
  maxWidth?: number;
  /** ID of an element inside the dialog that provides its accessible name. */
  ariaLabelledby?: string;
  /** Accessible name used when the dialog has no visible labelled element. */
  ariaLabel?: string;
}

function Overlay({
  children,
  onClose,
  maxWidth = 560,
  ariaLabelledby,
  ariaLabel,
}: OverlayProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="app-overlay-dialog max-h-[calc(100dvh_-_clamp(16px,4vh,48px))] max-w-none border-0 bg-transparent p-0 shadow-none"
        style={{ maxWidth }}
        showClose={false}
        aria-labelledby={ariaLabelledby}
        aria-label={ariaLabel ?? (ariaLabelledby ? undefined : '对话框')}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

export default Overlay;
