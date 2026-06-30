import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Toast: lightweight global notification system.
//
// Usage:
//   const toast = useToast();
//   toast.success('已删除');
//   toast.error('操作失败');
//
// Wrap the app in <ToastProvider>. Toasts auto-dismiss after 3.5s and stack
// top-right. No external dependency.
// ---------------------------------------------------------------------------

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = ++counter;
    setItems((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => remove(id), 3500);
  }, [remove]);

  const value = React.useMemo<ToastContextValue>(() => ({
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    info: (m: string) => push('info', m),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`} role="alert">
            <span className="toast-icon">
              {item.tone === 'success' && <CheckCircle2 size={18} />}
              {item.tone === 'error' && <AlertCircle size={18} />}
              {item.tone === 'info' && <Info size={18} />}
            </span>
            <span className="toast-message">{item.message}</span>
            <button className="toast-close" onClick={() => remove(item.id)} aria-label="关闭">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
