import { useTranslation } from 'react-i18next';
import Panel from '../../../components/common/Panel';
import type { TimeEntry, WeeklyWorkSummary } from '../../../types';

export default function MyWorkLogsTab({
  weeklyLoading,
  weeklyError,
  weeklyData,
  onRefreshWeekly,
  onOpenLogForm,
  timeEntriesLoading,
  timeEntriesError,
  timeEntries,
  onOpenTimeEntryForm,
  onEditTimeEntry,
  onRemoveTimeEntry,
}: {
  weeklyLoading: boolean;
  weeklyError: unknown;
  weeklyData: WeeklyWorkSummary | null | undefined;
  onRefreshWeekly: () => void;
  onOpenLogForm: () => void;
  timeEntriesLoading: boolean;
  timeEntriesError: unknown;
  timeEntries: TimeEntry[] | undefined;
  onOpenTimeEntryForm: () => void;
  onEditTimeEntry: (entry: TimeEntry) => void;
  onRemoveTimeEntry: (entry: TimeEntry) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mywork-logs-layout">
      <div className="mywork-logs-main">
        <Panel
          title={t('features.mywork.myWorkLogsTab.dailyLogTitle')}
          subtitle={t('features.mywork.myWorkLogsTab.dailyLogSubtitle')}
          toolbar={<button className="btn btn-primary btn-sm" onClick={onOpenLogForm}>{t('features.mywork.myWorkLogsTab.uploadDailyLog')}</button>}
        >
          <div className="body-text">
            {t('features.mywork.myWorkLogsTab.dailyLogTip')}
          </div>
        </Panel>

        <Panel
          title={t('features.mywork.myWorkLogsTab.timeEntriesTitle')}
          subtitle={t('features.mywork.myWorkLogsTab.timeEntriesSubtitle')}
          toolbar={<button className="btn btn-secondary btn-sm" onClick={onOpenTimeEntryForm}>{t('features.mywork.myWorkLogsTab.recordTimeEntry')}</button>}
          className="mywork-time-panel"
        >
          {timeEntriesLoading ? (
            <div className="body-text">{t('features.mywork.myWorkLogsTab.loadingTimeEntries')}</div>
          ) : timeEntriesError ? (
            <div className="form-error">{t('features.mywork.myWorkLogsTab.timeEntriesLoadFailed')}</div>
          ) : timeEntries?.length ? (
            <div className="mywork-time-list">
              {timeEntries.slice(0, 6).map((entry) => (
                <div key={entry.id} className="mywork-time-row">
                  <span className="mywork-time-row-main">
                    {entry.workDate} · {entry.projectName} · {entry.category}
                  </span>
                  <div className="mywork-time-row-actions">
                    <span className="text-secondary">
                      {entry.hours}h · {entry.workNature === 'unplanned' ? t('features.mywork.myWorkLogsTab.natureUnplanned') : entry.workNature === 'planned' ? t('features.mywork.myWorkLogsTab.naturePlanned') : t('features.mywork.myWorkLogsTab.natureUnspecified')}
                    </span>
                    <button className="btn btn-text btn-sm" onClick={() => onEditTimeEntry(entry)}>{t('common.edit')}</button>
                    <button className="btn btn-text btn-sm" onClick={() => onRemoveTimeEntry(entry)}>{t('common.delete')}</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="body-text">{t('features.mywork.myWorkLogsTab.noTimeEntries')}</div>
          )}
        </Panel>
      </div>

      <Panel
        title={t('features.mywork.myWorkLogsTab.aiWeeklyTitle')}
        subtitle={t('features.mywork.myWorkLogsTab.aiWeeklySubtitle')}
        toolbar={<button className="btn btn-secondary btn-sm" onClick={onRefreshWeekly}>{t('features.mywork.myWorkLogsTab.refreshWeekly')}</button>}
        className="mywork-weekly-panel"
      >
        {weeklyLoading ? (
          <div className="body-text">{t('features.mywork.myWorkLogsTab.weeklyGenerating')}</div>
        ) : weeklyError ? (
          <div className="form-error">{String(weeklyError)}</div>
        ) : weeklyData ? (
          <div className="mywork-weekly-body">
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-label">{t('features.mywork.myWorkLogsTab.weekStartLabel')}</span>
                <span>{weeklyData.weekKey}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">{t('features.mywork.myWorkLogsTab.dailyLogCountLabel')}</span>
                <span>{weeklyData.count}</span>
              </div>
            </div>
            <div className="section-title">{t('features.mywork.myWorkLogsTab.aiSummaryTitle')}</div>
            <div className="body-text" style={{ whiteSpace: 'pre-wrap' }}>{weeklyData.summary.summary}</div>
            <div className="section-title">{t('features.mywork.myWorkLogsTab.weeklyMarkdownTitle')}</div>
            <pre className="body-text mywork-weekly-markdown">{weeklyData.markdown}</pre>
          </div>
        ) : (
          <div className="body-text">{t('features.mywork.myWorkLogsTab.noWeeklyData')}</div>
        )}
      </Panel>
    </div>
  );
}
