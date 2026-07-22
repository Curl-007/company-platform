import type { Dispatch, SetStateAction } from 'react';
import type { AiProviderConfig, UpdateAiProviderInput } from '../../../types';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import { Button, FormField, SelectInput, TextInput } from '../../../components/ui';
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
  return (
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
  );
}
