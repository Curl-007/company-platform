import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

/** localStorage 键，沿用 settingsModel 的 app: 前缀风格。 */
export const LOCALE_STORAGE_KEY = 'app:locale';

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    fallbackLng: 'zh-CN',
    supportedLngs: [...SUPPORTED_LOCALES],
    load: 'currentOnly',
    // 资源内联、无异步 backend，同步完成 init 使 t() 立即可用
    // （测试环境与模块加载期均不依赖 init promise 时序）。
    initAsync: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: { useSuspense: false },
  });

/**
 * 当前生效的界面语言（zh-CN / en-US）。
 * 供非 React 模块（model / helper 文件）读取，组件优先使用 useLocale()。
 */
export function getInterfaceLocale(): SupportedLocale {
  return i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

export default i18n;
