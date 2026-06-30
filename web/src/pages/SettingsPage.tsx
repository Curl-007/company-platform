import { useEffect, useState } from 'react';
import { getSessionUser } from '../services/auth';
import {
  activateAiProviderConfig,
  deleteAiProviderConfig,
  fetchAiProviderConfig,
  updateAiProviderStatus,
  updateAiProviderConfig,
  testAiProviderConfig,
} from '../services/resources';
import { ApiError } from '../services/api';
import type { AiProviderConfig, AiProviderHealth, UpdateAiProviderInput } from '../types';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import StatusBadge from '../components/common/StatusBadge';
import { USER_ROLE_LABELS, labelOf } from '../constants/enums';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import { Button, FormField, SelectInput, TextInput } from '../components/ui';
import { canOperate } from '../constants/roles';

type AiTestState =
  | { status: 'idle'; message: string }
  | { status: 'success'; message: string; latencyMs: number; sample: string; testedAt: string }
  | { status: 'error'; message: string; testedAt: string };

function loadConfig<T>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaults;
  } catch {
    return defaults;
  }
}

function formatTestTime(value?: string) {
  if (!value) return '未测试';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return '刚刚';
  }
}

function formatHealthTime(value?: string | null) {
  if (!value) return '暂无记录';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return '刚刚';
  }
}

function aiHealthLabel(status?: AiProviderHealth['status']) {
  const labels: Record<AiProviderHealth['status'], string> = {
    healthy: '健康',
    degraded: '降级',
    unavailable: '不可用',
    unconfigured: '未配置',
    unknown: '待验证',
    disabled: '已禁用',
  };
  return labels[status || 'unknown'];
}

function aiHealthVariant(status?: AiProviderHealth['status']) {
  if (status === 'healthy') return 'success';
  if (status === 'degraded') return 'warning';
  if (status === 'unavailable') return 'risk';
  if (status === 'unconfigured') return 'neutral';
  if (status === 'disabled') return 'neutral';
  return 'info';
}

