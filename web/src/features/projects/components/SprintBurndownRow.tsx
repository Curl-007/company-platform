import { useState } from 'react';
import { fetchSprintBurndown, fetchSprintCommitment, fetchSprintScopeChanges } from '../../tasks/api';
import { useAsync } from '../../../hooks/useAsync';
import BurndownChart from '../../../components/common/BurndownChart';
import StatusBadge from '../../../components/common/StatusBadge';
import { labelOf, SPRINT_STATUS_LABELS } from '../../../constants/enums';
import type { BurndownData, Sprint, SprintCommitment, SprintScopeChange } from '../../../types';

export default function SprintBurndownRow({ sprint }: { sprint: Sprint }) {
  const [open, setOpen] = useState(false);
  const { data, loading, error } = useAsync<BurndownData>(() => fetchSprintBurndown(sprint.id), [sprint.id, open], { cacheKey: 'sprints:burndown' });
  const commitmentAsync = useAsync<SprintCommitment | null>(() => fetchSprintCommitment(sprint.id), [sprint.id, open], { cacheKey: 'sprints:commitment' });
  const scopeChangesAsync = useAsync<SprintScopeChange[]>(() => fetchSprintScopeChanges(sprint.id), [sprint.id, open], { cacheKey: 'sprints:scope-changes' });
  return (
    <div>
      <div className="flex items-center justify-between">
        <button className="btn btn-text btn-sm" style={{ padding: 0, textAlign: 'left' }} onClick={() => setOpen((value) => !value)}>
          <span className="font-medium">{open ? '▼' : '▶'} {sprint.name}</span>
          <span className="text-secondary" style={{ marginLeft: 8 }}>{sprint.goal}</span>
        </button>
        <StatusBadge label={labelOf(SPRINT_STATUS_LABELS, sprint.status)} status={sprint.status} />
      </div>
      {open && <div style={{ marginTop: 8 }}>
        {loading ? <p className="text-secondary" style={{ fontSize: 13 }}>正在加载燃尽图...</p> : error || !data ? <p className="text-secondary" style={{ fontSize: 13 }}>暂无燃尽数据，设置迭代起止日期并补充任务后会显示。</p> : <>
          <BurndownChart data={data} height={260} />
          <p className="text-secondary" style={{ fontSize: 13, marginTop: 8 }}>总预估 {data.totalEstimate}h，任务数 {data.taskCount}。</p>
          {commitmentAsync.data ? <p className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>承诺基线：{commitmentAsync.data.estimatedHours}h / {commitmentAsync.data.taskCount} 个任务{commitmentAsync.data.committedByName ? ` · ${commitmentAsync.data.committedByName} 确认` : ''}</p> : sprint.status === 'active' || sprint.status === 'closed' ? <p className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>该迭代尚未形成承诺基线。</p> : null}
          {scopeChangesAsync.data?.length ? <div className="text-secondary" style={{ fontSize: 13, marginTop: 6 }}>范围变更 {scopeChangesAsync.data.length} 次：{scopeChangesAsync.data.slice(0, 2).map((item) => item.reason).filter(Boolean).join('；')}</div> : null}
        </>}
      </div>}
    </div>
  );
}
