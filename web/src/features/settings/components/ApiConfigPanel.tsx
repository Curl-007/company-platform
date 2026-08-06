import type { Dispatch, SetStateAction } from 'react';
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
  const unchanged =
    apiDraft.endpoint === apiConfig.endpoint &&
    apiDraft.timeout === apiConfig.timeout &&
    apiDraft.logRequests === apiConfig.logRequests;

  return (
    <Panel
      title="API 配置"
      subtitle="后端服务连接参数"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="primary" size="sm" onClick={onSave} disabled={unchanged}>
            保存配置
          </Button>
        </div>
      }
    >
      <div className="settings-form">
        <FormField label="API 地址" htmlFor="settings-api-endpoint">
          <TextInput id="settings-api-endpoint" value={apiDraft.endpoint} onChange={(e) => setApiDraft((prev) => ({ ...prev, endpoint: e.target.value }))} placeholder="http://localhost:4010" />
        </FormField>
        <div className="form-row">
          <FormField label="请求超时（秒）" htmlFor="settings-api-timeout" helpText="请求超过该时长视为失败，范围 5–120 秒。">
            <TextInput id="settings-api-timeout" type="number" min={5} max={120} value={apiDraft.timeout} onChange={(e) => setApiDraft((prev) => ({ ...prev, timeout: Number(e.target.value) }))} />
          </FormField>
          <FormField label="请求日志" htmlFor="settings-api-log-requests" helpText="开启后记录所有 API 请求，便于排查连接问题。">
            <Checkbox id="settings-api-log-requests" checked={apiDraft.logRequests} onChange={(e) => setApiDraft((prev) => ({ ...prev, logRequests: e.target.checked }))} />
          </FormField>
        </div>
      </div>
    </Panel>
  );
}
