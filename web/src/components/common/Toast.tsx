import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { subscribeToAsyncRefreshFailures } from '../../services/asyncRefreshEvents';

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
  dedupeKey?: string;
  action?: ToastAction;
}

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface PushOptions {
  dedupeKey?: string;
  action?: ToastAction;
  autoDismissMs?: number | null;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());
  const idsByDedupeKey = useRef(new Map<string, number>());
  const dedupeKeysById = useRef(new Map<number, string>());

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const remove = useCallback((id: number) => {
    clearTimer(id);
    const dedupeKey = dedupeKeysById.current.get(id);
    if (dedupeKey) {
      idsByDedupeKey.current.delete(dedupeKey);
      dedupeKeysById.current.delete(id);
    }
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, [clearTimer]);

  const push = useCallback((tone: ToastTone, message: string, options: PushOptions = {}) => {
    const existingId = options.dedupeKey
      ? idsByDedupeKey.current.get(options.dedupeKey)
      : undefined;
    const id = existingId ?? ++counter;
    const item: ToastItem = {
      id,
      tone,
      message,
      dedupeKey: options.dedupeKey,
      action: options.action,
    };

    if (options.dedupeKey && existingId === undefined) {
      idsByDedupeKey.current.set(options.dedupeKey, id);
      dedupeKeysById.current.set(id, options.dedupeKey);
    }

    setItems((prev) => {
      const exists = prev.some((toast) => toast.id === id);
      if (!exists) return [...prev, item];
      return prev.map((toast) => (toast.id === id ? item : toast));
    });

    clearTimer(id);
    const autoDismissMs = options.autoDismissMs === undefined ? 3500 : options.autoDismissMs;
    if (autoDismissMs !== null) {
      timers.current.set(id, window.setTimeout(() => remove(id), autoDismissMs));
    }
  }, [remove]);

  useEffect(() => subscribeToAsyncRefreshFailures(({ detail }) => {
    push('error', t('common.refreshFailed', { message: detail.message }), {
      dedupeKey: `async-refresh:${detail.cacheKey}`,
      action: { label: t('common.retry'), onClick: detail.retry },
      autoDismissMs: 10_000,
    });
  }), [push, t]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
    idsByDedupeKey.current.clear();
    dedupeKeysById.current.clear();
  }, []);

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
            {item.action && (
              <button
                className="toast-action"
                type="button"
                onClick={() => {
                  remove(item.id);
                  item.action?.onClick();
                }}
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>{item.action.label}</span>
              </button>
            )}
            <button className="toast-close" onClick={() => remove(item.id)} aria-label={t('common.close')}>
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
