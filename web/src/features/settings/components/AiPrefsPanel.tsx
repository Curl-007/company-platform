import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import Panel from '../../../components/common/Panel';
import { Button, Checkbox, FormField } from '../../../components/ui';
import { DEFAULT_AI_PREFS } from '../settingsModel';

type AiPrefs = typeof DEFAULT_AI_PREFS;

export default function AiPrefsPanel({
  aiPrefsDraft,
  aiPrefs,
  setAiPrefsDraft,
  onSave,
}: {
  aiPrefsDraft: AiPrefs;
  aiPrefs: AiPrefs;
  setAiPrefsDraft: Dispatch<SetStateAction<AiPrefs>>;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const unchanged =
    aiPrefsDraft.confidenceThreshold === aiPrefs.confidenceThreshold &&
    aiPrefsDraft.autoAnalyze === aiPrefs.autoAnalyze;

  return (
    <Panel
      title={t('features.settings.aiPrefsPanel.title')}
      subtitle={t('features.settings.aiPrefsPanel.subtitle')}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="primary" size="sm" onClick={onSave} disabled={unchanged}>
            {t('features.settings.aiPrefsPanel.saveStrategy')}
          </Button>
        </div>
      }
    >
      <div className="settings-form">
        <FormField label={t('features.settings.aiPrefsPanel.confidenceLabel')} htmlFor="settings-ai-confidence" helpText={t('features.settings.aiPrefsPanel.confidenceHelp')}>
          <div className="flex items-center gap-3">
            <input
              id="settings-ai-confidence"
              className="form-input flex-1"
              type="range"
              min={0}
              max={100}
              step={5}
              value={aiPrefsDraft.confidenceThreshold}
              onChange={(e) => setAiPrefsDraft((prev) => ({ ...prev, confidenceThreshold: Number(e.target.value) }))}
            />
            <span className="text-mono min-w-10 text-right">{aiPrefsDraft.confidenceThreshold}%</span>
          </div>
        </FormField>
        <FormField label={t('features.settings.aiPrefsPanel.autoAnalyzeLabel')} htmlFor="settings-ai-auto-analyze" helpText={t('features.settings.aiPrefsPanel.autoAnalyzeHelp')}>
          <Checkbox id="settings-ai-auto-analyze" checked={aiPrefsDraft.autoAnalyze} onChange={(e) => setAiPrefsDraft((prev) => ({ ...prev, autoAnalyze: e.target.checked }))} />
        </FormField>
      </div>
    </Panel>
  );
}
