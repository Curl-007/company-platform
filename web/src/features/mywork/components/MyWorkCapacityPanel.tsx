import { useTranslation } from 'react-i18next';
import Panel from '../../../components/common/Panel';
import type { CapacityMemberOverview } from '../../../types';

export default function MyWorkCapacityPanel({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: unknown;
  data: CapacityMemberOverview | null | undefined;
}) {
  const { t } = useTranslation();
  return (
    <Panel title={t('features.mywork.myWorkCapacityPanel.panelTitle')} subtitle={t('features.mywork.myWorkCapacityPanel.panelSubtitle')} className="mywork-capacity-panel">
      {loading ? (
        <div className="body-text">{t('features.mywork.myWorkCapacityPanel.loadingCapacity')}</div>
      ) : error ? (
        <div className="form-error">{t('features.mywork.myWorkCapacityPanel.loadFailed')}</div>
      ) : data ? (
        <div className="detail-grid mywork-capacity-grid">
          <div className="detail-field">
            <span className="detail-label">{t('features.mywork.myWorkCapacityPanel.effectiveHoursLabel')}</span>
            <span className="detail-value">{t('features.mywork.myWorkCapacityPanel.hoursValue', { hours: data.effectiveHours })}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.mywork.myWorkCapacityPanel.plannedHoursLabel')}</span>
            <span className="detail-value">{t('features.mywork.myWorkCapacityPanel.hoursValue', { hours: data.plannedHours })}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.mywork.myWorkCapacityPanel.actualHoursLabel')}</span>
            <span className="detail-value">{t('features.mywork.myWorkCapacityPanel.hoursValue', { hours: data.actualHours })}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.mywork.myWorkCapacityPanel.unplannedLabel')}</span>
            <span className="detail-value">{t('features.mywork.myWorkCapacityPanel.hoursValue', { hours: data.unplannedActualHours })}{data.unplannedRatio === null ? t('features.mywork.myWorkCapacityPanel.unplannedRatioUnspecified') : t('features.mywork.myWorkCapacityPanel.unplannedRatioValue', { percent: Math.round(data.unplannedRatio * 100) })}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.mywork.myWorkCapacityPanel.loadRatioLabel')}</span>
            <span className="detail-value">
              {data.loadRatio === null ? t('features.mywork.myWorkCapacityPanel.loadRatioUnset') : `${Math.round(data.loadRatio * 100)}%`}
            </span>
          </div>
          <div className="detail-field">
            <span className="detail-label">{t('features.mywork.myWorkCapacityPanel.riskLabel')}</span>
            <span className="detail-value">{data.risk.label}</span>
          </div>
        </div>
      ) : (
        <div className="body-text">{t('features.mywork.myWorkCapacityPanel.noPlanHint')}</div>
      )}
    </Panel>
  );
}
