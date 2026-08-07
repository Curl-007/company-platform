import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import Panel from '../../../components/common/Panel';
import { Button, Checkbox, FormField, TextInput } from '../../../components/ui';
import { DEFAULT_API_CONFIG } from '../settingsModel';

type ApiConfig = typeof DEFAULT_API_CONFIG;

export default function ApiConfigPanel({
  apiDraft,
  apiConfig,
  setApiDraft,
  onSave,
}: {
  apiDraft: ApiConfig;
  apiConfig: ApiConfig;
  setApiDraft: Dispatch<SetStateAction<ApiConfig>>;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const unchanged =
    apiDraft.endpoint === apiConfig.endpoint &&
    apiDraft.timeout === apiConfig.timeout &&
    apiDraft.logRequests === apiConfig.logRequests;

  return (
    <Panel
      title={t('features.settings.apiConfigPanel.title')}
      subtitle={t('features.settings.apiConfigPanel.subtitle')}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="primary" size="sm" onClick={onSave} disabled={unchanged}>
            {t('features.settings.apiConfigPanel.saveConfig')}
          </Button>
        </div>
      }
    >
      <div className="settings-form">
        <FormField label={t('features.settings.apiConfigPanel.endpointLabel')} htmlFor="settings-api-endpoint">
          <TextInput id="settings-api-endpoint" value={apiDraft.endpoint} onChange={(e) => setApiDraft((prev) => ({ ...prev, endpoint: e.target.value }))} placeholder="http://localhost:4010" />
        </FormField>
        <div className="form-row">
          <FormField label={t('features.settings.apiConfigPanel.timeoutLabel')} htmlFor="settings-api-timeout" helpText={t('features.settings.apiConfigPanel.timeoutHelp')}>
            <TextInput id="settings-api-timeout" type="number" min={5} max={120} value={apiDraft.timeout} onChange={(e) => setApiDraft((prev) => ({ ...prev, timeout: Number(e.target.value) }))} />
          </FormField>
          <FormField label={t('features.settings.apiConfigPanel.logRequestsLabel')} htmlFor="settings-api-log-requests" helpText={t('features.settings.apiConfigPanel.logRequestsHelp')}>
            <Checkbox id="settings-api-log-requests" checked={apiDraft.logRequests} onChange={(e) => setApiDraft((prev) => ({ ...prev, logRequests: e.target.checked }))} />
          </FormField>
        </div>
      </div>
    </Panel>
  );
}
