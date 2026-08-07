import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchPortfolios,
  fetchPrograms,
  type StrategicGoalInput,
} from '../api';
import { GOAL_STATUS_LABELS } from '../productModel';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import type { Portfolio, Program, StrategicGoal } from '../../../types';

export default function StrategicGoalForm({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: StrategicGoal | null;
  onClose: () => void;
  onSubmit: (input: StrategicGoalInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [owner, setOwner] = useState(initial?.owner ?? getSessionUser()?.name ?? '');
  const [objective, setObjective] = useState(initial?.objective ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'draft');
  const [periodStart, setPeriodStart] = useState(initial?.periodStart ?? '');
  const [periodEnd, setPeriodEnd] = useState(initial?.periodEnd ?? '');
  const [metrics, setMetrics] = useState(initial?.successMetrics.join('\n') ?? '');
  const [programIds, setProgramIds] = useState(initial?.programIds ?? []);
  const [portfolioIds, setPortfolioIds] = useState(initial?.portfolioIds ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const programs = useAsync<Program[]>(fetchPrograms, [], { cacheKey: 'programs:list' }).data ?? [];
  const portfolios = useAsync<Portfolio[]>(fetchPortfolios, [], { cacheKey: 'portfolios:list' }).data ?? [];
  const toggle = (id: string, current: string[], setter: (next: string[]) => void) => setter(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  async function submit() {
    if (!name.trim() || !owner.trim() || !objective.trim()) {
      setError(t('features.products.strategicGoalForm.fillRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), owner: owner.trim(), objective: objective.trim(), status, periodStart: periodStart || undefined, periodEnd: periodEnd || undefined, successMetrics: metrics.split('\n').map((item) => item.trim()).filter(Boolean), programIds, portfolioIds });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('features.products.strategicGoalForm.saveFailed'));
      setSubmitting(false);
    }
  }

  return <Overlay onClose={onClose}>
    <Panel title={initial ? t('features.products.strategicGoalForm.editTitle') : t('features.products.strategicGoalForm.newTitle')} subtitle={t('features.products.strategicGoalForm.formSubtitle')}>
      {error ? <div className="form-error" style={{ marginBottom: 8 }}>{error}</div> : null}
      <div className="form-row"><div className="form-group"><label className="form-label">{t('features.products.strategicGoalForm.nameLabel')}</label><input className="form-input" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="form-group"><label className="form-label">{t('features.products.strategicGoalForm.ownerLabel')}</label><input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} /></div></div>
      <div className="form-row"><div className="form-group"><label className="form-label">{t('features.products.strategicGoalForm.statusLabel')}</label><select className="form-select" value={status} disabled={!initial} onChange={(event) => setStatus(event.target.value)}>{Object.entries(GOAL_STATUS_LABELS).map(([value, labelKey]) => <option key={value} value={value}>{t(labelKey)}</option>)}</select></div><div className="form-group"><label className="form-label">{t('features.products.strategicGoalForm.periodLabel')}</label><div className="form-row"><input className="form-input" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /><input className="form-input" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></div></div></div>
      <div className="form-group"><label className="form-label">{t('features.products.strategicGoalForm.objectiveLabel')}</label><textarea className="form-textarea" rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} /></div>
      <div className="form-group"><label className="form-label">{t('features.products.strategicGoalForm.metricsLabel')}</label><textarea className="form-textarea" rows={3} value={metrics} onChange={(event) => setMetrics(event.target.value)} /></div>
      <div className="form-group"><label className="form-label">{t('features.products.strategicGoalForm.programsLabel')}</label><div className="management-chip-list">{programs.map((item) => <label className="tag" key={item.id}><input type="checkbox" checked={programIds.includes(item.id)} onChange={() => toggle(item.id, programIds, setProgramIds)} /> {item.name}</label>) || <span className="text-secondary">{t('features.products.strategicGoalForm.noPrograms')}</span>}</div></div>
      <div className="form-group"><label className="form-label">{t('features.products.strategicGoalForm.portfoliosLabel')}</label><div className="management-chip-list">{portfolios.map((item) => <label className="tag" key={item.id}><input type="checkbox" checked={portfolioIds.includes(item.id)} onChange={() => toggle(item.id, portfolioIds, setPortfolioIds)} /> {item.name}</label>) || <span className="text-secondary">{t('features.products.strategicGoalForm.noPortfolios')}</span>}</div></div>
      <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button><button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>{submitting ? t('features.products.strategicGoalForm.saving') : t('common.save')}</button></div>
    </Panel>
  </Overlay>;
}
