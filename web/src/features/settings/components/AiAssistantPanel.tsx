import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiAssistantConfig, AiProviderConfig, UpdateAiAssistantInput } from '../../../types';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import { Button, Checkbox, FormField, SelectInput, TextArea, TextInput } from '../../../components/ui';

type AiAssistantDraft = UpdateAiAssistantInput & {
  enabled: boolean;
  model: string;
  name: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
};

export default function AiAssistantPanel({
  canManageAiProvider,
  aiAssistant,
  aiAssistantLoading,
  aiAssistantError,
  reloadAiAssistant,
  aiProvider,
  aiDraft,
  setAiDraft,
  savingAiAssistant,
  saveAiAssistant,
}: {
  canManageAiProvider: boolean;
  aiAssistant?: AiAssistantConfig | null;
  aiAssistantLoading: boolean;
  aiAssistantError: string | null;
  reloadAiAssistant: () => void;
  aiProvider?: AiProviderConfig | null;
  aiDraft: AiAssistantDraft;
  setAiDraft: Dispatch<SetStateAction<AiAssistantDraft>>;
  savingAiAssistant: boolean;
  saveAiAssistant: () => void;
}) {
  const { t } = useTranslation();
  const providers = aiProvider?.providers || [];
  const selectedProviderId = aiDraft.providerId || aiProvider?.activeId || '';
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);
  const selectedModel = aiDraft.model || selectedProvider?.model || aiAssistant?.resolvedModel || '';

  return (
    <Panel title={t('features.settings.aiAssistantPanel.title')} subtitle={t('features.settings.aiAssistantPanel.subtitle')}>
      <div className="settings-form">
        {!canManageAiProvider ? <div className="form-error">{t('features.settings.aiAssistantPanel.noPermissionView')}</div> : null}
        {aiAssistantLoading ? (
          <div className="ai-provider-status">{t('features.settings.aiAssistantPanel.loading')}</div>
        ) : aiAssistantError ? (
          <div className="ai-provider-status">
            <div className="ai-provider-status-main">{t('features.settings.aiAssistantPanel.loadFailed')}</div>
            <div className="ai-provider-status-meta">{aiAssistantError}</div>
            <Button variant="secondary" size="sm" onClick={reloadAiAssistant}>{t('common.retry')}</Button>
          </div>
        ) : (
          <div className="ai-provider-status">
            <div className="ai-provider-status-main">
              <StatusBadge label={aiAssistant?.enabled ? t('features.settings.aiAssistantPanel.enabled') : t('features.settings.aiAssistantPanel.disabled')} status={aiAssistant?.enabled ? 'success' : 'neutral'} showDot />
              <span className="text-mono">{aiAssistant?.resolvedModel || selectedModel || t('features.settings.aiAssistantPanel.useConnectionDefault')}</span>
              <span>{selectedProvider?.name || selectedProvider?.provider || t('features.settings.aiAssistantPanel.useActiveConnection')}</span>
            </div>
            <div className="ai-provider-status-meta">{t('features.settings.aiAssistantPanel.statusMeta')}</div>
          </div>
        )}

        <div className="form-row">
          <FormField label={t('features.settings.aiAssistantPanel.nameLabel')} htmlFor="settings-ai-assistant-name" required>
            <TextInput
              id="settings-ai-assistant-name"
              value={aiDraft.name}
              onChange={(event) => setAiDraft((previous) => ({ ...previous, name: event.target.value }))}
              disabled={!canManageAiProvider}
            />
          </FormField>
          <FormField label={t('features.settings.aiAssistantPanel.enabledLabel')} htmlFor="settings-ai-assistant-enabled" helpText={t('features.settings.aiAssistantPanel.enabledHelp')}>
            <Checkbox
              id="settings-ai-assistant-enabled"
              checked={aiDraft.enabled}
              onChange={(event) => setAiDraft((previous) => ({ ...previous, enabled: event.target.checked }))}
              disabled={!canManageAiProvider}
            />
          </FormField>
        </div>

        <div className="form-row">
          <FormField label={t('features.settings.aiAssistantPanel.connectionLabel')} htmlFor="settings-ai-assistant-provider">
            <SelectInput
              id="settings-ai-assistant-provider"
              value={aiDraft.providerId || ''}
              onChange={(event) => {
                const providerId = event.target.value || null;
                const provider = providers.find((item) => item.id === providerId)
                  || providers.find((item) => item.id === aiProvider?.activeId);
                setAiDraft((previous) => ({
                  ...previous,
                  providerId,
                  model: provider?.model || previous.model,
                }));
              }}
              disabled={!canManageAiProvider}
            >
              <option value="">{t('features.settings.aiAssistantPanel.activeConnection')}</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id} disabled={!provider.enabled}>
                  {provider.name || provider.provider} ({provider.model})
                </option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label={t('features.settings.aiAssistantPanel.modelLabel')} htmlFor="settings-ai-assistant-model" helpText={t('features.settings.aiAssistantPanel.modelHelp')}>
            <TextInput
              id="settings-ai-assistant-model"
              value={aiDraft.model}
              onChange={(event) => setAiDraft((previous) => ({ ...previous, model: event.target.value }))}
              placeholder={selectedProvider?.model || t('features.settings.aiAssistantPanel.useConnectionDefault')}
              disabled={!canManageAiProvider}
            />
          </FormField>
        </div>

        <FormField label={t('features.settings.aiAssistantPanel.systemPromptLabel')} htmlFor="settings-ai-assistant-system" helpText={t('features.settings.aiAssistantPanel.systemPromptHelp')}>
          <TextArea
            id="settings-ai-assistant-system"
            rows={5}
            value={aiDraft.systemPrompt}
            onChange={(event) => setAiDraft((previous) => ({ ...previous, systemPrompt: event.target.value }))}
            disabled={!canManageAiProvider}
          />
        </FormField>

        <div className="form-row">
          <FormField label={t('features.settings.aiAssistantPanel.temperatureLabel')} htmlFor="settings-ai-assistant-temperature" helpText={t('features.settings.aiAssistantPanel.temperatureHelp')}>
            <TextInput
              id="settings-ai-assistant-temperature"
              type="number"
              min="0"
              max="2"
              step="0.05"
              value={aiDraft.temperature}
              onChange={(event) => setAiDraft((previous) => ({ ...previous, temperature: Number(event.target.value) }))}
              disabled={!canManageAiProvider}
            />
          </FormField>
          <FormField label={t('features.settings.aiAssistantPanel.maxTokensLabel')} htmlFor="settings-ai-assistant-max-tokens" helpText={t('features.settings.aiAssistantPanel.maxTokensHelp')}>
            <TextInput
              id="settings-ai-assistant-max-tokens"
              type="number"
              min="128"
              max="32768"
              step="128"
              value={aiDraft.maxTokens}
              onChange={(event) => setAiDraft((previous) => ({ ...previous, maxTokens: Number(event.target.value) }))}
              disabled={!canManageAiProvider}
            />
          </FormField>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="primary" size="sm" onClick={saveAiAssistant} disabled={!canManageAiProvider || savingAiAssistant}>
            {savingAiAssistant ? t('features.settings.aiAssistantPanel.saving') : t('features.settings.aiAssistantPanel.save')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
