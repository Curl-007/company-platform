import type { Dispatch, SetStateAction } from 'react';
import Panel from '../../../components/common/Panel';
import { Button, Checkbox, FormField } from '../../../components/ui';
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
  const unchanged =
    notifDraft.riskAlerts === notifConfig.riskAlerts &&
    notifDraft.aiAlerts === notifConfig.aiAlerts &&
    notifDraft.weeklyDigest === notifConfig.weeklyDigest;

  return (
    <Panel
      title="通知偏好"
      subtitle="风险、AI 与周报提醒设置"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="primary" size="sm" onClick={onSave} disabled={unchanged}>
            保存配置
          </Button>
        </div>
      }
    >
      <div className="settings-form">
        <FormField label="风险预警" htmlFor="settings-notif-risk" helpText="当项目健康度下降或风险数量上升时提醒。">
          <Checkbox id="settings-notif-risk" checked={notifDraft.riskAlerts} onChange={(e) => setNotifDraft((prev) => ({ ...prev, riskAlerts: e.target.checked }))} />
        </FormField>
        <FormField label="AI 分析完成" htmlFor="settings-notif-ai" helpText="文档完成 AI 分析后推送结果提醒。">
          <Checkbox id="settings-notif-ai" checked={notifDraft.aiAlerts} onChange={(e) => setNotifDraft((prev) => ({ ...prev, aiAlerts: e.target.checked }))} />
        </FormField>
        <FormField label="周报摘要" htmlFor="settings-notif-weekly" helpText="每周汇总项目进度、风险和待办事项。">
          <Checkbox id="settings-notif-weekly" checked={notifDraft.weeklyDigest} onChange={(e) => setNotifDraft((prev) => ({ ...prev, weeklyDigest: e.target.checked }))} />
        </FormField>
      </div>
    </Panel>
  );
}
