import Panel from '../../../components/common/Panel';
import DonutChart from '../../../components/common/DonutChart';
import type { DashboardData } from '../../../types';
import type { ReportModel } from '../reportModel';
import { ActionList, ProgressLine } from './ReportShared';

export default function OverviewReport({
  data,
  reportModel,
}: {
  data: DashboardData;
  reportModel: ReportModel;
}) {
  return (
    <>
      <div className="action-summary-row mt-20">
        {reportModel.healthBuckets.map((bucket) => (
          <div key={bucket.label} className={`action-summary-item ${bucket.tone}`}>
            <span>{bucket.label}项目</span>
            <strong>{bucket.count}</strong>
          </div>
        ))}
        <div className={`action-summary-item ${reportModel.blockedRate > 0 ? 'warning' : 'success'}`}>
          <span>阻塞任务</span>
          <strong>{reportModel.blockedRate}%</strong>
        </div>
      </div>

      <Panel title="关键指标对比" subtitle="健康度 / 测试通过率 / 需求完成率" className="mt-20">
        <div className="donut-row">
          <div className="donut-cell">
            <DonutChart value={data.metrics.projectHealthAverage} label="项目健康" size={140} />
            <span className="donut-caption">项目平均健康度</span>
          </div>
          <div className="donut-cell">
            <DonutChart value={data.metrics.testPassRate} label="测试通过" size={140} />
            <span className="donut-caption">测试通过率</span>
          </div>
          <div className="donut-cell">
            <DonutChart value={data.metrics.requirementCompletionAverage} label="需求完成" size={140} />
            <span className="donut-caption">需求完成率</span>
          </div>
        </div>
      </Panel>

      <div className="grid-2 mt-20">
        <Panel title="管理动作建议" subtitle="按当前指标自动生成">
          <ActionList items={reportModel.actionItems} />
        </Panel>
        <Panel title="任务交付概览" subtitle={`完成率 ${reportModel.doneRate}%`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProgressLine label="已完成" value={Number(reportModel.taskCounts.done ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="success" />
            <ProgressLine label="进行中" value={Number(reportModel.taskCounts.in_progress ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="info" />
            <ProgressLine label="阻塞" value={Number(reportModel.taskCounts.blocked ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="risk" />
            <ProgressLine label="待验收" value={Number(reportModel.taskCounts.acceptance ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="warning" />
          </div>
        </Panel>
      </div>
    </>
  );
}
