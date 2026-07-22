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
  return (
    <Panel title="我的本期容量" subtitle="用于协调任务安排，不作为个人绩效评分。" className="mywork-capacity-panel">
      {loading ? (
        <div className="body-text">正在加载本期容量…</div>
      ) : error ? (
        <div className="form-error">容量信息加载失败，请稍后刷新页面重试。</div>
      ) : data ? (
        <div className="detail-grid mywork-capacity-grid">
          <div className="detail-field">
            <span className="detail-label">有效可投入工时</span>
            <span className="detail-value">{data.effectiveHours} 小时</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">已计划工时</span>
            <span className="detail-value">{data.plannedHours} 小时</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">已记录实际工时</span>
            <span className="detail-value">{data.actualHours} 小时</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">临时工作</span>
            <span className="detail-value">{data.unplannedActualHours} 小时{data.unplannedRatio === null ? '（待分类）' : `（${Math.round(data.unplannedRatio * 100)}%）`}</span>
          </div>
          <div className="detail-field">
            <span className="detail-label">负荷比例</span>
            <span className="detail-value">
              {data.loadRatio === null ? '待配置' : `${Math.round(data.loadRatio * 100)}%`}
            </span>
          </div>
          <div className="detail-field">
            <span className="detail-label">安排提示</span>
            <span className="detail-value">{data.risk.label}</span>
          </div>
        </div>
      ) : (
        <div className="body-text">本期尚未配置容量计划，请与项目经理确认可投入时间和任务安排。</div>
      )}
    </Panel>
  );
}
