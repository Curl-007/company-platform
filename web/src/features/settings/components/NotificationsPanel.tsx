import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const unchanged =
    notifDraft.riskAlerts === notifConfig.riskAlerts &&
    notifDraft.aiAlerts === notifConfig.aiAlerts &&
    notifDraft.weeklyDigest === notifConfig.weeklyDigest;

  return (
    <Panel
      title={t('features.settings.notificationsPanel.title')}
      subtitle={t('features.settings.notificationsPanel.subtitle')}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="primary" size="sm" onClick={onSave} disabled={unchanged}>
            {t('features.settings.notificationsPanel.saveConfig')}
          </Button>
        </div>
      }
    >
      <div className="settings-form">
        <FormField label={t('features.settings.notificationsPanel.riskAlertsLabel')} htmlFor="settings-notif-risk" helpText={t('features.settings.notificationsPanel.riskAlertsHelp')}>
          <Checkbox id="settings-notif-risk" checked={notifDraft.riskAlerts} onChange={(e) => setNotifDraft((prev) => ({ ...prev, riskAlerts: e.target.checked }))} />
        </FormField>
        <FormField label={t('features.settings.notificationsPanel.aiAlertsLabel')} htmlFor="settings-notif-ai" helpText={t('features.settings.notificationsPanel.aiAlertsHelp')}>
          <Checkbox id="settings-notif-ai" checked={notifDraft.aiAlerts} onChange={(e) => setNotifDraft((prev) => ({ ...prev, aiAlerts: e.target.checked }))} />
        </FormField>
        <FormField label={t('features.settings.notificationsPanel.weeklyDigestLabel')} htmlFor="settings-notif-weekly" helpText={t('features.settings.notificationsPanel.weeklyDigestHelp')}>
          <Checkbox id="settings-notif-weekly" checked={notifDraft.weeklyDigest} onChange={(e) => setNotifDraft((prev) => ({ ...prev, weeklyDigest: e.target.checked }))} />
        </FormField>
      </div>
    </Panel>
  );
}
