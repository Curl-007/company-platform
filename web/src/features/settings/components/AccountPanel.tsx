import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import { useTranslation } from 'react-i18next';
import type { SessionUser } from '../../../types';
import { USER_ROLE_LABELS, labelOf } from '../../../constants/enums';

export default function AccountPanel({ sessionUser }: { sessionUser: SessionUser | null }) {
  const { t } = useTranslation();
  return (
    <Panel title={t('features.settings.accountPanel.title')} subtitle={t('features.settings.accountPanel.subtitle')}>
      <div className="account-info-grid">
        <div className="account-info-item">
          <span className="account-info-label">{t('features.settings.accountPanel.nameLabel')}</span>
          <span className="account-info-value font-medium">{sessionUser?.name ?? t('features.settings.accountPanel.notLoggedIn')}</span>
        </div>
        <div className="account-info-item">
          <span className="account-info-label">{t('features.settings.accountPanel.emailLabel')}</span>
          <span className="account-info-value text-mono">{sessionUser?.email ?? t('enums.unfilled')}</span>
        </div>
        <div className="account-info-item">
          <span className="account-info-label">{t('features.settings.accountPanel.roleLabel')}</span>
          <span className="account-info-value">
            {sessionUser ? <StatusBadge label={labelOf(USER_ROLE_LABELS, sessionUser.role)} status={sessionUser.role} showDot={false} /> : t('enums.unset')}
          </span>
        </div>
        <div className="account-info-item">
          <span className="account-info-label">{t('features.settings.accountPanel.permissionsLabel')}</span>
          <span className="account-info-value">{sessionUser?.permissions?.length ? sessionUser.permissions.join(t('features.settings.accountPanel.permissionsJoin')) : t('features.settings.accountPanel.unconfigured')}</span>
        </div>
      </div>
    </Panel>
  );
}
