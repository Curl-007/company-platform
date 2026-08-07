import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync<StrategicGoal[]>(fetchStrategicGoals, [], { cacheKey: 'strategic-goals:list' });
  const canManageGoals = canOperate(getSessionUser(), 'users:create');
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StrategicGoal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const goals = data ?? [];
  async function remove(goal: StrategicGoal) {
    if (!await confirm({ title: t('features.products.strategicGoalsTab.deleteConfirm', { name: goal.name }), description: t('features.products.strategicGoalsTab.deleteConfirmDesc'), confirmText: t('features.products.strategicGoalsTab.deleteGoal'), tone: 'danger' })) return;
    setDeletingId(goal.id);
    try { await deleteStrategicGoal(goal.id); toast.success(t('features.products.strategicGoalsTab.deleted')); reload(); } catch (reason) { toast.error(reason instanceof ApiError ? reason.message : t('features.products.strategicGoalsTab.deleteFailed')); } finally { setDeletingId(null); }
  }
  if (loading || error || !data) return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  return <>
    <Panel title={t('features.products.strategicGoalsTab.title')} subtitle={t('features.products.strategicGoalsTab.subtitle')} toolbar={canManageGoals ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{t('features.products.strategicGoalsTab.new')}</button> : undefined}>
      {goals.length ? <div className="management-list">{goals.map((goal) => <div className="management-list-item" key={goal.id}><span className="management-list-main"><strong>{goal.name}</strong><small>{goal.objective}</small><small>{t('features.products.strategicGoalsTab.goalSummary', { programs: goal.programIds.length, portfolios: goal.portfolioIds.length, metrics: goal.successMetrics.length })}</small></span><span className="management-list-side"><StatusBadge status={goal.status} label={t(GOAL_STATUS_LABELS[goal.status]) || goal.status} showDot={false} />{canManageGoals ? <span className="flex gap-2"><button className="btn btn-text btn-sm" onClick={() => setEditing(goal)}>{t('common.edit')}</button><button className="btn btn-text btn-sm" disabled={deletingId === goal.id} onClick={() => remove(goal)}>{t('common.delete')}</button></span> : null}</span></div>)}</div> : <PageState loading={false} error={null} isEmpty emptyTitle={t('features.products.strategicGoalsTab.emptyTitle')} emptyDescription={t('features.products.strategicGoalsTab.emptyDescription')} />}
    </Panel>
    {creating && canManageGoals ? <StrategicGoalForm onClose={() => setCreating(false)} onSubmit={async (input) => { await createStrategicGoal(input); toast.success(t('features.products.strategicGoalsTab.created')); setCreating(false); reload(); }} /> : null}
    {editing && canManageGoals ? <StrategicGoalForm initial={editing} onClose={() => setEditing(null)} onSubmit={async (input) => { await updateStrategicGoal(editing.id, input); toast.success(t('features.products.strategicGoalsTab.updated')); setEditing(null); reload(); }} /> : null}
  </>;
}
