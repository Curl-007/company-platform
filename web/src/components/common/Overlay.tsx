import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Overlay: lightweight modal backdrop. Click outside to dismiss; inner content
// stops propagation. Used for create forms and detail drawers.
// ---------------------------------------------------------------------------

interface OverlayProps {
  children: ReactNode;
  onClose: () => void;
  maxWidth?: number;
}

function Overlay({ children, onClose, maxWidth = 560 }: OverlayProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px',
        overflowY: 'auto',
        zIndex: 50,
      }}
    >
      <div onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth }}>
        {children}
      </div>
    </div>
  );
}

export default Overlay;
