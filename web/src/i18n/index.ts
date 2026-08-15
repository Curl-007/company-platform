import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCN from './locales/zh-CN.json';

/** localStorage 键，沿用 settingsModel 的 app: 前缀风格。 */
export const LOCALE_STORAGE_KEY = 'app:locale';

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// zh-CN 是 fallbackLng，同步内联保证 init 同步、t() 立即可用；其余语言包按需
// 动态加载（各自成独立 chunk），首屏不再背负非当前语言的翻译体积。
const localeLoaders: Record<SupportedLocale, (() => Promise<Record<string, unknown>>) | null> = {
  'zh-CN': null,
  'en-US': () => import('./locales/en-US.json').then((m) => m.default),
};
const loadedLocales = new Set<SupportedLocale>(['zh-CN']);

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
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
 * 按需加载并注册某语言包（幂等）。zh-CN 已内联，直接返回；其余语言首次调用时
 * 动态 import JSON 并 addResourceBundle。切换语言前应先 await 本函数。
 */
export async function ensureLocaleLoaded(locale: SupportedLocale): Promise<void> {
  if (loadedLocales.has(locale)) return;
  const loader = localeLoaders[locale];
  if (!loader) return;
  const bundle = await loader();
  i18n.addResourceBundle(locale, 'translation', bundle, true, true);
  loadedLocales.add(locale);
}

// 首屏若检测到英文（localStorage / 浏览器语言），补载英文包后切换：首帧以中文
// 回退渲染，英文包就绪后无缝替换——用极短的一次闪烁换取首屏少 ~180KB。补载是
// 异步的，就绪时重新确认仍为英文才切换（用户可能在窗口内改了语言，测试环境也会
// 在 setup 里同步切回 zh-CN，不应被这里覆盖）。
if (getInterfaceLocale() === 'en-US') {
  void ensureLocaleLoaded('en-US').then(() => {
    if (getInterfaceLocale() === 'en-US') void i18n.changeLanguage('en-US');
  });
}

/**
 * 当前生效的界面语言（zh-CN / en-US）。
 * 供非 React 模块（model / helper 文件）读取，组件优先使用 useLocale()。
 */
export function getInterfaceLocale(): SupportedLocale {
  return i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

export default i18n;
