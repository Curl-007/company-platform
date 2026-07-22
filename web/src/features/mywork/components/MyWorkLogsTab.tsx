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
  return (
    <div className="mywork-logs-layout">
      <div className="mywork-logs-main">
        <Panel
          title="每日日报"
          subtitle="除管理员外，所有角色都需要上传日报；支持 .md .txt .doc .docx 自动识别。"
          toolbar={<button className="btn btn-primary btn-sm" onClick={onOpenLogForm}>上传今日日报</button>}
        >
          <div className="body-text">
            建议每天提交一篇日报，方便动态页留痕，并为 AI 周报生成提供完整素材。
          </div>
        </Panel>

        <Panel
          title="实际工时"
          subtitle="用于核对计划与实际投入，不用于个人绩效评分。"
          toolbar={<button className="btn btn-secondary btn-sm" onClick={onOpenTimeEntryForm}>记录工时</button>}
          className="mywork-time-panel"
        >
          {timeEntriesLoading ? (
            <div className="body-text">正在加载工时记录…</div>
          ) : timeEntriesError ? (
            <div className="form-error">工时记录加载失败，请稍后重试。</div>
          ) : timeEntries?.length ? (
            <div className="mywork-time-list">
              {timeEntries.slice(0, 6).map((entry) => (
                <div key={entry.id} className="mywork-time-row">
                  <span className="mywork-time-row-main">
                    {entry.workDate} · {entry.projectName} · {entry.category}
                  </span>
                  <div className="mywork-time-row-actions">
                    <span className="text-secondary">
                      {entry.hours}h · {entry.workNature === 'unplanned' ? '临时工作' : entry.workNature === 'planned' ? '计划内' : '待分类'}
                    </span>
                    <button className="btn btn-text btn-sm" onClick={() => onEditTimeEntry(entry)}>编辑</button>
                    <button className="btn btn-text btn-sm" onClick={() => onRemoveTimeEntry(entry)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="body-text">本周期尚无实际工时记录。</div>
          )}
        </Panel>
      </div>

      <Panel
        title="AI 周报"
        subtitle="基于本周日报自动汇总"
        toolbar={<button className="btn btn-secondary btn-sm" onClick={onRefreshWeekly}>刷新周报</button>}
        className="mywork-weekly-panel"
      >
        {weeklyLoading ? (
          <div className="body-text">周报生成中...</div>
        ) : weeklyError ? (
          <div className="form-error">{String(weeklyError)}</div>
        ) : weeklyData ? (
          <div className="mywork-weekly-body">
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-label">周起始</span>
                <span>{weeklyData.weekKey}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">日报数量</span>
                <span>{weeklyData.count}</span>
              </div>
            </div>
            <div className="section-title">AI 摘要</div>
            <div className="body-text" style={{ whiteSpace: 'pre-wrap' }}>{weeklyData.summary.summary}</div>
            <div className="section-title">周报 Markdown</div>
            <pre className="body-text mywork-weekly-markdown">{weeklyData.markdown}</pre>
          </div>
        ) : (
          <div className="body-text">本周还没有日报记录。</div>
        )}
      </Panel>
    </div>
  );
}
