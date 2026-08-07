import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import i18n, { LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, type SupportedLocale } from './index';

interface LanguageContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() =>
    i18n.resolvedLanguage?.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN',
  );

  const setLocale = useCallback((next: SupportedLocale) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // 存储不可用时语言切换仍生效（仅本次会话）。
    }
    document.documentElement.lang = next;
    void i18n.changeLanguage(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLocale(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLocale 必须在 <LanguageProvider> 内使用');
  return context;
}