function AiProviderHealthCard({
  provider,
  loading,
  onRefresh,
}: {
  provider?: AiProviderConfig | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const health = provider?.health;
  const lastError = health?.lastErrorMessage?.trim();
  return (
    <div className={`ai-health-card ${health?.status || 'unknown'}`}>
      <div className="ai-health-head">
        <div>
          <div className="ai-health-title">AI 健康状态</div>
          <div className="ai-health-subtitle">记录最近一次真实模型调用与供应商异常，兜底成功也会保留失败原因。</div>
        </div>
        <div className="ai-health-actions">
          <StatusBadge label={aiHealthLabel(health?.status)} status={aiHealthVariant(health?.status)} showDot />
          <Button variant="secondary" size="sm" onClick={onRefresh} disabled={loading}>刷新</Button>
        </div>
      </div>
      <div className="ai-health-grid">
        <div className="ai-health-metric">
          <span>最近成功</span>
          <strong>{formatHealthTime(health?.lastSuccessAt)}</strong>
        </div>
        <div className="ai-health-metric">
          <span>最近失败</span>
          <strong>{formatHealthTime(health?.lastFailureAt)}</strong>
        </div>
        <div className="ai-health-metric">
          <span>最近耗时</span>
          <strong>{health?.lastLatencyMs != null ? `${health.lastLatencyMs}ms` : '暂无记录'}</strong>
        </div>
        <div className="ai-health-metric">
          <span>连续失败</span>
          <strong>{health?.consecutiveFailures ?? 0}</strong>
        </div>
      </div>
      <div className="ai-health-foot">
        <span>最近协议：{health?.lastWireApi === 'responses' ? 'Responses API' : health?.lastWireApi === 'chat_completions' ? 'Chat Completions' : '暂无记录'}</span>
        <span>最近尝试：{formatHealthTime(health?.lastAttemptAt)}</span>
      </div>
      {lastError ? (
        <div className="ai-health-error">
          <span>{health?.lastErrorCode ? `错误 ${health.lastErrorCode}` : '最近失败原因'}</span>
          <p>{lastError}</p>
        </div>
      ) : null}
    </div>
  );
}

function AiProviderTestResultCard({ result, testing }: { result: AiTestState; testing: boolean }) {
  const statusLabel = testing
    ? '测试中'
    : result.status === 'success'
      ? '连接成功'
      : result.status === 'error'
        ? '连接失败'
        : '待测试';
  const status = testing
    ? 'info'
    : result.status === 'success'
      ? 'success'
      : result.status === 'error'
        ? 'risk'
        : 'warning';

  return (
    <div className={`ai-test-card ${testing ? 'testing' : result.status}`}>
      <div className="ai-test-card-head">
        <StatusBadge label={statusLabel} status={status} showDot />
        <span>{result.status === 'idle' ? '未完成连接验证' : formatTestTime(result.testedAt)}</span>
      </div>
      <p>{result.message}</p>
      {result.status === 'success' ? (
        <div className="ai-test-card-grid">
          <span>耗时 <strong>{result.latencyMs}ms</strong></span>
          <span>样例 <strong>{result.sample}</strong></span>
        </div>
      ) : null}
    </div>
  );
}

function SettingsPage() {
  const sessionUser = getSessionUser();
  const canManageAiProvider = canOperate(sessionUser, 'aiProvider:manage');
  const toast = useToast();
  const confirm = useConfirm();
  const {
    data: aiProvider,
    loading: aiProviderLoading,
    error: aiProviderError,
    reload: reloadAiProvider,
  } = useAsync<AiProviderConfig>(fetchAiProviderConfig, []);

  const [apiConfig, setApiConfig] = useState(() =>
    loadConfig('settings:api', { endpoint: 'http://localhost:4010', timeout: 15, logRequests: false }),
  );
  const [apiDraft, setApiDraft] = useState(apiConfig);
  const [aiPrefs, setAiPrefs] = useState(() =>
    loadConfig('settings:ai:prefs', { confidenceThreshold: 80, autoAnalyze: false }),
  );
  const [aiPrefsDraft, setAiPrefsDraft] = useState(aiPrefs);
  const [notifConfig, setNotifConfig] = useState(() =>
    loadConfig('settings:notifications', { riskAlerts: true, aiAlerts: true, weeklyDigest: false }),
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
    localStorage.setItem('settings:api', JSON.stringify(apiDraft));
    toast.success('API 配置已保存');
  }

  function saveAiPrefs() {
    setAiPrefs(aiPrefsDraft);
    localStorage.setItem('settings:ai:prefs', JSON.stringify(aiPrefsDraft));
    toast.success('AI 分析策略已保存');
  }

  function saveNotifConfig() {
    setNotifConfig(notifDraft);
    localStorage.setItem('settings:notifications', JSON.stringify(notifDraft));
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
      <PageHeader
        title="系统设置"
        description="维护平台连接、AI 模型、分析策略和通知偏好。成员账号请在团队管理中维护。"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Panel title="当前账号" subtitle="只展示登录账号信息；成员维护已收敛到团队管理">
          <div className="account-info-grid">
            <div className="account-info-item">
              <span className="account-info-label">姓名</span>
              <span className="account-info-value font-medium">{sessionUser?.name ?? '未登录'}</span>
            </div>
            <div className="account-info-item">
              <span className="account-info-label">邮箱</span>
              <span className="account-info-value text-mono">{sessionUser?.email ?? '未填写'}</span>
            </div>
            <div className="account-info-item">
              <span className="account-info-label">角色</span>
              <span className="account-info-value">
                {sessionUser ? <StatusBadge label={labelOf(USER_ROLE_LABELS, sessionUser.role)} status={sessionUser.role} showDot={false} /> : '未设置'}
              </span>
            </div>
            <div className="account-info-item">
              <span className="account-info-label">权限</span>
              <span className="account-info-value">{sessionUser?.permissions?.length ? sessionUser.permissions.join('、') : '未配置'}</span>
            </div>
          </div>
        </Panel>

        <Panel title="API 配置" subtitle="后端服务连接参数">
          <div className="settings-form">
            <FormField label="API 地址" htmlFor="settings-api-endpoint">
              <TextInput id="settings-api-endpoint" value={apiDraft.endpoint} onChange={(e) => setApiDraft((prev) => ({ ...prev, endpoint: e.target.value }))} placeholder="http://localhost:4010" />
            </FormField>
            <div className="form-row">
              <FormField label="请求超时（秒）" htmlFor="settings-api-timeout">
                <TextInput id="settings-api-timeout" type="number" min={5} max={120} value={apiDraft.timeout} onChange={(e) => setApiDraft((prev) => ({ ...prev, timeout: Number(e.target.value) }))} />
              </FormField>
              <div className="form-group" style={{ justifyContent: 'center' }}>
                <label className="form-checkbox" style={{ marginTop: 24 }}>
                  <input type="checkbox" checked={apiDraft.logRequests} onChange={(e) => setApiDraft((prev) => ({ ...prev, logRequests: e.target.checked }))} />
                  <span>记录请求日志</span>
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={saveApiConfig}
                disabled={
                  apiDraft.endpoint === apiConfig.endpoint &&
                  apiDraft.timeout === apiConfig.timeout &&
                  apiDraft.logRequests === apiConfig.logRequests
                }
              >
                保存配置
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="AI 模型配置" subtitle="系统管理员维护模型服务连接；API Key 只在后端保存，页面不回显明文">
          <div className="settings-form">
            {!canManageAiProvider ? (
              <div className="form-error">当前账号只能查看配置状态，不能修改或测试 AI Provider。</div>
            ) : null}
            {aiProviderLoading ? (
              <div className="ai-provider-status">
                <div className="ai-provider-status-main">正在读取 AI Provider 配置...</div>
              </div>
            ) : aiProviderError ? (
              <div className="ai-provider-status">
                <div className="ai-provider-status-main">AI Provider 配置读取失败</div>
                <div className="ai-provider-status-meta">{aiProviderError}</div>
                <Button variant="secondary" size="sm" onClick={reloadAiProvider}>重试</Button>
              </div>
            ) : (
              <div className="ai-provider-status">
                <div className="ai-provider-status-main">
                  <StatusBadge label={aiProvider?.configured ? '已配置' : '未配置'} status={aiProvider?.configured ? 'success' : 'warning'} showDot />
                  <span className="text-mono">{aiProvider?.model || '未设置模型'}</span>
                  <span>{aiProvider?.baseUrlHost || '未设置服务地址'}</span>
                </div>
                <div className="ai-provider-status-meta">
                  密钥：{aiProvider?.apiKeyMasked || '未配置'} · 来源：{aiProvider?.apiKeySource === 'environment' ? '环境变量' : aiProvider?.apiKeySource === 'database' ? '系统设置' : '无'} · 协议：{aiProvider?.wireApi === 'responses' ? 'Responses API' : 'Chat Completions'}
                </div>
              </div>
            )}

            <div className="ai-provider-list">
              <div className="ai-provider-list-head">
                <div>
                  <strong>模型配置列表</strong>
                  <span>当前启用的配置会用于 AI 对话、文档分析和项目建议。</span>
                </div>
                <Button variant="secondary" size="sm" onClick={createAiProviderDraft} disabled={!canManageAiProvider}>新增配置</Button>
              </div>
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
                            {active ? <StatusBadge label="当前使用" status="success" showDot={false} /> : null}
                            <StatusBadge label={item.enabled ? '已启用' : '已禁用'} status={item.enabled ? 'info' : 'neutral'} showDot={false} />
                          </div>
                          <div className="ai-provider-row-meta">
                            <span className="text-mono">{item.model}</span>
                            <span>{item.baseUrlHost || item.baseUrl}</span>
                            <span>{item.wireApi === 'responses' ? 'Responses API' : 'Chat Completions'}</span>
                            <span>密钥：{item.apiKeyMasked || '未配置'}</span>
                          </div>
                        </div>
                        <div className="ai-provider-row-actions">
                          <Button variant="text" size="sm" onClick={() => editAiProvider(item.id)} disabled={!canManageAiProvider}>编辑</Button>
                          {!active ? (
                            <Button variant="secondary" size="sm" onClick={() => handleActivateAiProvider(item.id)} disabled={!canManageAiProvider || !item.enabled}>设为当前</Button>
                          ) : null}
                          <Button variant="secondary" size="sm" onClick={() => handleToggleAiProvider(item.id, !item.enabled)} disabled={!canManageAiProvider}>
                            {item.enabled ? '禁用' : '启用'}
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDeleteAiProvider(item.id)} disabled={!canManageAiProvider}>删除</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="ai-provider-empty">暂无模型配置，请新增一个模型连接。</div>
              )}
            </div>

            <AiProviderHealthCard provider={aiProvider} loading={aiProviderLoading} onRefresh={reloadAiProvider} />

            <div className="ai-provider-editor-head">
              <div>
                <strong>{aiDraft.createNew ? '新增模型配置' : '编辑模型配置'}</strong>
                <span>{aiDraft.createNew ? '保存后会加入列表，并可设为当前使用。' : '修改后会更新选中的模型连接配置。'}</span>
              </div>
              <label className="form-checkbox">
                <input type="checkbox" checked={Boolean(aiDraft.activate)} onChange={(e) => setAiDraft((prev) => ({ ...prev, activate: e.target.checked }))} disabled={!canManageAiProvider} />
                <span>保存后设为当前使用</span>
              </label>
            </div>

            <div className="form-row">
              <FormField label="配置名称" htmlFor="settings-ai-name">
                <TextInput id="settings-ai-name" value={aiDraft.name || ''} onChange={(e) => setAiDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="例如：生产模型 / 备用模型" disabled={!canManageAiProvider} />
              </FormField>
              <FormField label="Provider 名称" htmlFor="settings-ai-provider">
                <TextInput id="settings-ai-provider" value={aiDraft.provider} onChange={(e) => setAiDraft((prev) => ({ ...prev, provider: e.target.value }))} placeholder="openai-compatible / my_codex" disabled={!canManageAiProvider} />
              </FormField>
            </div>
            <div className="form-row">
              <FormField label="Wire API" htmlFor="settings-ai-wire-api">
                <SelectInput id="settings-ai-wire-api" value={aiDraft.wireApi} onChange={(e) => setAiDraft((prev) => ({ ...prev, wireApi: e.target.value as UpdateAiProviderInput['wireApi'] }))} disabled={!canManageAiProvider}>
                  <option value="chat_completions">Chat Completions</option>
                  <option value="responses">Responses API</option>
                </SelectInput>
              </FormField>
              <FormField label="Base URL" htmlFor="settings-ai-base-url" required>
                <TextInput id="settings-ai-base-url" value={aiDraft.baseUrl} onChange={(e) => setAiDraft((prev) => ({ ...prev, baseUrl: e.target.value }))} placeholder="https://www.ishellmall.com/v1" disabled={!canManageAiProvider} />
              </FormField>
            </div>
            <div className="form-row">
              <FormField label="Model" htmlFor="settings-ai-model" required>
                <TextInput id="settings-ai-model" value={aiDraft.model} onChange={(e) => setAiDraft((prev) => ({ ...prev, model: e.target.value }))} placeholder="gpt-5.5" disabled={!canManageAiProvider} />
              </FormField>
              <label className="form-checkbox" style={{ marginTop: 24 }}>
                <input type="checkbox" checked={Boolean(aiDraft.enabled)} onChange={(e) => setAiDraft((prev) => ({ ...prev, enabled: e.target.checked }))} disabled={!canManageAiProvider} />
                <span>启用这条模型配置</span>
              </label>
            </div>
            <FormField label="API Key" htmlFor="settings-ai-api-key" helpText="保存后页面只显示脱敏状态，不会回显完整密钥。你贴的示例建议使用 Responses API。">
              <TextInput id="settings-ai-api-key" type="password" value={aiDraft.apiKey} onChange={(e) => setAiDraft((prev) => ({ ...prev, apiKey: e.target.value, clearApiKey: false }))} placeholder={aiProvider?.apiKeyMasked ? '留空表示继续使用当前密钥' : '填写 API Key'} autoComplete="off" disabled={!canManageAiProvider} />
            </FormField>
            <div className="form-row">
              <label className="form-checkbox" style={{ marginTop: 4 }}>
                <input type="checkbox" checked={aiDraft.disableResponseStorage} onChange={(e) => setAiDraft((prev) => ({ ...prev, disableResponseStorage: e.target.checked }))} disabled={!canManageAiProvider} />
                <span>禁用模型服务响应存储</span>
              </label>
              <label className="form-checkbox">
                <input type="checkbox" checked={Boolean(aiDraft.clearApiKey)} onChange={(e) => setAiDraft((prev) => ({ ...prev, clearApiKey: e.target.checked, apiKey: e.target.checked ? '' : prev.apiKey }))} disabled={!canManageAiProvider} />
                <span>清除已保存密钥</span>
              </label>
            </div>
            <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={handleTestAiProvider} disabled={!canManageAiProvider || testingAiProvider || savingAiProvider || !aiProvider?.configured}>
                {testingAiProvider ? '测试中...' : '测试连接'}
              </Button>
              <Button variant="primary" size="sm" onClick={saveAiProvider} disabled={!canManageAiProvider || savingAiProvider || testingAiProvider}>
                {savingAiProvider ? '保存中...' : '保存模型配置'}
              </Button>
            </div>
            <AiProviderTestResultCard result={aiTestResult} testing={testingAiProvider} />
          </div>
        </Panel>

        <Panel title="AI 分析策略" subtitle="控制自动分析和人工确认阈值">
          <div className="settings-form">
            <div className="form-group">
              <label className="form-label">自动确认阈值</label>
              <div className="flex items-center gap-2">
                <input className="form-input" type="range" min={0} max={100} step={5} value={aiPrefsDraft.confidenceThreshold} onChange={(e) => setAiPrefsDraft((prev) => ({ ...prev, confidenceThreshold: Number(e.target.value) }))} style={{ flex: 1 }} />
                <span className="text-mono" style={{ minWidth: 32, textAlign: 'right' }}>{aiPrefsDraft.confidenceThreshold}%</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-checkbox">
                <input type="checkbox" checked={aiPrefsDraft.autoAnalyze} onChange={(e) => setAiPrefsDraft((prev) => ({ ...prev, autoAnalyze: e.target.checked }))} />
                <span>新文档上传后自动触发 AI 分析</span>
              </label>
            </div>
            <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={saveAiPrefs}
                disabled={
                  aiPrefsDraft.confidenceThreshold === aiPrefs.confidenceThreshold &&
                  aiPrefsDraft.autoAnalyze === aiPrefs.autoAnalyze
                }
              >
                保存策略
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="通知偏好" subtitle="风险、AI 与周报提醒设置">
          <div className="settings-form">
            <div className="form-group">
              <label className="form-checkbox">
                <input type="checkbox" checked={notifDraft.riskAlerts} onChange={(e) => setNotifDraft((prev) => ({ ...prev, riskAlerts: e.target.checked }))} />
                <span>风险预警通知</span>
              </label>
              <p className="form-help-text">当项目健康度下降或风险数量上升时提醒。</p>
            </div>
            <div className="form-group">
              <label className="form-checkbox">
                <input type="checkbox" checked={notifDraft.aiAlerts} onChange={(e) => setNotifDraft((prev) => ({ ...prev, aiAlerts: e.target.checked }))} />
                <span>AI 分析完成通知</span>
              </label>
              <p className="form-help-text">文档完成 AI 分析后推送结果提醒。</p>
            </div>
            <div className="form-group">
              <label className="form-checkbox">
                <input type="checkbox" checked={notifDraft.weeklyDigest} onChange={(e) => setNotifDraft((prev) => ({ ...prev, weeklyDigest: e.target.checked }))} />
                <span>周报摘要</span>
              </label>
              <p className="form-help-text">每周汇总项目进度、风险和待办事项。</p>
            </div>
            <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={saveNotifConfig}
                disabled={
                  notifDraft.riskAlerts === notifConfig.riskAlerts &&
                  notifDraft.aiAlerts === notifConfig.aiAlerts &&
                  notifDraft.weeklyDigest === notifConfig.weeklyDigest
                }
              >
                保存配置
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default SettingsPage;
