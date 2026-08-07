import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type ConfirmTone = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
}

interface ConfirmState extends Required<Omit<ConfirmOptions, 'description'>> {
  description?: string;
  resolve: (confirmed: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<ConfirmState | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const close = useCallback((confirmed: boolean) => {
    setState((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({
        title: options.title,
        description: options.description,
        confirmText: options.confirmText ?? t('common.confirm'),
        cancelText: options.cancelText ?? t('common.cancel'),
        tone: options.tone ?? 'danger',
        resolve,
      });
    });
  }, [t]);

  useEffect(() => {
    if (!state) return undefined;
    previousFocus.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.setTimeout(() => {
      const node = dialogRef.current;
      const first = node?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node)?.focus();
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const node = dialogRef.current;
      const focusables = node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [close, state]);

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm]);
  const isDanger = state?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state ? (
        <div className="confirm-backdrop" onClick={() => close(false)}>
          <div
            ref={dialogRef}
            className={`confirm-dialog confirm-${state.tone}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="confirm-close" onClick={() => close(false)} aria-label={t('common.close')}>
              <X size={16} />
            </button>
            <div className="confirm-icon">
              {isDanger || state.tone === 'warning' ? <AlertTriangle size={22} /> : <Info size={22} />}
            </div>
            <div className="confirm-content">
              <h2 id="confirm-title">{state.title}</h2>
              {state.description ? <p>{state.description}</p> : null}
            </div>
            <div className="confirm-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => close(false)}>
                {state.cancelText}
              </button>
              <button className={`btn btn-sm ${isDanger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
};

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx.confirm;
}
