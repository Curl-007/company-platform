import { useEffect, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getSessionUser } from '../../../services/auth';
import {
  activateAiProviderConfig,
  deleteAiProviderConfig,
  fetchAiAssistantConfig,
  fetchAiProviderConfig,
  updateAiProviderStatus,
  updateAiAssistantConfig,
  updateAiProviderConfig,
  testAiProviderConfig,
} from '../../ai/api';
import { ApiError } from '../../../services/api';
import type { AiAssistantConfig, AiProviderConfig, UpdateAiAssistantInput, UpdateAiProviderInput } from '../../../types';
import { useAsync } from '../../../hooks/useAsync';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { canOperate } from '../../../constants/roles';
import { Badge } from '../../../components/ui';
import {
  DEFAULT_AI_PREFS,
  DEFAULT_API_CONFIG,
  DEFAULT_NOTIF_CONFIG,
  SETTINGS_STORAGE_KEYS,
  loadConfig,
  type AiTestState,
} from '../settingsModel';
import AccountPanel from './AccountPanel';
import ApiConfigPanel from './ApiConfigPanel';
import AiProviderPanel from './AiProviderPanel';
import AiAssistantPanel from './AiAssistantPanel';
import AiPrefsPanel from './AiPrefsPanel';
import NotificationsPanel from './NotificationsPanel';
import LanguagePanel from './LanguagePanel';
import '../../../styles/settings.css';

type TabId = 'account' | 'api' | 'ai' | 'prefs' | 'notifications' | 'language';

interface TabDef {
  id: TabId;
  label: string;
  /** 可选 i18n key，存在时渲染翻译后的标签（未翻译的 Tab 保持中文兜底）。 */
  labelKey?: string;
  badge?: string;
}

const TABS: TabDef[] = [
  { id: 'account', label: '账号信息', labelKey: 'features.settings.tabs.account' },
  { id: 'api', label: 'API 配置', labelKey: 'features.settings.tabs.api' },
  { id: 'ai', label: 'AI 模型配置', labelKey: 'features.settings.tabs.ai', badge: 'features.settings.tabs.aiBadge' },
  { id: 'prefs', label: '偏好设置', labelKey: 'features.settings.tabs.prefs' },
  { id: 'notifications', label: '通知设置', labelKey: 'features.settings.tabs.notifications' },
  { id: 'language', label: '语言', labelKey: 'settings.tab.language' },
];

function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  const tablist = event.currentTarget.closest('[role="tablist"]');
  const tabs = tablist ? Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')) : [];
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex < 0) return;

  let nextIndex: number;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}

