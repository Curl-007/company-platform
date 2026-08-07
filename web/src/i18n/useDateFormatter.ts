import { useMemo } from 'react';
import { enUS, zhCN, type Locale } from 'date-fns/locale';
import { useLocale } from './LanguageProvider';

/** 返回与当前界面语言联动的 date-fns locale，供 Calendar/DatePicker 等组件注入。 */
export function useDateLocale(): Locale {
  const { locale } = useLocale();
  return useMemo(() => (locale === 'en-US' ? enUS : zhCN), [locale]);
}
