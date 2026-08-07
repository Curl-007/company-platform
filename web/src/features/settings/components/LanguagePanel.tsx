import { useTranslation } from 'react-i18next';
import Panel from '../../../components/common/Panel';
import { Button } from '../../../components/ui';
import { useLocale } from '../../../i18n/LanguageProvider';
import type { SupportedLocale } from '../../../i18n';

const LANGUAGE_OPTIONS: { value: SupportedLocale; labelKey: string }[] = [
  { value: 'zh-CN', labelKey: 'settings.language.zhCN' },
  { value: 'en-US', labelKey: 'settings.language.enUS' },
];

export default function LanguagePanel() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();

  return (
    <Panel
      title={t('settings.language.title')}
      subtitle={t('settings.language.description')}
    >
      <div className="settings-form">
        <div className="flex items-center gap-2">
          {LANGUAGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={locale === option.value ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setLocale(option.value)}
              aria-pressed={locale === option.value}
            >
              {t(option.labelKey)}
            </Button>
          ))}
        </div>
      </div>
    </Panel>
  );
}
