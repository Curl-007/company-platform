import { useState } from 'react';
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
      setError('请完整填写目标名称、负责人和目标说明。');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), owner: owner.trim(), objective: objective.trim(), status, periodStart: periodStart || undefined, periodEnd: periodEnd || undefined, successMetrics: metrics.split('\n').map((item) => item.trim()).filter(Boolean), programIds, portfolioIds });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '保存公司目标失败。');
      setSubmitting(false);
    }
  }

  return <Overlay onClose={onClose}>
    <Panel title={initial ? '编辑公司目标' : '新建公司目标'} subtitle="公司目标用于战略对齐和项目组合治理，不用于个人绩效评价。">
      {error ? <div className="form-error" style={{ marginBottom: 8 }}>{error}</div> : null}
      <div className="form-row"><div className="form-group"><label className="form-label">目标名称</label><input className="form-input" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="form-group"><label className="form-label">负责人</label><input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} /></div></div>
      <div className="form-row"><div className="form-group"><label className="form-label">状态</label><select className="form-select" value={status} disabled={!initial} onChange={(event) => setStatus(event.target.value)}>{Object.entries(GOAL_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="form-group"><label className="form-label">周期</label><div className="form-row"><input className="form-input" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /><input className="form-input" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></div></div></div>
      <div className="form-group"><label className="form-label">目标说明</label><textarea className="form-textarea" rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} /></div>
      <div className="form-group"><label className="form-label">成功标准（每行一项）</label><textarea className="form-textarea" rows={3} value={metrics} onChange={(event) => setMetrics(event.target.value)} /></div>
      <div className="form-group"><label className="form-label">关联项目集</label><div className="management-chip-list">{programs.map((item) => <label className="tag" key={item.id}><input type="checkbox" checked={programIds.includes(item.id)} onChange={() => toggle(item.id, programIds, setProgramIds)} /> {item.name}</label>) || <span className="text-secondary">暂无项目集。</span>}</div></div>
      <div className="form-group"><label className="form-label">关联产品组合</label><div className="management-chip-list">{portfolios.map((item) => <label className="tag" key={item.id}><input type="checkbox" checked={portfolioIds.includes(item.id)} onChange={() => toggle(item.id, portfolioIds, setPortfolioIds)} /> {item.name}</label>) || <span className="text-secondary">暂无产品组合。</span>}</div></div>
      <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button><button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>{submitting ? '保存中…' : '保存'}</button></div>
    </Panel>
  </Overlay>;
}
