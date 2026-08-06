import { useEffect, useState } from 'react';
import { getSessionUser } from '../../../services/auth';
import {
  activateAiProviderConfig,
  deleteAiProviderConfig,
  fetchAiProviderConfig,
  updateAiProviderStatus,
  updateAiProviderConfig,
  testAiProviderConfig,
} from '../../ai/api';
import { ApiError } from '../../../services/api';
import type { AiProviderConfig, UpdateAiProviderInput } from '../../../types';
import { useAsync } from '../../../hooks/useAsync';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { canOperate } from '../../../constants/roles';
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
import AiPrefsPanel from './AiPrefsPanel';
import NotificationsPanel from './NotificationsPanel';

export default function SettingsView() {
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
    name: '默认模型',
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
    message: '保存或修改模型配置后，请点击“测试连接”确认当前配置真实可用。',
  });

  useEffect(() => {
    if (!aiProvider) return;
    if (selectedAiProviderId === '__new__') return;
    const selected = aiProvider.providers?.find((item) => item.id === (selectedAiProviderId || aiProvider.activeId)) || aiProvider.providers?.[0] || aiProvider;
    setSelectedAiProviderId(selected.id || null);
    setAiDraft((prev) => ({
      ...prev,
      id: selected.id || undefined,
      name: selected.name || selected.provider || '默认模型',
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

  function saveApiConfig() {
    setApiConfig(apiDraft);
    localStorage.setItem(SETTINGS_STORAGE_KEYS.api, JSON.stringify(apiDraft));
    toast.success('API 配置已保存');
  }

  function saveAiPrefs() {
    setAiPrefs(aiPrefsDraft);
    localStorage.setItem(SETTINGS_STORAGE_KEYS.aiPrefs, JSON.stringify(aiPrefsDraft));
    toast.success('AI 分析策略已保存');
  }

  function saveNotifConfig() {
    setNotifConfig(notifDraft);
    localStorage.setItem(SETTINGS_STORAGE_KEYS.notifications, JSON.stringify(notifDraft));
    toast.success('通知偏好已保存');
  }

  async function saveAiProvider() {
    if (!canManageAiProvider) return toast.error('当前账号无权维护 AI 模型配置');
    if (!aiDraft.baseUrl.trim()) return toast.error('请填写 Base URL');
    if (!aiDraft.model.trim()) return toast.error('请填写模型名称');
    setSavingAiProvider(true);
    setAiTestResult({ status: 'idle', message: '模型配置已变更，保存完成后需要重新测试连接。' });
    try {
      const payload: UpdateAiProviderInput = {
        ...(aiDraft.id && !aiDraft.createNew ? { id: aiDraft.id } : {}),
        name: aiDraft.name?.trim() || aiDraft.provider.trim() || aiDraft.model.trim(),
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
      const next = await updateAiProviderConfig(payload);
      const selected = payload.createNew ? next.activeId : payload.id;
      if (selected) setSelectedAiProviderId(selected);
      toast.success('AI 模型配置已保存');
      await reloadAiProvider();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'AI 模型配置保存失败');
    } finally {
      setSavingAiProvider(false);
    }
  }

  function createAiProviderDraft() {
    setSelectedAiProviderId('__new__');
    setAiDraft({
      name: '新模型配置',
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
    if (!canManageAiProvider) return toast.error('当前账号无权维护 AI 模型配置');
    try {
      await activateAiProviderConfig(id);
      setSelectedAiProviderId(id);
      toast.success('AI 模型配置已启用');
      await reloadAiProvider();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '启用失败');
    }
  }

  async function handleToggleAiProvider(id: string, enabled: boolean) {
    if (!canManageAiProvider) return toast.error('当前账号无权维护 AI 模型配置');
    try {
      await updateAiProviderStatus(id, enabled);
      toast.success(enabled ? 'AI 模型配置已启用' : 'AI 模型配置已禁用');
      await reloadAiProvider();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '状态更新失败');
    }
  }

  async function handleDeleteAiProvider(id: string) {
    if (!canManageAiProvider) return toast.error('当前账号无权维护 AI 模型配置');
    const item = aiProvider?.providers?.find((provider) => provider.id === id);
    const ok = await confirm({
      title: `删除 AI 配置“${item?.name || item?.model || id}”？`,
      description: '删除后不会影响历史 AI 结果，但该模型连接配置不可恢复。',
      confirmText: '删除配置',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const next = await deleteAiProviderConfig(id);
      setSelectedAiProviderId(next.activeId || next.providers?.[0]?.id || null);
      toast.success('AI 模型配置已删除');
      await reloadAiProvider();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '删除失败');
    }
  }

  async function handleTestAiProvider() {
    if (!canManageAiProvider) return toast.error('当前账号无权测试 AI Provider');
    setTestingAiProvider(true);
    setAiTestResult({ status: 'idle', message: '正在调用模型服务进行连通性测试...' });
    try {
      const result = await testAiProviderConfig();
      setAiTestResult({
        status: 'success',
        message: '连接成功，当前配置可用于 AI 对话、文档分析和图片识别。',
        latencyMs: result.latencyMs,
        sample: result.sample || '无内容',
        testedAt: new Date().toISOString(),
      });
      toast.success('AI Provider 连接成功');
      await reloadAiProvider();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'AI Provider 测试失败';
      setAiTestResult({ status: 'error', message, testedAt: new Date().toISOString() });
      toast.error(message);
      await reloadAiProvider();
    } finally {
      setTestingAiProvider(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <AccountPanel sessionUser={sessionUser} />

        <ApiConfigPanel
          apiDraft={apiDraft}
          apiConfig={apiConfig}
          setApiDraft={setApiDraft}
          onSave={saveApiConfig}
        />

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

        <AiPrefsPanel
          aiPrefsDraft={aiPrefsDraft}
          aiPrefs={aiPrefs}
          setAiPrefsDraft={setAiPrefsDraft}
          onSave={saveAiPrefs}
        />

        <NotificationsPanel
          notifDraft={notifDraft}
          notifConfig={notifConfig}
          setNotifDraft={setNotifDraft}
          onSave={saveNotifConfig}
        />
      </div>
    </div>
  );
}
