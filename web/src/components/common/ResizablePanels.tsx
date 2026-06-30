import { useRef, useState, type ReactNode } from 'react';

interface ResizablePanelsProps {
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  leftDefault?: number;
  rightDefault?: number;
  leftMin?: number;
  leftMax?: number;
  rightMin?: number;
  rightMax?: number;
  className?: string;
}

function ResizablePanels({
  left,
  right,
  children,
  leftDefault = 260,
  rightDefault = 300,
  leftMin = 180,
  leftMax = 420,
  rightMin = 220,
  rightMax = 460,
  className = '',
}: ResizablePanelsProps) {
  const [leftWidth, setLeftWidth] = useState(leftDefault);
  const [rightWidth, setRightWidth] = useState(rightDefault);
  const drag = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(null);

  function startDrag(side: 'left' | 'right', event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      side,
      startX: event.clientX,
      startWidth: side === 'left' ? leftWidth : rightWidth,
    };
  }

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;

    const delta = event.clientX - current.startX;
    if (current.side === 'left') {
      setLeftWidth(Math.max(leftMin, Math.min(leftMax, current.startWidth + delta)));
    } else {
      setRightWidth(Math.max(rightMin, Math.min(rightMax, current.startWidth - delta)));
    }
  }

  function stopDrag() {
    drag.current = null;
  }

  const Handle = ({ side }: { side: 'left' | 'right' }) => (
    <div
      className="resizable-handle"
      onPointerDown={(event) => startDrag(side, event)}
      aria-label="调整分栏宽度"
      role="separator"
    >
      <span />
    </div>
  );

  return (
    <div className={`resizable-panels ${className}`} onPointerMove={handleMove} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      {left && (
        <>
          <aside className="resizable-panel resizable-panel-left" style={{ width: leftWidth }}>
            {left}
          </aside>
          <Handle side="left" />
        </>
      )}
      <main className="resizable-panel-main">{children}</main>
      {right && (
        <>
          <Handle side="right" />
          <aside className="resizable-panel resizable-panel-right" style={{ width: rightWidth }}>
            {right}
          </aside>
        </>
      )}
    </div>
  );
}

export default ResizablePanels;
