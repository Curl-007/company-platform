import StatusBadge from '../../../components/common/StatusBadge';
import ProgressBar from '../../../components/common/ProgressBar';
import DataTable, { type DataTableColumn } from '../../../components/common/DataTable';
import Panel from '../../../components/common/Panel';
import type { Project, RequirementProgress } from '../../../types';
import { PROJECT_STATUS_LABELS, healthVariant, labelOf } from '../../../constants/enums';
import type { ReportActionItem } from '../reportModel';

export const riskyColumns: DataTableColumn<Project>[] = [
  {
    key: 'name',
    title: '项目名称',
    render: (project) => <span className="font-medium">{project.name}</span>,
  },
  {
    key: 'status',
    title: '状态',
    render: (project) => <StatusBadge label={labelOf(PROJECT_STATUS_LABELS, project.status)} status={project.status} />,
  },
  {
    key: 'healthScore',
    title: '健康度',
    align: 'center',
    sorter: (a, b) => a.healthScore - b.healthScore,
    render: (project) => (
      <StatusBadge label={String(project.healthScore)} variant={healthVariant(project.healthScore)} showDot={false} />
    ),
  },
  {
    key: 'riskCount',
    title: '风险数',
    align: 'center',
    sorter: (a, b) => a.riskCount - b.riskCount,
    render: (project) => <span className="text-mono">{project.riskCount}</span>,
  },
  {
    key: 'progress',
    title: '进度',
    width: 160,
    render: (project) => <ProgressBar percent={project.progress ?? 0} height={6} />,
  },
];

export const requirementColumns: DataTableColumn<RequirementProgress>[] = [
  {
    key: 'title',
    title: '需求',
    render: (item) => <span className="font-medium">{item.title}</span>,
  },
  {
    key: 'projectName',
    title: '所属项目',
    render: (item) => <span className="text-secondary">{item.projectName}</span>,
  },
  {
    key: 'completion',
    title: '完成度',
    width: 180,
    sorter: (a, b) => a.completion - b.completion,
    render: (item) => (
      <div style={{ minWidth: 140 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <span className="text-secondary text-mono">{item.completion}%</span>
          <StatusBadge
            label={item.completion >= 80 ? '稳定' : item.completion >= 50 ? '推进中' : '低进展'}
            variant={item.completion >= 80 ? 'success' : item.completion >= 50 ? 'warning' : 'risk'}
            showDot={false}
          />
        </div>
        <ProgressBar percent={item.completion} showPercent={false} height={6} />
      </div>
    ),
  },
];

export function ActionList({ items }: { items: ReportActionItem[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item) => (
        <div key={item.title} className={`action-summary-item ${item.tone}`} style={{ justifyContent: 'flex-start', alignItems: 'flex-start' }}>
          <StatusBadge label={item.title} variant={item.tone === 'info' ? 'info' : item.tone} showDot={false} />
          <span style={{ lineHeight: 1.6 }}>{item.detail}</span>
        </div>
      ))}
    </div>
  );
}

export function ProgressLine({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'success' | 'warning' | 'risk' | 'info' }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  const color = tone === 'success'
    ? 'var(--color-success)'
    : tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'risk'
        ? 'var(--color-risk)'
        : 'var(--color-info)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span className="font-medium">{label}</span>
        <span className="text-secondary text-mono">{value}/{total}</span>
      </div>
      <div className="health-rank-bar-track">
        <div className="health-rank-bar-fill" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  );
}

export function RequirementProgressTable({ items }: { items: RequirementProgress[] }) {
  return (
    <Panel title="需求进度" subtitle="跟踪各需求完成情况">
      {items.length === 0 ? (
        <p className="body-text" style={{ margin: 0 }}>暂无需求进度数据。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((item) => (
            <div key={item.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span className="font-medium" style={{ minWidth: 0 }}>{item.title}</span>
                <span className="text-secondary text-mono">{item.completion}%</span>
              </div>
              <div className="text-secondary" style={{ fontSize: 12, marginBottom: 4 }}>{item.projectName}</div>
              <ProgressBar percent={item.completion} showPercent={false} height={6} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
