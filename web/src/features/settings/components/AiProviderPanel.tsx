import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import type { AiModelOption, AiProviderConfig, UpdateAiProviderInput } from '../../../types';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import { Button, Checkbox, FormField, SelectInput, TextInput } from '../../../components/ui';
import { fetchAdminAiProviderModels } from '../../ai/api';
import { AI_PROVIDER_PRESETS, findAiProviderPreset } from '../aiModelPresets';
import type { AiTestState } from '../settingsModel';
import AiProviderHealthCard from './AiProviderHealthCard';
import AiProviderTestResultCard from './AiProviderTestResultCard';

type AiDraft = UpdateAiProviderInput & { apiKey: string };

export default function AiProviderPanel({
  canManageAiProvider,
  aiProvider,
  aiProviderLoading,
  aiProviderError,
  reloadAiProvider,
  aiDraft,
  setAiDraft,
  selectedAiProviderId,
  savingAiProvider,
  testingAiProvider,
  aiTestResult,
  createAiProviderDraft,
  editAiProvider,
  handleActivateAiProvider,
  handleToggleAiProvider,
  handleDeleteAiProvider,
  handleTestAiProvider,
  saveAiProvider,
}: {
  canManageAiProvider: boolean;
  aiProvider?: AiProviderConfig | null;
  aiProviderLoading: boolean;
  aiProviderError: string | null;
  reloadAiProvider: () => void;
  aiDraft: AiDraft;
  setAiDraft: Dispatch<SetStateAction<AiDraft>>;
  selectedAiProviderId: string | null;
  savingAiProvider: boolean;
  testingAiProvider: boolean;
  aiTestResult: AiTestState;
  createAiProviderDraft: () => void;
  editAiProvider: (id: string) => void;
  handleActivateAiProvider: (id: string) => void;
  handleToggleAiProvider: (id: string, enabled: boolean) => void;
  handleDeleteAiProvider: (id: string) => void;
  handleTestAiProvider: () => void;
  saveAiProvider: () => void;
}) {
  const { t } = useTranslation();
  const [discoveredModels, setDiscoveredModels] = useState<AiModelOption[]>([]);
  const [discoveringModels, setDiscoveringModels] = useState(false);
  const [modelDiscoveryError, setModelDiscoveryError] = useState<string | null>(null);
  const editingProvider = aiProvider?.providers?.find((provider) => provider.id === aiDraft.id);
  const savedApiKeyMasked = editingProvider?.apiKeyMasked
    || (aiProvider?.id === aiDraft.id ? aiProvider?.apiKeyMasked : '');

  function applyPreset(presetId: string) {
    const preset = findAiProviderPreset(presetId);
    setAiDraft((previous) => ({
      ...previous,
      preset: preset.id,
      name: preset.defaultName || previous.name,
      provider: preset.provider,
      baseUrl: preset.defaultBaseUrl,
      model: preset.defaultModel,
      wireApi: preset.defaultWireApi,
    }));
    setDiscoveredModels([]);
    setModelDiscoveryError(null);
  }

  async function discoverModels() {
    if (!aiDraft.id || aiDraft.createNew) {
      setModelDiscoveryError(t('features.settings.aiProviderPanel.discoverySaveFirst'));
      return;
    }
    setDiscoveringModels(true);
    setModelDiscoveryError(null);
    try {
      const result = await fetchAdminAiProviderModels(aiDraft.id);
      setDiscoveredModels(result.models || []);
    } catch (error) {
      setDiscoveredModels([]);
      setModelDiscoveryError(error instanceof Error ? error.message : t('features.settings.aiProviderPanel.discoveryFailed'));
    } finally {
      setDiscoveringModels(false);
    }
  }

  return (
    <Panel title={t('features.settings.aiProviderPanel.title')} subtitle={t('features.settings.aiProviderPanel.subtitle')}>
      <div className="settings-form detail-sections">
        {!canManageAiProvider ? (
          <div className="form-error">{t('features.settings.aiProviderPanel.noPermissionView')}</div>
        ) : null}

        {/* 当前生效配置：状态 + 模型/服务/协议/key 来源 */}
        <section className="detail-section" aria-label={t('features.settings.aiProviderPanel.statusAriaLabel')}>
          <div className="detail-section-header">
            <span>{t('features.settings.aiProviderPanel.statusTitle')}</span>
          </div>
          <div className="detail-section-body">
            {aiProviderLoading ? (
              <div className="ai-provider-status">
                <div className="ai-provider-status-main">{t('features.settings.aiProviderPanel.loadingConfig')}</div>
              </div>
            ) : aiProviderError ? (
              <div className="ai-provider-status">
                <div className="ai-provider-status-main">{t('features.settings.aiProviderPanel.loadFailed')}</div>
                <div className="ai-provider-status-meta">{aiProviderError}</div>
                <Button variant="secondary" size="sm" onClick={reloadAiProvider}>{t('common.retry')}</Button>
              </div>
            ) : (
              <div className="detail-strip">
                <div className="detail-strip-item">
                  <span className="detail-strip-label">{t('features.settings.aiProviderPanel.statusLabel')}</span>
                  <span className="detail-strip-value">
                    <StatusBadge
                      label={aiProvider?.configured ? t('features.settings.aiProviderPanel.configured') : t('features.settings.aiProviderPanel.unconfigured')}
                      status={aiProvider?.configured ? 'success' : 'warning'}
                      showDot
                    />
                  </span>
                </div>
                <div className="detail-strip-item">
                  <span className="detail-strip-label">{t('features.settings.aiProviderPanel.modelLabel')}</span>
                  <span className="detail-strip-value text-mono">{aiProvider?.model || t('features.settings.aiProviderPanel.noModelSet')}</span>
                </div>
                <div className="detail-strip-item">
                  <span className="detail-strip-label">{t('features.settings.aiProviderPanel.baseUrlLabel')}</span>
                  <span className="detail-strip-value">{aiProvider?.baseUrlHost || t('features.settings.aiProviderPanel.noServiceUrl')}</span>
                </div>
                <div className="detail-strip-item">
                  <span className="detail-strip-label">{t('features.settings.aiProviderPanel.protocolLabel')}</span>
                  <span className="detail-strip-value">{aiProvider?.wireApi === 'responses' ? 'Responses API' : 'Chat Completions'}</span>
                </div>
                <div className="detail-strip-item">
                  <span className="detail-strip-label">{t('features.settings.aiProviderPanel.apiKeyLabel')}</span>
                  <span className="detail-strip-value">
                    {aiProvider?.apiKeyMasked || t('features.settings.aiProviderPanel.unconfigured')}
                    {' · '}
                    {aiProvider?.apiKeySource === 'environment'
                      ? t('features.settings.aiProviderPanel.sourceEnv')
                      : aiProvider?.apiKeySource === 'database'
                        ? t('features.settings.aiProviderPanel.sourceDatabase')
                        : t('features.settings.aiProviderPanel.sourceNone')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        <AiProviderHealthCard provider={aiProvider} loading={aiProviderLoading} onRefresh={reloadAiProvider} />

        {/* 配置列表 */}
        <section className="detail-section" aria-label={t('features.settings.aiProviderPanel.listTitle')}>
          <div className="detail-section-header">
            <span>{t('features.settings.aiProviderPanel.listTitle')}</span>
            <Button variant="secondary" size="sm" onClick={createAiProviderDraft} disabled={!canManageAiProvider}>
              {t('features.settings.aiProviderPanel.newConfig')}
            </Button>
          </div>
          <div className="detail-section-body">
            {aiProvider?.providers?.length ? (
              <div className="ai-provider-list-body">
                {aiProvider.providers.map((item) => {
                  const active = item.id === aiProvider.activeId;
                  const editing = item.id === selectedAiProviderId;
                  return (
                    <div key={item.id} className={`ai-provider-row ${active ? 'active' : ''} ${editing ? 'editing' : ''}`}>
                      <div className="ai-provider-row-main">
                        <div className="ai-provider-row-title">
                          <strong>{item.name || item.provider}</strong>
                          {active ? <StatusBadge label={t('features.settings.aiProviderPanel.inUse')} status="success" showDot={false} /> : null}
                          <StatusBadge label={item.enabled ? t('features.settings.aiProviderPanel.enabled') : t('features.settings.aiProviderPanel.disabled')} status={item.enabled ? 'info' : 'neutral'} showDot={false} />
                        </div>
                        <div className="ai-provider-row-meta">
                          <span className="text-mono">{item.model}</span>
                          <span>{item.baseUrlHost || item.baseUrl}</span>
                          <span>{item.wireApi === 'responses' ? 'Responses API' : 'Chat Completions'}</span>
                          <span>{t('features.settings.aiProviderPanel.keyMasked', { masked: item.apiKeyMasked || t('features.settings.aiProviderPanel.unconfigured') })}</span>
                        </div>
                      </div>
                      <div className="ai-provider-row-actions">
                        <Button variant="text" size="sm" onClick={() => editAiProvider(item.id)} disabled={!canManageAiProvider}>{t('common.edit')}</Button>
                        {!active ? (
                          <Button variant="secondary" size="sm" onClick={() => handleActivateAiProvider(item.id)} disabled={!canManageAiProvider || !item.enabled}>{t('features.settings.aiProviderPanel.setActive')}</Button>
                        ) : null}
                        <Button variant="secondary" size="sm" onClick={() => handleToggleAiProvider(item.id, !item.enabled)} disabled={!canManageAiProvider}>
                          {item.enabled ? t('features.settings.aiProviderPanel.disable') : t('features.settings.aiProviderPanel.enable')}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDeleteAiProvider(item.id)} disabled={!canManageAiProvider}>{t('common.delete')}</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ai-provider-empty">{t('features.settings.aiProviderPanel.emptyList')}</div>
            )}
          </div>
        </section>

        {/* 编辑区 */}
        <section className="detail-section" aria-label={aiDraft.createNew ? t('features.settings.aiProviderPanel.editorNewTitle') : t('features.settings.aiProviderPanel.editorEditTitle')}>
          <div className="detail-section-header">
            <span>{aiDraft.createNew ? t('features.settings.aiProviderPanel.editorNewTitle') : t('features.settings.aiProviderPanel.editorEditTitle')}</span>
            <Checkbox
              checked={Boolean(aiDraft.activate)}
              onChange={(e) => setAiDraft((prev) => ({ ...prev, activate: e.target.checked }))}
              disabled={!canManageAiProvider}
              label={t('features.settings.aiProviderPanel.activateAfterSave')}
            />
          </div>
          <div className="detail-section-body">
            <div className="form-row">
              <FormField label={t('features.settings.aiProviderPanel.nameLabel')} htmlFor="settings-ai-name">
                <TextInput id="settings-ai-name" value={aiDraft.name || ''} onChange={(e) => setAiDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder={t('features.settings.aiProviderPanel.namePlaceholder')} disabled={!canManageAiProvider} />
              </FormField>
              <FormField label={t('features.settings.aiProviderPanel.presetLabel')} htmlFor="settings-ai-preset" helpText={t('features.settings.aiProviderPanel.presetHelp')}>
                <SelectInput id="settings-ai-preset" value={aiDraft.preset || 'custom'} onChange={(e) => applyPreset(e.target.value)} disabled={!canManageAiProvider}>
                  {AI_PROVIDER_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{t(`features.settings.aiProviderPanel.presets.${preset.id}`)}</option>
                  ))}
                </SelectInput>
              </FormField>
            </div>
            <div className="form-row">
              <FormField label={t('features.settings.aiProviderPanel.providerLabel')} htmlFor="settings-ai-provider">
                <TextInput id="settings-ai-provider" value={aiDraft.provider} onChange={(e) => setAiDraft((prev) => ({ ...prev, preset: 'custom', provider: e.target.value }))} placeholder="openai-compatible / my_codex" disabled={!canManageAiProvider} />
              </FormField>
              <FormField label={t('features.settings.aiProviderPanel.wireApiLabel')} htmlFor="settings-ai-wire-api">
                <SelectInput id="settings-ai-wire-api" value={aiDraft.wireApi} onChange={(e) => setAiDraft((prev) => ({ ...prev, preset: 'custom', wireApi: e.target.value as UpdateAiProviderInput['wireApi'] }))} disabled={!canManageAiProvider}>
                  <option value="chat_completions">Chat Completions</option>
                  <option value="responses">Responses API</option>
                </SelectInput>
              </FormField>
            </div>
            <div className="form-row">
              <FormField label={t('features.settings.aiProviderPanel.baseUrlLabel')} htmlFor="settings-ai-base-url" required>
                <TextInput id="settings-ai-base-url" value={aiDraft.baseUrl} onChange={(e) => setAiDraft((prev) => ({ ...prev, preset: 'custom', baseUrl: e.target.value }))} placeholder="http://192.168.3.18:8000/v1" disabled={!canManageAiProvider} />
              </FormField>
              <FormField label={t('features.settings.aiProviderPanel.modelLabel')} htmlFor="settings-ai-model" required helpText={t('features.settings.aiProviderPanel.modelHelp')}>
                <TextInput id="settings-ai-model" list="settings-ai-discovered-models" value={aiDraft.model} onChange={(e) => setAiDraft((prev) => ({ ...prev, model: e.target.value }))} placeholder="gpt-5.5" disabled={!canManageAiProvider} />
                <datalist id="settings-ai-discovered-models">
                  {discoveredModels.map((model) => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
                </datalist>
              </FormField>
            </div>
            <div className="ai-model-discovery-row">
              <div>
                <strong>{t('features.settings.aiProviderPanel.discoveryTitle')}</strong>
                <span>{modelDiscoveryError || t('features.settings.aiProviderPanel.discoveryHelp')}</span>
              </div>
              <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => { void discoverModels(); }} disabled={!canManageAiProvider || discoveringModels}>
                {discoveringModels ? t('features.settings.aiProviderPanel.discoveringModels') : t('features.settings.aiProviderPanel.discoverModels')}
              </Button>
            </div>
            <div className="form-row">
              <FormField label={t('features.settings.aiProviderPanel.enabledLabel')} htmlFor="settings-ai-enabled" helpText={t('features.settings.aiProviderPanel.enabledHelp')}>
                <Checkbox id="settings-ai-enabled" checked={Boolean(aiDraft.enabled)} onChange={(e) => setAiDraft((prev) => ({ ...prev, enabled: e.target.checked }))} disabled={!canManageAiProvider} />
              </FormField>
              <div />
            </div>
            <FormField label={t('features.settings.aiProviderPanel.apiKeyLabel')} htmlFor="settings-ai-api-key" helpText={t('features.settings.aiProviderPanel.apiKeyHelp')}>
              <TextInput id="settings-ai-api-key" type="password" value={aiDraft.apiKey} onChange={(e) => setAiDraft((prev) => ({ ...prev, apiKey: e.target.value, clearApiKey: false }))} placeholder={savedApiKeyMasked ? t('features.settings.aiProviderPanel.apiKeyPlaceholderKeep') : t('features.settings.aiProviderPanel.apiKeyPlaceholder')} autoComplete="off" disabled={!canManageAiProvider} />
            </FormField>
            <div className="form-row">
              <FormField label={t('features.settings.aiProviderPanel.storageLabel')} htmlFor="settings-ai-disable-storage" helpText={t('features.settings.aiProviderPanel.storageHelp')}>
                <Checkbox id="settings-ai-disable-storage" checked={aiDraft.disableResponseStorage} onChange={(e) => setAiDraft((prev) => ({ ...prev, disableResponseStorage: e.target.checked }))} disabled={!canManageAiProvider} />
              </FormField>
              <FormField label={t('features.settings.aiProviderPanel.clearKeyLabel')} htmlFor="settings-ai-clear-key" helpText={t('features.settings.aiProviderPanel.clearKeyHelp')}>
                <Checkbox id="settings-ai-clear-key" checked={Boolean(aiDraft.clearApiKey)} onChange={(e) => setAiDraft((prev) => ({ ...prev, clearApiKey: e.target.checked, apiKey: e.target.checked ? '' : prev.apiKey }))} disabled={!canManageAiProvider} />
              </FormField>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={handleTestAiProvider} disabled={!canManageAiProvider || testingAiProvider || savingAiProvider || !aiDraft.baseUrl.trim() || !aiDraft.model.trim()}>
                {testingAiProvider ? t('features.settings.aiProviderPanel.testing') : t('features.settings.aiProviderPanel.testConnection')}
              </Button>
              <Button variant="primary" size="sm" onClick={saveAiProvider} disabled={!canManageAiProvider || savingAiProvider || testingAiProvider}>
                {savingAiProvider ? t('features.settings.aiProviderPanel.saving') : t('features.settings.aiProviderPanel.saveConfig')}
              </Button>
            </div>
            <AiProviderTestResultCard result={aiTestResult} testing={testingAiProvider} />
          </div>
        </section>
      </div>
    </Panel>
  );
}
