import type { Dispatch, SetStateAction } from 'react';
import Panel from '../../../components/common/Panel';
import { Button, FormField, TextInput } from '../../../components/ui';
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
  return (
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
            onClick={onSave}
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
  );
}
