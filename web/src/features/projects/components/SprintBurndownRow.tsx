import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchSprintBurndown, fetchSprintCommitment, fetchSprintScopeChanges } from '../../tasks/api';
import { useAsync } from '../../../hooks/useAsync';
import BurndownChart from '../../../components/common/BurndownChart';
import StatusBadge from '../../../components/common/StatusBadge';
import { labelOf, SPRINT_STATUS_LABELS } from '../../../constants/enums';
import type { BurndownData, Sprint, SprintCommitment, SprintScopeChange } from '../../../types';

export default function SprintBurndownRow({ sprint }: { sprint: Sprint }) {
  const { t } = useTranslation();
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
        {loading ? <p className="text-secondary" style={{ fontSize: 13 }}>{t('features.projects.sprintBurndownRow.loading')}</p> : error || !data ? <p className="text-secondary" style={{ fontSize: 13 }}>{t('features.projects.sprintBurndownRow.noData')}</p> : <>
          <BurndownChart data={data} height={260} />
          <p className="text-secondary" style={{ fontSize: 13, marginTop: 8 }}>{t('features.projects.sprintBurndownRow.summary', { total: data.totalEstimate, count: data.taskCount })}</p>
          {commitmentAsync.data ? <p className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{t('features.projects.sprintBurndownRow.commitment', { hours: commitmentAsync.data.estimatedHours, count: commitmentAsync.data.taskCount })}{commitmentAsync.data.committedByName ? t('features.projects.sprintBurndownRow.commitmentConfirm', { name: commitmentAsync.data.committedByName }) : ''}</p> : sprint.status === 'active' || sprint.status === 'closed' ? <p className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{t('features.projects.sprintBurndownRow.noCommitment')}</p> : null}
          {scopeChangesAsync.data?.length ? <div className="text-secondary" style={{ fontSize: 13, marginTop: 6 }}>{t('features.projects.sprintBurndownRow.scopeChanges', { count: scopeChangesAsync.data.length, items: scopeChangesAsync.data.slice(0, 2).map((item) => item.reason).filter(Boolean).join('；') })}</div> : null}
        </>}
      </div>}
    </div>
  );
}
