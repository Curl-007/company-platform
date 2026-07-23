import { useState } from 'react';
import {
  createStrategicGoal,
  deleteStrategicGoal,
  fetchStrategicGoals,
  updateStrategicGoal,
} from '../api';
import { GOAL_STATUS_LABELS } from '../productModel';
import StrategicGoalForm from './StrategicGoalForm';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { canOperate } from '../../../constants/roles';
import type { StrategicGoal } from '../../../types';

export default function StrategicGoalsTab() {
  const { data, loading, error, reload } = useAsync<StrategicGoal[]>(fetchStrategicGoals, [], { cacheKey: 'strategic-goals:list' });
  const canManageGoals = canOperate(getSessionUser(), 'users:create');
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StrategicGoal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const goals = data ?? [];
  async function remove(goal: StrategicGoal) {
    if (!await confirm({ title: `删除公司目标“${goal.name}”？`, description: '删除后不会删除关联的项目集或产品组合。', confirmText: '删除目标', tone: 'danger' })) return;
    setDeletingId(goal.id);
    try { await deleteStrategicGoal(goal.id); toast.success('公司目标已删除。'); reload(); } catch (reason) { toast.error(reason instanceof ApiError ? reason.message : '删除失败。'); } finally { setDeletingId(null); }
  }
  if (loading || error || !data) return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  return <>
    <Panel title="公司目标 / OKR" subtitle="将公司级目标与项目集、产品组合关联，形成战略到交付的可追溯链路。" toolbar={canManageGoals ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建公司目标</button> : undefined}>
      {goals.length ? <div className="management-list">{goals.map((goal) => <div className="management-list-item" key={goal.id}><span className="management-list-main"><strong>{goal.name}</strong><small>{goal.objective}</small><small>项目集 {goal.programIds.length} · 产品组合 {goal.portfolioIds.length} · 成功标准 {goal.successMetrics.length}</small></span><span className="management-list-side"><StatusBadge status={goal.status} label={GOAL_STATUS_LABELS[goal.status] ?? goal.status} showDot={false} />{canManageGoals ? <span className="flex gap-2"><button className="btn btn-text btn-sm" onClick={() => setEditing(goal)}>编辑</button><button className="btn btn-text btn-sm" disabled={deletingId === goal.id} onClick={() => remove(goal)}>删除</button></span> : null}</span></div>)}</div> : <PageState loading={false} error={null} isEmpty emptyTitle="暂无公司目标" emptyDescription="先建立目标，再关联需要共同推进的项目集或产品组合。" />}
    </Panel>
    {creating && canManageGoals ? <StrategicGoalForm onClose={() => setCreating(false)} onSubmit={async (input) => { await createStrategicGoal(input); toast.success('公司目标已创建。'); setCreating(false); reload(); }} /> : null}
    {editing && canManageGoals ? <StrategicGoalForm initial={editing} onClose={() => setEditing(null)} onSubmit={async (input) => { await updateStrategicGoal(editing.id, input); toast.success('公司目标已更新。'); setEditing(null); reload(); }} /> : null}
  </>;
}
