import type { Dispatch, SetStateAction } from 'react';
import Panel from '../../../components/common/Panel';
import { Button } from '../../../components/ui';
import { DEFAULT_NOTIF_CONFIG } from '../settingsModel';

type NotifConfig = typeof DEFAULT_NOTIF_CONFIG;

export default function NotificationsPanel({
  notifDraft,
  notifConfig,
  setNotifDraft,
  onSave,
}: {
  notifDraft: NotifConfig;
  notifConfig: NotifConfig;
  setNotifDraft: Dispatch<SetStateAction<NotifConfig>>;
  onSave: () => void;
}) {
  return (
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
            onClick={onSave}
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
  );
}