export default function SettingsTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const { t } = useTranslation();
  const sessionUser = getSessionUser();
  const canManageAiProvider = canOperate(sessionUser, 'aiProvider:manage');
  const toast = useToast();
  const confirm = useConfirm();
  const {
    data: aiProvider,
    loading: aiProviderLoading,
    error: aiProviderError,
    reload: reloadAiProvider,
  } = useAsync<AiProviderConfig>(fetchAiProviderConfig, [], { cacheKey: 'settings:ai-provider' });
  const {
    data: aiAssistant,
    loading: aiAssistantLoading,
    error: aiAssistantError,
    reload: reloadAiAssistant,
  } = useAsync<AiAssistantConfig>(fetchAiAssistantConfig, [], { cacheKey: 'settings:ai-assistant' });

  const [apiConfig, setApiConfig] = useState(() =>
    loadConfig(SETTINGS_STORAGE_KEYS.api, DEFAULT_API_CONFIG),
  );
  const [apiDraft, setApiDraft] = useState(apiConfig);
  const [aiPrefs, setAiPrefs] = useState(() =>
    loadConfig(SETTINGS_STORAGE_KEYS.aiPrefs, DEFAULT_AI_PREFS),
  );
  const [aiPrefsDraft, setAiPrefsDraft] = useState(aiPrefs);
  const [notifConfig, setNotifConfig] = useState(() =>
    loadConfig(SETTINGS_STORAGE_KEYS.notifications, DEFAULT_NOTIF_CONFIG),
  );
  const [notifDraft, setNotifDraft] = useState(notifConfig);
  const [aiDraft, setAiDraft] = useState<UpdateAiProviderInput & { apiKey: string }>({
    name: t('features.settings.actions.defaultModel'),
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    wireApi: 'chat_completions',
    disableResponseStorage: true,
    enabled: true,
    apiKey: '',
    clearApiKey: false,
  });
  const [selectedAiProviderId, setSelectedAiProviderId] = useState<string | null>(null);
  const [savingAiProvider, setSavingAiProvider] = useState(false);
  const [testingAiProvider, setTestingAiProvider] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<AiTestState>({
    status: 'idle',
    message: t('features.settings.actions.testHintIdle'),
  });
  const [aiAssistantDraft, setAiAssistantDraft] = useState<UpdateAiAssistantInput & {
    enabled: boolean;
    model: string;
    name: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
  }>({
    name: t('features.settings.actions.platformAiAssistant'),
    enabled: true,
    providerId: null,
    model: '',
    systemPrompt: '',
    temperature: 0.25,
    maxTokens: 1800,
  });
  const [savingAiAssistant, setSavingAiAssistant] = useState(false);

  useEffect(() => {
    if (!aiProvider) return;
    if (selectedAiProviderId === '__new__') return;
    const selected = aiProvider.providers?.find((item) => item.id === (selectedAiProviderId || aiProvider.activeId)) || aiProvider.providers?.[0] || aiProvider;
    setSelectedAiProviderId(selected.id || null);
    setAiDraft((prev) => ({
      ...prev,
      id: selected.id || undefined,
      name: selected.name || selected.provider || t('features.settings.actions.defaultModel'),
      preset: selected.preset || 'custom',
      provider: selected.provider || 'openai-compatible',
      baseUrl: selected.baseUrl || 'https://api.openai.com/v1',
      model: selected.model || 'gpt-4o-mini',
      wireApi: selected.wireApi || 'chat_completions',
      disableResponseStorage: selected.disableResponseStorage,
      enabled: selected.enabled,
      createNew: false,
      activate: selected.id === aiProvider.activeId,
      apiKey: '',
      clearApiKey: false,
    }));
  }, [aiProvider, selectedAiProviderId]);

  useEffect(() => {
    if (!aiAssistant) return;
    setAiAssistantDraft({
      name: aiAssistant.name || t('features.settings.actions.platformAiAssistant'),
      enabled: aiAssistant.enabled !== false,
      providerId: aiAssistant.providerId || null,
      model: aiAssistant.model || '',
      systemPrompt: aiAssistant.systemPrompt || '',
      temperature: Number.isFinite(aiAssistant.temperature) ? aiAssistant.temperature : 0.25,
      maxTokens: Number.isFinite(aiAssistant.maxTokens) ? aiAssistant.maxTokens : 1800,
    });
  }, [aiAssistant, t]);

  function saveApiConfig() {
    setApiConfig(apiDraft);
    localStorage.setItem(SETTINGS_STORAGE_KEYS.api, JSON.stringify(apiDraft));
    toast.success(t('features.settings.actions.apiConfigSaved'));
  }

  function saveAiPrefs() {
    setAiPrefs(aiPrefsDraft);
    localStorage.setItem(SETTINGS_STORAGE_KEYS.aiPrefs, JSON.stringify(aiPrefsDraft));
    toast.success(t('features.settings.actions.aiPrefsSaved'));
  }

  function saveNotifConfig() {
    setNotifConfig(notifDraft);
    localStorage.setItem(SETTINGS_STORAGE_KEYS.notifications, JSON.stringify(notifDraft));
    toast.success(t('features.settings.actions.notifPrefsSaved'));
  }

  function aiProviderPayload(): UpdateAiProviderInput {
    return {
      ...(aiDraft.id && !aiDraft.createNew ? { id: aiDraft.id } : {}),
      name: aiDraft.name?.trim() || aiDraft.provider.trim() || aiDraft.model.trim(),
      preset: aiDraft.preset || 'custom',
      provider: aiDraft.provider.trim() || 'openai-compatible',
      baseUrl: aiDraft.baseUrl.trim(),
      model: aiDraft.model.trim(),
      wireApi: aiDraft.wireApi,
      disableResponseStorage: aiDraft.disableResponseStorage,
      enabled: aiDraft.enabled,
      clearApiKey: Boolean(aiDraft.clearApiKey),
      createNew: Boolean(aiDraft.createNew),
      activate: Boolean(aiDraft.activate),
      ...(aiDraft.apiKey.trim() ? { apiKey: aiDraft.apiKey.trim() } : {}),
    };
  }

  async function saveAiProvider() {
    if (!canManageAiProvider) return toast.error(t('features.settings.actions.noPermissionManageAi'));
    if (!aiDraft.baseUrl.trim()) return toast.error(t('features.settings.actions.baseUrlRequired'));
    if (!aiDraft.model.trim()) return toast.error(t('features.settings.actions.modelNameRequired'));
    setSavingAiProvider(true);
    setAiTestResult({ status: 'idle', message: t('features.settings.actions.changedNeedRetest') });
    try {
      const payload = aiProviderPayload();
      const next = await updateAiProviderConfig(payload);
      const selected = payload.createNew ? next.activeId : payload.id;
      if (selected) setSelectedAiProviderId(selected);
      toast.success(t('features.settings.actions.aiConfigSaved'));
      await reloadAiProvider();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.settings.actions.aiConfigSaveFailed'));
    } finally {
      setSavingAiProvider(false);
    }
  }

  function createAiProviderDraft() {
    setSelectedAiProviderId('__new__');
    setAiDraft({
      name: t('features.settings.actions.newModelConfig'),
      preset: 'custom',
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      wireApi: 'chat_completions',
      disableResponseStorage: true,
      enabled: true,
      apiKey: '',
      clearApiKey: false,
      createNew: true,
      activate: true,
    });
  }

  function editAiProvider(id: string) {
    const item = aiProvider?.providers?.find((provider) => provider.id === id);
    if (!item) return;
    setSelectedAiProviderId(id);
    setAiDraft({
      id: item.id,
      name: item.name,
      preset: item.preset || 'custom',
      provider: item.provider,
      baseUrl: item.baseUrl,
      model: item.model,
      wireApi: item.wireApi,
      disableResponseStorage: item.disableResponseStorage,
      enabled: item.enabled,
      apiKey: '',
      clearApiKey: false,
      createNew: false,
      activate: item.id === aiProvider?.activeId,
    });
  }

  async function handleActivateAiProvider(id: string) {
    if (!canManageAiProvider) return toast.error(t('features.settings.actions.noPermissionManageAi'));
    try {
      await activateAiProviderConfig(id);
      setSelectedAiProviderId(id);
      toast.success(t('features.settings.actions.aiConfigEnabled'));
      await reloadAiProvider();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.settings.actions.enableFailed'));
    }
  }

  async function handleToggleAiProvider(id: string, enabled: boolean) {
    if (!canManageAiProvider) return toast.error(t('features.settings.actions.noPermissionManageAi'));
    try {
      await updateAiProviderStatus(id, enabled);
      toast.success(enabled ? t('features.settings.actions.aiConfigEnabled') : t('features.settings.actions.aiConfigDisabled'));
      await reloadAiProvider();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.settings.actions.statusUpdateFailed'));
    }
  }

  async function handleDeleteAiProvider(id: string) {
    if (!canManageAiProvider) return toast.error(t('features.settings.actions.noPermissionManageAi'));
    const item = aiProvider?.providers?.find((provider) => provider.id === id);
    const ok = await confirm({
      title: t('features.settings.actions.deleteAiConfirm', { name: item?.name || item?.model || id }),
      description: t('features.settings.actions.deleteAiConfirmDesc'),
      confirmText: t('features.settings.actions.deleteConfig'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const next = await deleteAiProviderConfig(id);
      setSelectedAiProviderId(next.activeId || next.providers?.[0]?.id || null);
      toast.success(t('features.settings.actions.aiConfigDeleted'));
      await reloadAiProvider();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.settings.actions.deleteFailed'));
    }
  }

  async function handleTestAiProvider() {
    if (!canManageAiProvider) return toast.error(t('features.settings.actions.noPermissionTestAi'));
    setTestingAiProvider(true);
    setAiTestResult({ status: 'idle', message: t('features.settings.actions.testingConnection') });
    try {
      const result = await testAiProviderConfig({ ...aiProviderPayload(), enabled: true });
      setAiTestResult({
        status: 'success',
        message: t('features.settings.actions.connectionSuccess'),
        latencyMs: result.latencyMs,
        sample: result.sample || t('features.settings.actions.noContent'),
        testedAt: new Date().toISOString(),
      });
      toast.success(t('features.settings.actions.providerConnected'));
      await reloadAiProvider();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : t('features.settings.actions.testFailed');
      setAiTestResult({ status: 'error', message, testedAt: new Date().toISOString() });
      toast.error(message);
      await reloadAiProvider();
    } finally {
      setTestingAiProvider(false);
    }
  }

  async function saveAiAssistant() {
    if (!canManageAiProvider) return toast.error(t('features.settings.actions.noPermissionManageAi'));
    if (!aiAssistantDraft.name.trim()) return toast.error(t('features.settings.actions.assistantNameRequired'));
    if (!Number.isFinite(aiAssistantDraft.temperature) || aiAssistantDraft.temperature < 0 || aiAssistantDraft.temperature > 2) {
      return toast.error(t('features.settings.actions.assistantTemperatureInvalid'));
    }
    if (!Number.isInteger(aiAssistantDraft.maxTokens) || aiAssistantDraft.maxTokens < 128) {
      return toast.error(t('features.settings.actions.assistantMaxTokensInvalid'));
    }
    setSavingAiAssistant(true);
    try {
      await updateAiAssistantConfig({
        name: aiAssistantDraft.name.trim(),
        enabled: aiAssistantDraft.enabled,
        providerId: aiAssistantDraft.providerId || null,
        model: aiAssistantDraft.model.trim(),
        systemPrompt: aiAssistantDraft.systemPrompt.trim(),
        temperature: aiAssistantDraft.temperature,
        maxTokens: aiAssistantDraft.maxTokens,
      });
      toast.success(t('features.settings.actions.aiAssistantSaved'));
      await reloadAiAssistant();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.settings.actions.aiAssistantSaveFailed'));
    } finally {
      setSavingAiAssistant(false);
    }
  }

  return (
    <div className="settings-page">
      {/* 顶部 Tab 栏（全站 nav-tabs 规范：role=tablist + 方向键导航） */}
      <div className="nav-tabs settings-page-tabs" role="tablist" aria-label={t('features.settings.settingsTabs.tablistAria')}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            type="button"
            role="tab"
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`settings-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={handleTabKeyDown}
          >
            {tab.labelKey ? t(tab.labelKey) : tab.label}
            {tab.badge ? <Badge variant="secondary" className="ml-2">{t(tab.badge)}</Badge> : null}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="settings-content-area">
        {activeTab === 'account' && (
          <div id="settings-panel-account" role="tabpanel" aria-labelledby="settings-tab-account">
            <AccountPanel sessionUser={sessionUser} />
          </div>
        )}
        {activeTab === 'api' && (
          <div id="settings-panel-api" role="tabpanel" aria-labelledby="settings-tab-api">
            <ApiConfigPanel
              apiDraft={apiDraft}
              apiConfig={apiConfig}
              setApiDraft={setApiDraft}
              onSave={saveApiConfig}
            />
          </div>
        )}
        {activeTab === 'ai' && (
          <div id="settings-panel-ai" role="tabpanel" aria-labelledby="settings-tab-ai" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <AiProviderPanel
              canManageAiProvider={canManageAiProvider}
              aiProvider={aiProvider}
              aiProviderLoading={aiProviderLoading}
              aiProviderError={aiProviderError}
              reloadAiProvider={reloadAiProvider}
              aiDraft={aiDraft}
              setAiDraft={setAiDraft}
              selectedAiProviderId={selectedAiProviderId}
              savingAiProvider={savingAiProvider}
              testingAiProvider={testingAiProvider}
              aiTestResult={aiTestResult}
              createAiProviderDraft={createAiProviderDraft}
              editAiProvider={editAiProvider}
              handleActivateAiProvider={handleActivateAiProvider}
              handleToggleAiProvider={handleToggleAiProvider}
              handleDeleteAiProvider={handleDeleteAiProvider}
              handleTestAiProvider={handleTestAiProvider}
              saveAiProvider={saveAiProvider}
            />
            <AiAssistantPanel
              canManageAiProvider={canManageAiProvider}
              aiAssistant={aiAssistant}
              aiAssistantLoading={aiAssistantLoading}
              aiAssistantError={aiAssistantError}
              reloadAiAssistant={reloadAiAssistant}
              aiProvider={aiProvider}
              aiDraft={aiAssistantDraft}
              setAiDraft={setAiAssistantDraft}
              savingAiAssistant={savingAiAssistant}
              saveAiAssistant={saveAiAssistant}
            />
          </div>
        )}
        {activeTab === 'prefs' && (
          <div id="settings-panel-prefs" role="tabpanel" aria-labelledby="settings-tab-prefs">
            <AiPrefsPanel
              aiPrefsDraft={aiPrefsDraft}
              aiPrefs={aiPrefs}
              setAiPrefsDraft={setAiPrefsDraft}
              onSave={saveAiPrefs}
            />
          </div>
        )}
        {activeTab === 'notifications' && (
          <div id="settings-panel-notifications" role="tabpanel" aria-labelledby="settings-tab-notifications">
            <NotificationsPanel
              notifDraft={notifDraft}
              notifConfig={notifConfig}
              setNotifDraft={setNotifDraft}
              onSave={saveNotifConfig}
            />
          </div>
        )}
        {activeTab === 'language' && (
          <div id="settings-panel-language" role="tabpanel" aria-labelledby="settings-tab-language">
            <LanguagePanel />
          </div>
        )}
      </div>
    </div>
  );
}
